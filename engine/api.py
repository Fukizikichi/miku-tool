from fastapi import FastAPI, WebSocket, Request
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

def get_user_data_dir() -> str:
    """Evrensel kullanıcı veri dizinini döndürür."""
    if sys.platform == 'win32':
        base = os.environ.get('APPDATA') or os.path.join(os.path.expanduser('~'), 'AppData', 'Roaming')
        return os.path.join(base, 'Miku Tool')
    elif sys.platform == 'darwin':
        return os.path.expanduser('~/Library/Application Support/Miku Tool')
    else:
        base = os.environ.get('XDG_CONFIG_HOME') or os.path.expanduser('~/.config')
        return os.path.join(base, 'miku-tool')

USER_DATA_DIR = get_user_data_dir()
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

CONFIG_FILE = os.path.join(USER_DATA_DIR, "config.json")

ALLOWED_BROWSERS = {
    'none', 'chrome', 'firefox', 'edge', 'opera', 'brave', 'chromium', 'vivaldi', 'safari'
}

_zeroconf_lock = threading.Lock()

app = FastAPI()

# Gelişmiş CORS yapılandırması: Sadece yerel istemcilere ve Electron'a izin ver
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^(http://(localhost|127\.0\.0\.1)(:\d+)?|file://.*|null)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def security_firewall_middleware(request: Request, call_next):
    client_ip = request.client.host if request.client else "127.0.0.1"
    path = request.url.path

    # LAN Güvenlik Duvarı:
    # Telefonla QR kod üzerinden parça indirme (/api/files/*) haricinde, dış ağdan gelen tüm istekler engellenir.
    # Yönetim, ayarlar, indirme başlatma veya log okuma dış ağa kesinlikle kapalıdır.
    is_localhost = client_ip in ("127.0.0.1", "::1", "localhost")
    if not is_localhost and not path.startswith("/api/files/"):
        log_api(f"Güvenlik Uyarısı: Harici IP ({client_ip}) yetkisiz uç noktaya erişmeye çalıştı ({path}) - Engellendi.")
        return JSONResponse(
            {"error": "Erişim engellendi. Harici ağ erişimi sadece QR kod dosya indirme için geçerlidir."},
            status_code=403
        )

    # Tarayıcı CSRF / Origin Koruması:
    origin = request.headers.get("origin")
    if origin and origin != "null":
        allowed = any(
            origin.startswith(prefix) for prefix in [
                "http://localhost",
                "http://127.0.0.1",
                "file://",
            ]
        )
        if not allowed and not path.startswith("/api/files/"):
            log_api(f"Güvenlik Uyarısı: Yetkisiz Origin ({origin}) engellendi.")
            return JSONResponse({"error": "Geçersiz veya yetkisiz Origin."}, status_code=403)

    return await call_next(request)


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


_cached_local_ip: str | None = None

def get_local_ip() -> str:
    """Yerel IP adresini döndürür; başlangıçta bir kez hesaplanır ve önbelleğe alınır."""
    global _cached_local_ip
    if _cached_local_ip:
        return _cached_local_ip
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        _cached_local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        _cached_local_ip = '127.0.0.1'
    return _cached_local_ip


HISTORY_FILE = os.path.join(USER_DATA_DIR, "history.json")

def get_config():
    default_downloads = os.path.join(os.path.expanduser('~'), 'Downloads')
    base = {
        "download_path": default_downloads,
        "cookie_browser": "none",
        "match_threshold": 60,
    }
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                base.update(json.load(f))
        except Exception:
            pass
    # Geçersiz veya erişilemeyen download_path varsa otomatik düzelt
    dl_path = base.get("download_path")
    if not dl_path or not os.path.exists(dl_path):
        try:
            os.makedirs(dl_path, exist_ok=True)
        except Exception:
            base["download_path"] = default_downloads
    return base


def save_config(config):
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)


def get_allowed_download_dirs() -> list[str]:
    """Uygulamanın dosya okuma ve yazma iznine sahip olduğu güvenli indirme dizinlerini listeler."""
    conf = get_config()
    configured_path = conf.get('download_path', 'downloads')
    dirs = []
    if os.path.isabs(configured_path):
        dirs.append(os.path.realpath(os.path.abspath(configured_path)))
    else:
        dirs.append(os.path.realpath(os.path.abspath(configured_path)))
    dirs.append(os.path.realpath(os.path.abspath('downloads')))
    dirs.append(os.path.realpath(os.path.abspath(os.path.join(os.path.expanduser('~'), 'Downloads'))))
    seen = set()
    unique_dirs = []
    for d in dirs:
        if d not in seen:
            seen.add(d)
            unique_dirs.append(d)
    return unique_dirs


