from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
import asyncio
import subprocess
import threading
import socket
import os
import json
import datetime
import time
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
import sys
# api.py'nin bulunduğu dizini arama yoluna ekle
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Dynamic packages directory in user AppData (allows updating yt-dlp at runtime)
USER_DATA_DIR = os.path.join(os.path.expanduser('~'), 'AppData', 'Roaming', 'Miku Tool')
PACKAGES_DIR = os.path.join(USER_DATA_DIR, 'packages')
if not os.path.exists(PACKAGES_DIR):
    try:
        os.makedirs(PACKAGES_DIR)
    except:
        pass
if os.path.exists(PACKAGES_DIR) and PACKAGES_DIR not in sys.path:
    sys.path.insert(0, PACKAGES_DIR)

try:
    from engine import downloader, tagger
except ModuleNotFoundError:
    import downloader, tagger

CONFIG_FILE = "config.json"

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Log dosyasını kullanıcının AppData dizinine yaz (kurulum sonrası tutarlı)
LOG_FILE = os.path.join(USER_DATA_DIR, 'debug.log')
try:
    os.makedirs(USER_DATA_DIR, exist_ok=True)
except Exception:
    pass

def log_api(message):
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"[{datetime.datetime.now()}] API: {message}\n")
    except Exception:
        pass

log_api("Python backend başlatıldı.")


def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'


HISTORY_FILE = "history.json"

def get_config():
    base = {
        "download_path": os.path.join(os.path.expanduser('~'), 'Downloads'),
        "cookie_browser": "none",
        "match_threshold": 60,
    }
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r") as f:
            base.update(json.load(f))
    return base


def save_config(config):
    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f)


def load_history():
    """history.json dosyasından geçmişi yükle."""
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return []


def save_history_entry(url, info):
    """Tek bir indirme kaydını history.json'a ekle/güncelle (en fazla 200 kayıt)."""
    try:
        history = load_history()
        # Varsa güncelle
        existing_idx = next((i for i, h in enumerate(history) if h.get('url') == url), None)
        entry = {**info, 'url': url}
        if existing_idx is not None:
            history[existing_idx] = entry
        else:
            history.insert(0, entry)
        # Maks 200 kayıt
        history = history[:200]
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(history, f, ensure_ascii=False)
    except Exception as e:
        log_api(f"Geçmiş kaydetme hatası: {e}")


# --- Request Models ---

class DownloadRequest(BaseModel):
    url: str
    format: str = 'mp3'
    quality: str = 'best'
    output_dir: str = 'downloads'
    cookie_browser: str = 'none'

class MetadataRequest(BaseModel):
    file_path: str
    title: str = None
    artist: str = None
    album: str = None

class CancelRequest(BaseModel):
    url: str

class ConfirmRequest(BaseModel):
    url: str
    approved: bool

class ConfigRequest(BaseModel):
    download_path: str = None
    cookie_browser: str = 'none'
    spotify_client_id: str = None
    spotify_client_secret: str = None
    match_threshold: int = 60


# --- Endpoints ---

@app.post("/api/download")
async def start_download(req: DownloadRequest):
    log_api(f"İndirme isteği kuyruğa eklendi: {req.url}")
    downloader.add_to_queue(
        req.url, req.format, req.quality, req.output_dir, req.cookie_browser
    )
    return {"status": "queued", "url": req.url}


@app.post("/api/cancel")
async def cancel_download(req: CancelRequest):
    log_api(f"İptal isteği: {req.url}")
    downloader.request_cancel(req.url)
    return {"status": "request_sent", "url": req.url}


@app.post("/api/confirm")
async def confirm_download(req: ConfirmRequest):
    log_api(f"Onay cevabı geldi: {req.url} -> {req.approved}")
    if req.url in downloader.confirmation_events:
        downloader.confirmation_results[req.url] = req.approved
        downloader.confirmation_events[req.url].set()
        return {"status": "success"}
    return {"status": "error", "message": "Bekleyen onay bulunamadı."}


@app.get("/api/info")
async def get_info(url: str):
    try:
        info = downloader.get_video_info(url)
        return {"status": "success", "title": info.get('title'), "thumbnail": info.get('thumbnail'), "duration": info.get('duration')}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/api/metadata")
async def edit_metadata(req: MetadataRequest):
    return tagger.edit_metadata(req.file_path, req.title, req.artist, req.album)


@app.get("/api/config")
async def config_get():
    conf = get_config()
    conf['has_spotify_credentials'] = os.path.exists(
        os.path.join(USER_DATA_DIR, "credentials.json")
    )
    conf['ip'] = get_local_ip()
    return conf