def is_safe_path(base_dir: str, target_path: str) -> bool:
    """Hedef yolun belirtilen kök dizinin sınırları içinde olup olmadığını doğrular (Path Traversal önlemi)."""
    try:
        base = os.path.realpath(os.path.abspath(base_dir))
        target = os.path.realpath(os.path.abspath(target_path))
        return os.path.commonpath([base, target]) == base and target != base
    except Exception:
        return False


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
    # Giriş doğrulaması (Input Sanitization)
    fmt = 'mp3' if req.format == 'mp3' else 'mp4'
    quality = 'standard' if req.quality == 'standard' else 'best'
    browser = req.cookie_browser if req.cookie_browser in ALLOWED_BROWSERS else 'none'
    safe_output_dir = downloader.resolve_output_dir(req.output_dir)

    log_api(f"İndirme isteği kuyruğa eklendi: {req.url} ({fmt}, {quality})")
    downloader.add_to_queue(
        req.url, fmt, quality, safe_output_dir, browser
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
    if not req.file_path or '\0' in req.file_path:
        return JSONResponse({"error": "Geçersiz dosya yolu."}, status_code=400)

    # İzin verilen indirme klasörleri dışındaki sistem dosyalarını değiştirmeyi engelle
    allowed_dirs = get_allowed_download_dirs()
    if not any(is_safe_path(d, req.file_path) for d in allowed_dirs):
        log_api(f"Güvenlik Uyarısı: İzin verilmeyen metadata düzenleme yolu: {req.file_path}")
        return JSONResponse(
            {"error": "Güvenlik hatası: Sadece indirme klasöründeki dosyaların etiketleri düzenlenebilir."},
            status_code=403
        )

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
        clean_path = os.path.abspath(os.path.expanduser(req.download_path.strip()))
        conf['download_path'] = clean_path

    # Tarayıcı çerez beyaz listesi kontrolü
    if req.cookie_browser in ALLOWED_BROWSERS:
        conf['cookie_browser'] = req.cookie_browser
    else:
        conf['cookie_browser'] = 'none'

    # None gelen değerler mevcut geçerli kimlik bilgilerinin üzerine yazmamalı
    if req.spotify_client_id is not None:
        conf['spotify_client_id'] = req.spotify_client_id.strip() if req.spotify_client_id else None
    if req.spotify_client_secret is not None:
        conf['spotify_client_secret'] = req.spotify_client_secret.strip() if req.spotify_client_secret else None
    
    conf['match_threshold'] = max(10, min(100, int(req.match_threshold or 60)))
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
            
        # 3. Extract contents to PACKAGES_DIR safely (Zip Slip koruması)
        with zipfile.ZipFile(io.BytesIO(whl_bytes)) as zip_ref:
            target_base = os.path.realpath(os.path.abspath(PACKAGES_DIR))
            for member in zip_ref.infolist():
                member_path = os.path.realpath(os.path.abspath(os.path.join(target_base, member.filename)))
                if not (member_path == target_base or member_path.startswith(target_base + os.sep)):
                    raise Exception(f"Güvenlik uyarısı: Zip dosyası dizin atlama içeriyor: {member.filename}")
            zip_ref.extractall(target_base)
            
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
    # 1. Null byte ve boşluk kontrolü
    if not filename or '\0' in filename:
        return JSONResponse({"error": "Geçersiz dosya adı."}, status_code=400)

    # 2. Mutlak yol ve Windows sürücü harfi kontrolü (örn. C:\Windows\win.ini)
    if os.path.isabs(filename) or (len(filename) > 1 and filename[1] == ':'):
        log_api(f"Güvenlik Uyarısı: Mutlak yol ile sızma girişimi engellendi: {filename}")
        return JSONResponse({"error": "Güvenlik hatası: Mutlak yol belirtilemez."}, status_code=400)

    # 3. Dizin atlama (..) kontrolü (Path Traversal engeli)
    clean_parts = [p for p in filename.replace('\\', '/').split('/') if p and p != '.']
    if any(p == '..' for p in clean_parts):
        log_api(f"Güvenlik Uyarısı: Dizin atlama (..) girişimi engellendi: {filename}")
        return JSONResponse({"error": "Güvenlik hatası: Dizin atlama kullanılamaz."}, status_code=403)

    safe_rel_path = os.path.join(*clean_parts) if clean_parts else ""
    if not safe_rel_path:
        return JSONResponse({"error": "Geçersiz dosya adı."}, status_code=400)

    candidate_dirs = get_allowed_download_dirs()

    for directory in candidate_dirs:
        file_path = os.path.join(directory, safe_rel_path)
        if is_safe_path(directory, file_path) and os.path.isfile(file_path):
            log_api(f"Dosya güvenle sunuldu: {file_path}")
            return FileResponse(
                file_path,
                filename=os.path.basename(file_path)
            )

    log_api(f"Dosya bulunamadı veya erişim engellendi: {filename}")
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

    last_sent_snapshot: str = ""

    try:
        while True:
            # Sadece veri değiştiğinde gönder — gereksiz CPU ve ağ kullanımını önler
            if downloader.download_progress:
                try:
                    current_snapshot = json.dumps(downloader.download_progress, sort_keys=True)
                    if current_snapshot != last_sent_snapshot:
                        await websocket.send_json(downloader.download_progress)
                        last_sent_snapshot = current_snapshot
                except Exception:
                    break  # Gönderilemiyorsa bağlantı kopmuş

            # Bağlantı durumunu kontrol et
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=1.0)
            except asyncio.TimeoutError:
                pass
            except Exception:
                break

            await asyncio.sleep(0.5)
    except Exception:
        pass
    finally:
        manager.disconnect(websocket)