@app.post("/api/config")
async def config_post(req: ConfigRequest):
    conf = get_config()
    if req.download_path:
        conf['download_path'] = req.download_path
    conf['cookie_browser'] = req.cookie_browser
    conf['spotify_client_id'] = req.spotify_client_id
    conf['spotify_client_secret'] = req.spotify_client_secret
    conf['match_threshold'] = req.match_threshold
    save_config(conf)
    return {"status": "success"}


@app.post("/api/clear_progress")
async def clear_progress():
    """Clears all download progress entries from memory and file."""
    downloader.download_progress.clear()
    # Dosyayı da temizle
    try:
        if os.path.exists(HISTORY_FILE):
            os.remove(HISTORY_FILE)
    except Exception:
        pass
    log_api("İndirme geçmişi temizlendi.")
    return {"status": "success"}


@app.get("/api/history")
async def get_history():
    now = time.time()
    # Mark stale in-progress entries as error
    for u, info in downloader.download_progress.items():
        if info.get('status') in ('searching', 'downloading', 'expanding', 'needs_confirmation'):
            if now - info.get('last_seen', now) > 60:
                info['status'] = 'error'
                info['message'] = 'Zaman aşımı — işlem durdu.'

    # RAM'deki biten/hatalı indirmeleri dosyaya kaydet
    for url, info in downloader.download_progress.items():
        if info.get('status') in ('finished', 'error'):
            save_history_entry(url, info)

    # Dosyadan yükle + RAM'deki aktif indirmeleri üste ekle
    file_history = load_history()
    active = [
        {**info, 'url': url}
        for url, info in downloader.download_progress.items()
        if info.get('status') not in ('finished', 'error')
    ]
    return active + file_history