# --- Search Optimization & Caching ---
import requests
import re

_search_cache = {}
_search_cache_lock = threading.Lock()
_SEARCH_CACHE_TTL = 300  # 5 dakika onbellek
_SEARCH_CACHE_MAX = 200

# Persistent HTTP Sessions for ultra-low latency (<500ms)
_s_yt = requests.Session()
_s_yt.headers.update({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Content-Type': 'application/json',
})

_s_sc = requests.Session()
_s_sc.headers.update({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
})

_sc_client_id = "N5nHxilyZaG4XKY57pV0M6qx6JysgIFW"
_sc_client_id_lock = threading.Lock()

_ydl_yt_instance = None
_ydl_sc_instance = None
_ydl_yt_lock = threading.Lock()
_ydl_sc_lock = threading.Lock()

_cached_sp_client = None
_cached_sp_keys = None

def get_yt_search_ydl():
    global _ydl_yt_instance
    if _ydl_yt_instance is None:
        opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,
            'skip_download': True,
            'socket_timeout': 4,
        }
        _ydl_yt_instance = downloader.yt_dlp.YoutubeDL(opts)
    return _ydl_yt_instance

def get_sc_search_ydl():
    global _ydl_sc_instance
    if _ydl_sc_instance is None:
        opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,
            'skip_download': True,
            'socket_timeout': 4,
        }
        _ydl_sc_instance = downloader.yt_dlp.YoutubeDL(opts)
    return _ydl_sc_instance

def get_sc_client_id():
    global _sc_client_id
    if _sc_client_id:
        return _sc_client_id
    with _sc_client_id_lock:
        if _sc_client_id:
            return _sc_client_id
        try:
            html = _s_sc.get('https://soundcloud.com', timeout=3).text
            scripts = re.findall(r'src="(https://a-v2\.sndcdn\.com/assets/[^"]+\.js)"', html)
            for script in scripts[-4:]:
                js = _s_sc.get(script, timeout=3).text
                m = re.search(r'client_id:"([a-zA-Z0-9]{32})"', js)
                if m:
                    _sc_client_id = m.group(1)
                    return _sc_client_id
        except Exception:
            pass
        _sc_client_id = "N5nHxilyZaG4XKY57pV0M6qx6JysgIFW"
        return _sc_client_id

def get_spotify_search_client():
    global _cached_sp_client, _cached_sp_keys
    client_id, client_secret = downloader.get_spotify_credentials()
    if client_id and client_secret:
        if _cached_sp_client is None or _cached_sp_keys != (client_id, client_secret):
            try:
                auth_mgr = SpotifyClientCredentials(client_id=client_id, client_secret=client_secret)
                _cached_sp_client = spotipy.Spotify(auth_manager=auth_mgr, retries=0, status_retries=0)
                _cached_sp_keys = (client_id, client_secret)
            except Exception as e:
                log_api(f"Spotify client olusturma hatasi: {e}")
                return None
        return _cached_sp_client
    
    token = downloader.get_spotify_token()
    if token:
        return spotipy.Spotify(auth=token, retries=0, status_retries=0)
    return None

# --- Search ---

@app.get("/api/search")
async def search_multi(q: str):
    if not q:
        return []
    clean_q = q.strip().lower()
    if len(clean_q) < 2:
        return []

    # 1. Onbellek kontrolu (aninda yanit <1ms)
    now = time.time()
    with _search_cache_lock:
        cached = _search_cache.get(clean_q)
        if cached and (now - cached['time'] < _SEARCH_CACHE_TTL):
            log_api(f"Arama onbellekten getirildi: {clean_q}")
            return cached['data']

    log_api(f"Hizli coklu arama: {q}")
    sp_results = []
    yt_results = []
    sc_results = []

    def search_yt():
        # Once ultra hizli YouTube InnerTube API dene (~0.4s)
        try:
            payload = {
                'context': {
                    'client': {
                        'clientName': 'WEB',
                        'clientVersion': '2.20240101.00.00',
                        'hl': 'tr',
                        'gl': 'TR'
                    }
                },
                'query': q
            }
            r = _s_yt.post('https://www.youtube.com/youtubei/v1/search', json=payload, timeout=2.5)
            if r.status_code == 200:
                data = r.json()
                contents = data.get('contents', {}).get('twoColumnSearchResultsRenderer', {}).get('primaryContents', {}).get('sectionListRenderer', {}).get('contents', [])
                for section in contents:
                    item_section = section.get('itemSectionRenderer', {}).get('contents', [])
                    for item in item_section:
                        if 'videoRenderer' in item:
                            vr = item['videoRenderer']
                            vid = vr.get('videoId')
                            if not vid: continue
                            title = vr.get('title', {}).get('runs', [{}])[0].get('text', '')
                            channel = vr.get('ownerText', {}).get('runs', [{}])[0].get('text', 'YouTube')
                            thumbs = vr.get('thumbnail', {}).get('thumbnails', [])
                            thumb = thumbs[-1].get('url') if thumbs else f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"
                            
                            duration_sec = None
                            length_text = vr.get('lengthText', {}).get('simpleText')
                            if length_text:
                                parts = length_text.split(':')
                                try:
                                    if len(parts) == 2:
                                        duration_sec = int(parts[0]) * 60 + int(parts[1])
                                    elif len(parts) == 3:
                                        duration_sec = int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
                                except:
                                    pass
                            
                            yt_results.append({
                                "id": vid,
                                "title": title,
                                "url": f"https://www.youtube.com/watch?v={vid}",
                                "thumbnail": thumb,
                                "duration": duration_sec,
                                "uploader": channel,
                                "platform": "youtube"
                            })
                            if len(yt_results) >= 3:
                                return
                if yt_results:
                    return
        except Exception as e:
            log_api(f"YT InnerTube hatasi, ydl fallback: {e}")

        # Fallback: yt-dlp flat extract
        try:
            ydl = get_yt_search_ydl()
            with _ydl_yt_lock:
                res = ydl.extract_info(f"ytsearch3:{q}", download=False)
            for entry in (res.get('entries') or []):
                if not entry: continue
                entry_id = entry.get('id')
                thumbs = entry.get('thumbnails') or []
                thumb = thumbs[-1].get('url') if thumbs else entry.get('thumbnail')
                if not thumb and entry_id:
                    thumb = f"https://i.ytimg.com/vi/{entry_id}/hqdefault.jpg"
                yt_results.append({
                    "id": entry_id,
                    "title": entry.get('title'),
                    "url": f"https://www.youtube.com/watch?v={entry_id}",
                    "thumbnail": thumb,
                    "duration": entry.get('duration'),
                    "uploader": entry.get('uploader'),
                    "platform": "youtube"
                })
        except Exception as e:
            log_api(f"YT ydl hatasi: {e}")

    def search_sc():
        # Once dogrudan SoundCloud API v2 dene (~0.2s)
        try:
            cid = get_sc_client_id()
            if cid:
                r = _s_sc.get('https://api-v2.soundcloud.com/search/tracks', params={'q': q, 'client_id': cid, 'limit': 3}, timeout=2.5)
                if r.status_code == 200:
                    data = r.json()
                    for track in data.get('collection', []):
                        artwork = track.get('artwork_url')
                        if artwork:
                            artwork = artwork.replace('-large', '-t500x500')
                        else:
                            artwork = track.get('user', {}).get('avatar_url')
                        duration = (track.get('duration') or 0) / 1000.0
                        sc_results.append({
                            "id": str(track.get('id')),
                            "title": track.get('title'),
                            "url": track.get('permalink_url'),
                            "thumbnail": artwork,
                            "duration": duration,
                            "uploader": track.get('user', {}).get('username', 'SoundCloud'),
                            "platform": "soundcloud"
                        })
                        if len(sc_results) >= 3:
                            return
                    if sc_results:
                        return
        except Exception as e:
            log_api(f"SC API hatasi, ydl fallback: {e}")

        # Fallback: yt-dlp flat extract
        try:
            ydl = get_sc_search_ydl()
            with _ydl_sc_lock:
                res = ydl.extract_info(f"scsearch3:{q}", download=False)
            for entry in (res.get('entries') or []):
                if not entry: continue
                thumbs = entry.get('thumbnails') or []
                thumb = thumbs[-1].get('url') if thumbs else entry.get('thumbnail')
                sc_results.append({
                    "id": entry.get('id'),
                    "title": entry.get('title'),
                    "url": entry.get('webpage_url') or entry.get('url'),
                    "thumbnail": thumb,
                    "duration": entry.get('duration'),
                    "uploader": entry.get('uploader') or entry.get('artist') or "SoundCloud",
                    "platform": "soundcloud"
                })
        except Exception as e:
            log_api(f"SC ydl hatasi: {e}")

    def search_sp():
        try:
            sp = get_spotify_search_client()
            if not sp:
                return
            res = sp.search(q=q, limit=3, type='track')
            for track in res.get('tracks', {}).get('items', []):
                sp_results.append({
                    "id": track['id'],
                    "title": f"{track['artists'][0]['name']} - {track['name']}",
                    "url": track['external_urls']['spotify'],
                    "thumbnail": track['album']['images'][0]['url'] if track.get('album', {}).get('images') else None,
                    "duration": track.get('duration_ms', 0) / 1000,
                    "uploader": track.get('album', {}).get('name'),
                    "platform": "spotify"
                })
        except Exception as e:
            log_api(f"SP Arama hatasi: {e}")

    async def run_search(fn, name):
        try:
            await asyncio.wait_for(asyncio.to_thread(fn), timeout=2.8)
        except asyncio.TimeoutError:
            log_api(f"{name} arama zaman asimina ugradi (2.8s)")
        except Exception as e:
            log_api(f"{name} arama hatasi: {e}")

    await asyncio.gather(
        run_search(search_yt, "YouTube"),
        run_search(search_sc, "SoundCloud"),
        run_search(search_sp, "Spotify")
    )

    combined = sp_results + yt_results + sc_results
    if combined:
        with _search_cache_lock:
            if len(_search_cache) >= _SEARCH_CACHE_MAX:
                oldest_key = min(_search_cache.keys(), key=lambda k: _search_cache[k]['time'])
                _search_cache.pop(oldest_key, None)
            _search_cache[clean_q] = {'time': now, 'data': combined}

    return combined
# --- Spotify Connect (ZeroConf) ---

@app.post("/api/spotify-connect")
async def connect_spotify():
    if not _zeroconf_lock.acquire(blocking=False):
        return {"status": "error", "message": "Zaten aktif bir eşleşme oturumu çalışıyor. Lütfen mevcut oturumun tamamlanmasını bekleyin."}

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

            # Zotify uyumluluğu için AppData kopyası (Windows)
            if sys.platform == 'win32':
                try:
                    zotify_dir = Path.home() / 'AppData' / 'Roaming' / 'Zotify'
                    zotify_dir.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(cred_file, zotify_dir / 'credentials.json')
                except Exception:
                    pass

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
                _zeroconf_lock.release()
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