@app.post("/api/update_ytdlp")
async def update_ytdlp():
    import urllib.request
    import json
    import zipfile
    import io
    import sys
    import importlib
    
    try:
        # 1. Fetch latest metadata from PyPI
        pypi_url = "https://pypi.org/pypi/yt-dlp/json"
        req = urllib.request.Request(pypi_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode('utf-8'))
        
        version = data['info']['version']
        
        # Find wheel download URL — prefer pure-Python (none) wheel for portability
        whl_url = None
        for file_info in data['urls']:
            fname = file_info.get('filename', '')
            if fname.endswith('.whl') and 'none-any' in fname:
                whl_url = file_info['url']
                break
        # Fallback: any .whl
        if not whl_url:
            for file_info in data['urls']:
                if file_info.get('filename', '').endswith('.whl'):
                    whl_url = file_info['url']
                    break
                
        if not whl_url:
            return {"status": "error", "output": "PyPI üzerinde uygun .whl dosyası bulunamadı."}
            
        log_api(f"yt-dlp {version} indiriliyor: {whl_url}")
        
        # 2. Download the wheel file into memory
        whl_req = urllib.request.Request(whl_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(whl_req) as response:
            whl_bytes = response.read()
            
        # 3. Extract contents to PACKAGES_DIR
        with zipfile.ZipFile(io.BytesIO(whl_bytes)) as zip_ref:
            zip_ref.extractall(PACKAGES_DIR)
            
        log_api(f"yt-dlp başarıyla {version} sürümüne güncellendi.")
        
        # 4. Best-effort: reload all yt_dlp submodules in this process.
        # Full effect requires an app restart (new process picks up PACKAGES_DIR cleanly).
        try:
            ytdlp_modules = sorted(
                [k for k in sys.modules if k == 'yt_dlp' or k.startswith('yt_dlp.')],
                key=lambda x: x.count('.'),  # deepest modules first
                reverse=True
            )
            reloaded = 0
            for mod_name in ytdlp_modules:
                try:
                    importlib.reload(sys.modules[mod_name])
                    reloaded += 1
                except Exception:
                    pass
            log_api(f"yt-dlp: {reloaded}/{len(ytdlp_modules)} modül yeniden yüklendi.")
        except Exception as reload_err:
            log_api(f"Modül yeniden yükleme uyarısı: {reload_err}")
            
        return {
            "status": "success",
            "output": f"yt-dlp {version} sürümüne güncellendi. Değişikliklerin tam olarak geçerli olması için uygulamayı yeniden başlatın."
        }
        
    except Exception as e:
        log_api(f"Güncelleme hatası: {e}")
        return {"status": "error", "output": f"Güncelleme başarısız: {str(e)}"}


@app.get("/api/ip")
async def get_ip():
    """Her çağrıda güncel yerel IP döndürür (DHCP/ağ değişimlerinde güncel kalır)."""
    return {"ip": get_local_ip()}


# --- Log Viewer Endpoints ---
# LOG_FILE artık yukarıda USER_DATA_DIR altında tanımlanıyor

@app.get("/api/logs")
async def get_logs(lines: int = 100):
    """
    debug.log dosyasının son N satırını döndürür.
    Frontend'den anlık log görüntüleme için kullanılır.
    lines: Kaç satır okunacağını belirler (varsayılan 100, max 500)
    """
    lines = min(lines, 500)  # Güvenlik için üst sınır
    try:
        if not os.path.exists(LOG_FILE):
            return {"status": "success", "lines": [], "total_size": 0}
        
        file_size = os.path.getsize(LOG_FILE)
        
        with open(LOG_FILE, "r", encoding="utf-8", errors="replace") as f:
            all_lines = f.readlines()
        
        # Son N satırı al ve temizle
        recent = [line.rstrip("\n") for line in all_lines[-lines:]]
        
        return {
            "status": "success",
            "lines": recent,
            "total_lines": len(all_lines),
            "total_size": file_size,
        }
    except Exception as e:
        log_api(f"Log okuma hatası: {e}")
        return {"status": "error", "message": str(e), "lines": []}


@app.post("/api/logs/clear")
async def clear_logs():
    """
    debug.log dosyasını temizler.
    Eski logları silip sıfırlama yapar.
    """
    try:
        with open(LOG_FILE, "w", encoding="utf-8") as f:
            f.write(f"[{datetime.datetime.now()}] API: Loglar temizlendi.\n")
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/api/files/{filename:path}")
async def get_file(filename: str):
    conf = get_config()
    configured_path = conf.get('download_path', 'downloads')

    # Build candidate paths to search
    candidate_dirs = []

    # 1. The configured download path (prefer absolute)
    if os.path.isabs(configured_path):
        candidate_dirs.append(configured_path)
    else:
        # Both relative and absolute resolved version
        candidate_dirs.append(configured_path)
        candidate_dirs.append(os.path.abspath(configured_path))

    # 2. Fallback: relative 'downloads' folder
    candidate_dirs.append(os.path.abspath('downloads'))

    # 3. Fallback: user's system Downloads folder
    candidate_dirs.append(os.path.join(os.path.expanduser('~'), 'Downloads'))

    for directory in candidate_dirs:
        file_path = os.path.join(directory, filename)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            log_api(f"Dosya bulundu: {file_path}")
            return FileResponse(
                file_path,
                filename=os.path.basename(filename)
            )

    log_api(f"Dosya bulunamadı: {filename} (bakılan klasörler: {candidate_dirs})")
    return JSONResponse({"error": "Dosya bulunamadı", "filename": filename}, status_code=404)


# --- WebSocket ---

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        try:
            await websocket.accept()
            self.active_connections.append(websocket)
            log_api(f"İstemci bağlandı. Toplam: {len(self.active_connections)}")
            return True
        except Exception as e:
            log_api(f"WebSocket Bağlantı Hatası (Accept): {e}")
            return False

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            log_api(f"İstemci ayrıldı. Kalan: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        for conn in self.active_connections:
            try:
                await conn.send_json(message)
            except Exception:
                pass

manager = ConnectionManager()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    success = await manager.connect(websocket)
    if not success:
        return

    try:
        while True:
            # Sadece bu bağlantıya güncel progress'i gönder (broadcast her loop'ta gereksiz)
            if downloader.download_progress:
                try:
                    await websocket.send_json(downloader.download_progress)
                except Exception:
                    break # Gönderilemiyorsa bağlantı kopmuş olabilir

            # Bağlantı durumunu kontrol et ve disconnect'i yakala
            try:
                # receive_text() bağlantı koptuğunda hata fırlatır
                await asyncio.wait_for(websocket.receive_text(), timeout=1.0)
            except asyncio.TimeoutError:
                # Timeout normal, döngü devam eder
                pass
            except Exception:
                # Disconnect veya diğer hatalar
                break

            await asyncio.sleep(0.5) # CPU kullanımını azaltmak için kısa bekleme
    except Exception as e:
        # Sessizce kapat (log kirliliği yapmamak için)
        pass
    finally:
        manager.disconnect(websocket)


# --- Search ---

@app.get("/api/search")
async def search_multi(q: str):
    if not q:
        return []
    log_api(f"Çoklu arama: {q}")
    sp_results = []
    yt_results = []
    sc_results = []

    def search_yt():
        try:
            opts = {'quiet': True, 'no_warnings': True, 'extract_flat': True, 'skip_download': True}
            with downloader.yt_dlp.YoutubeDL(opts) as ydl:
                res = ydl.extract_info(f"ytsearch3:{q}", download=False)
                for entry in (res.get('entries') or []):
                    if not entry: continue
                    yt_results.append({
                        "id": entry.get('id'),
                        "title": entry.get('title'),
                        "url": f"https://www.youtube.com/watch?v={entry.get('id')}",
                        "thumbnail": f"https://i.ytimg.com/vi/{entry.get('id')}/hqdefault.jpg",
                        "duration": entry.get('duration'),
                        "uploader": entry.get('uploader'),
                        "platform": "youtube"
                    })
        except Exception as e:
            log_api(f"YT Arama hatası: {e}")

    def search_sc():
        try:
            opts = {'quiet': True, 'no_warnings': True, 'skip_download': True}
            with downloader.yt_dlp.YoutubeDL(opts) as ydl:
                res = ydl.extract_info(f"scsearch3:{q}", download=False)
                for entry in (res.get('entries') or []):
                    if not entry: continue
                    sc_results.append({
                        "id": entry.get('id'),
                        "title": entry.get('title'),
                        "url": entry.get('webpage_url') or entry.get('url'),
                        "thumbnail": entry.get('thumbnail'),
                        "duration": entry.get('duration'),
                        "uploader": entry.get('uploader'),
                        "platform": "soundcloud"
                    })
        except Exception as e:
            log_api(f"SC Arama hatası: {e}")

    def search_sp():
        try:
            client_id, client_secret = downloader.get_spotify_credentials()
            if client_id and client_secret:
                sp = spotipy.Spotify(auth_manager=SpotifyClientCredentials(
                    client_id=client_id, client_secret=client_secret
                ))
            else:
                token = downloader.get_spotify_token()
                if not token:
                    return
                sp = spotipy.Spotify(auth=token, retries=0, status_retries=0)

            res = sp.search(q=q, limit=3, type='track')
            for track in res['tracks']['items']:
                sp_results.append({
                    "id": track['id'],
                    "title": f"{track['artists'][0]['name']} - {track['name']}",
                    "url": track['external_urls']['spotify'],
                    "thumbnail": track['album']['images'][0]['url'] if track['album']['images'] else None,
                    "duration": track['duration_ms'] / 1000,
                    "uploader": track['album']['name'],
                    "platform": "spotify"
                })
        except Exception as e:
            log_api(f"SP Arama hatası: {e}")

    await asyncio.gather(
        asyncio.to_thread(search_yt),
        asyncio.to_thread(search_sc),
        asyncio.to_thread(search_sp),
    )

    # Spotify önce, sonra YouTube, sonra SoundCloud
    return sp_results + yt_results + sc_results


# --- Spotify Connect (ZeroConf) ---

@app.post("/api/spotify-connect")
async def connect_spotify():
    def run_zeroconf():
        from librespot.core import Session
        from librespot.zeroconf import ZeroconfServer
        from librespot.structure import SessionListener
        import shutil, base64
        from pathlib import Path

        connected_session = [None]
        session_event = threading.Event()

        class AuthListener(SessionListener):
            def session_changed(self, session: Session):
                connected_session[0] = session
                session_event.set()
                log_api("ZeroConf: telefon bağlandı!")

            def session_closing(self, session: Session):
                pass

        server = None
        try:
            log_api("ZeroConf başlatıldı. Eşleşme bekleniyor...")
            server = ZeroconfServer.Builder().set_device_name("MikuTool").create()
            server.add_session_listener(AuthListener())
            session_event.wait(timeout=90)

            session = connected_session[0]
            if session is None:
                raise Exception("Bağlantı zaman aşımına uğradı. Telefon veya PC aynı ağda mı?")

            stored = session.stored()
            if not stored:
                raise Exception("Oturum alındı fakat kimlik bilgisi boş geldi. Premium hesap gerekebilir.")

            # Decode Base64 if needed
            try:
                stored_decoded = base64.b64decode(stored).decode('utf-8')
                json.loads(stored_decoded)
            except Exception:
                stored_decoded = stored

            # Save credentials
            os.makedirs(USER_DATA_DIR, exist_ok=True)
            cred_file = os.path.join(USER_DATA_DIR, "credentials.json")
            with open(cred_file, 'w', encoding='utf-8') as f:
                f.write(stored_decoded)

            # Also copy to Zotify's AppData path
            zotify_dir = Path.home() / 'AppData' / 'Roaming' / 'Zotify'
            zotify_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(cred_file, zotify_dir / 'credentials.json')

            log_api(f"ZeroConf kimlik bilgileri kaydedildi: {cred_file}")
            # Eski Librespot oturumunu ve token önbelleğini temizle
            downloader.invalidate_librespot_session()
            downloader._spotify_token_cache["token"] = None
            downloader._spotify_token_cache["expires"] = 0
            return True

        except Exception as e:
            log_api(f"ZeroConf başarısız: {e}")
            raise
        finally:
            if server:
                try:
                    server.close()
                except Exception:
                    pass

    try:
        await asyncio.to_thread(run_zeroconf)
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
