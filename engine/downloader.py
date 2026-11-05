import sys
import os
import json

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
    except Exception as e:
        pass  # Yetki sorunu varsa devam et
if os.path.exists(PACKAGES_DIR) and PACKAGES_DIR not in sys.path:
    sys.path.insert(0, PACKAGES_DIR)

import yt_dlp
import binascii
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
import datetime
import re
import threading
import time as _time
import urllib.request
import imageio_ffmpeg
import syncedlyrics

# ── Constants ──────────────────────────────────────────────────────────────
CRED_FILE = os.path.join(USER_DATA_DIR, "credentials.json")

spotify_api_lock = threading.Lock()

# ── Module-level state ────────────────────────────────────────────────────
download_progress: dict = {}
spotify_metadata_cache: dict = {}
spotify_url_cache: dict = {}
_spotify_token_cache: dict = {"token": None, "expires": 0}


def log_debug(message: str) -> None:
    log_file = os.path.join(USER_DATA_DIR, "debug.log")
    try:
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(f"[{datetime.datetime.now()}] {message}\n")
    except Exception:
        pass


class YtdlpLogger:
    def debug(self, msg):
        if "[ffmpeg]" in msg.lower() or "error" in msg.lower() or "warning" in msg.lower() or "destination" in msg.lower():
            log_debug(f"[yt-dlp] {msg}")
    def warning(self, msg):
        log_debug(f"[yt-dlp Warning] {msg}")
    def error(self, msg):
        log_debug(f"[yt-dlp Error] {msg}")


def has_spotify_credentials() -> bool:
    """Returns True when a valid Librespot credentials file is present."""
    return os.path.exists(CRED_FILE)

def update_progress(url, data):
    """Safely updates the download progress with activity timestamps."""
    now_ts = _time.time()
    
    if url not in download_progress:
        download_progress[url] = {'time': now_ts * 1000}
    
    download_progress[url].update(data)
    download_progress[url]['last_seen'] = now_ts



def get_config():
    conf_path = os.path.join(USER_DATA_DIR, "config.json")
    if os.path.exists(conf_path):
        try:
            with open(conf_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            log_debug(f"Config okuma hatası: {e}")
    return {}

def get_spotify_credentials():
    data = get_config()
    cid = data.get("spotify_client_id")
    sec = data.get("spotify_client_secret")
    return cid, sec

def get_spotify_token():
    """Gets an access token from the active librespot session if available with caching"""
    global _spotify_token_cache
    
    # Return cached token if still valid (50 min validity assumed, using 45 min for safety)
    if _spotify_token_cache["token"] and _time.time() < _spotify_token_cache["expires"]:
        return _spotify_token_cache["token"]

    try:
        session = get_librespot_session()
        if session:
            # Request token for common scopes
            token_obj = session.tokens().get("playlist-read-private,user-library-read,user-read-private")
            
            token_str = None
            if isinstance(token_obj, str):
                token_str = token_obj
            elif hasattr(token_obj, 'token'):
                token_str = token_obj.token
            else:
                token_str = str(token_obj)
            
            if token_str:
                _spotify_token_cache["token"] = token_str
                _spotify_token_cache["expires"] = _time.time() + 2700 # 45 minutes
                return token_str
    except Exception as e:
        log_debug(f"Token alma hatası: {e}")
    return None

def clean_spotify_url(url):
    """Spotify URL'sindeki ?si=... gibi tracking parametrelerini temizler.
    SADECE Spotify URL'lerine uygulanir! YouTube gibi platformlarda
    ?v=VIDEO_ID gibi kritik parametreler silinmemeli.
    """
    if 'spotify.com' in url:
        url = re.sub(r'[?&]si=[^&]*', '', url)
        url = url.rstrip('?&')
    return url


def invalidate_session() -> None:
    """Clears cached Librespot session and token so the next call creates a fresh one.
    Call this after a new ZeroConf pairing to avoid using stale credentials."""
    global _librespot_session, _spotify_token_cache
    _librespot_session = None
    _spotify_token_cache = {"token": None, "expires": 0}
    log_debug("Librespot: Oturum önbelleği temizlendi.")


def _fetch_playlist_via_mercury(playlist_id: str) -> list | None:
    """
    Librespot'un Mercury (Spotify native) protokolüyle playlist parçalarını çeker.
    Web API kullanmaz — rate-limit yoktur. ZeroConf/credentials.json gerektirir.
    """
    try:
        from librespot.metadata import PlaylistId
        session = get_librespot_session()
        if not session:
            log_debug("Mercury playlist fetch: Librespot oturumu yok, atlanıyor.")
            return None

        log_debug(f"Mercury: Playlist çekiliyor (native, rate-limit yok): {playlist_id}")
        pl_id = PlaylistId.from_uri(f"spotify:playlist:{playlist_id}")
        playlist_obj = session.api().get_playlist(pl_id)

        tracks = []
        for item in playlist_obj.contents.items:
            # item.uri = 'spotify:track:XXXX'
            uri = item.uri
            if not uri or not uri.startswith('spotify:track:'):
                continue
            track_id_str = uri.split(':')[2]
            # Mercury'den sadece track ID alabiliriz; metadata sonra çekilecek
            tracks.append({'_track_id': track_id_str, '_uri': uri})

        if not tracks:
            log_debug("Mercury: Playlist boş veya parça yok.")
            return None

        log_debug(f"Mercury: {len(tracks)} parça bulundu. Metadata çekiliyor...")
        # Her track için Librespot metadata API'şi ile bilgi al
        result_items = []
        from librespot.metadata import TrackId
        import binascii
        for t in tracks:
            try:
                tid = TrackId.from_base62(t['_track_id'])
                track_obj = session.api().get_metadata_4_track(tid)

                title = track_obj.name
                artist_name = track_obj.artist[0].name if track_obj.artist else "Unknown"
                album_name = track_obj.album.name if track_obj.album else "Unknown Album"
                duration_ms = track_obj.duration

                # ISRC
                isrc = None
                for gid in getattr(track_obj, 'external_id', []):
                    if gid.type == "isrc":
                        isrc = gid.id
                        break

                # Cover URL
                cover_url = None
                try:
                    if track_obj.album.cover_group.image:
                        img_id_hex = binascii.hexlify(track_obj.album.cover_group.image[0].file_id).decode('utf-8')
                        cover_url = f"https://i.scdn.co/image/{img_id_hex}"
                except Exception:
                    pass

                track_url = f"https://open.spotify.com/track/{t['_track_id']}"

                # Cache metadata
                spotify_metadata_cache[track_url] = {
                    'title': title,
                    'artist': artist_name,
                    'album': album_name,
                    'cover_url': cover_url,
                    'duration_s': duration_ms / 1000.0,
                    'isrc': isrc
                }

                queries = []
                if isrc:
                    queries.append(f"isrc:{isrc}")
                queries.append(f"{artist_name} - {title}")
                queries.append(f"{artist_name} {title} official")

                result_items.append((queries, duration_ms / 1000.0, (title, artist_name, album_name), track_url))

            except Exception as me:
                log_debug(f"Mercury: Track metadata hatası ({t['_track_id']}): {me}")
                continue

        log_debug(f"Mercury: {len(result_items)} parça metadata başarıyla alındı.")
        return result_items  # Bu doğrudan results_list formatında döner!

    except ImportError:
        log_debug("Mercury: PlaylistId import edilemedi, yöntem atlanıyor.")
        return None
    except Exception as e:
        import traceback
        log_debug(f"Mercury playlist fetch hatas\u0131: {type(e).__name__}: {e}")
        log_debug(f"Mercury traceback: {traceback.format_exc()}")
        return None


def _fetch_playlist_via_token(url: str, playlist_id: str) -> list | None:
    """
    Spotify Web API'den playlist par\u00e7alar\u0131n\u0131 do\u011frudan 'requests' ile \u00e7eker.
    - Librespot user token ile kullan\u0131c\u0131 yetkili istek yapar.
    - 429 al\u0131n\u0131nca 'Retry-After' header'\u0131n\u0131 okur ve bekler (max 3 deneme).
    - spotipy kullanmaz; davran\u0131\u015f tamamen kontrol alt\u0131nda.
    """
    import requests as _req

    token = get_spotify_token()
    if not token:
        log_debug("Playlist fetch: Librespot token yok, atlanıyor.")
        return None

    log_debug(f"Spotify API: Librespot token ile playlist çekiliyor (retries=0)...")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    api_url = f"https://api.spotify.com/v1/playlists/{playlist_id}/items?limit=50&offset=0&additional_types=track"
    tracks: list = []

    while api_url:
        for attempt in range(3):
            try:
                resp = _req.get(api_url, headers=headers, timeout=15)

                if resp.status_code == 429:
                    retry_after = int(resp.headers.get("Retry-After", 60))
                    log_debug(f"Playlist fetch 429 — {retry_after}s bekleniyor... (deneme {attempt + 1}/3)")
                    _time.sleep(retry_after + 1)
                    continue  # Yeniden dene

                if resp.status_code == 401:
                    log_debug("Playlist fetch 401 — token geçersiz, oturum yenileniyor...")
                    invalidate_session()
                    new_token = get_spotify_token()
                    if new_token:
                        headers["Authorization"] = f"Bearer {new_token}"
                        continue
                    return None

                resp.raise_for_status()
                data = resp.json()
                tracks.extend(data.get("items", []))
                api_url = data.get("next")  # Sayfalama: None ise döngü biter
                break  # Başarılı — sayfa alındı

            except _req.exceptions.RequestException as exc:
                log_debug(f"Playlist fetch HTTP hatası (deneme {attempt + 1}): {exc}")
                if attempt == 2:
                    return None
                _time.sleep(5)
        else:
            # 3 deneme de başarısız
            log_debug("Playlist fetch: 3 denemede de başarılı olunamadı.")
            return None

    log_debug(f"Playlist fetch tamamlandı: {len(tracks)} parça")
    return tracks if tracks else None


def _fetch_playlist_via_client_creds(sp, url: str) -> list | None:
    """
    Spotipy client credentials nesnesi ile playlist parçalarını çeker.
    Sayfalama desteği var; 429/401 alırsa None döner.
    """
    try:
        log_debug(f"Spotify API: Client Credentials ile playlist çekiliyor (retries=0)...")
        with spotify_api_lock:
            playlist = sp.playlist_items(url, limit=50, additional_types=['track'])
        tracks = list(playlist.get('items', []))
        while playlist.get('next'):
            _time.sleep(0.3)
            with spotify_api_lock:
                playlist = sp.next(playlist)
            tracks.extend(playlist.get('items', []))
        log_debug(f"Spotify API (client creds): {len(tracks)} parça alındı.")
        return tracks
    except Exception as e:
        log_debug(f"Spotify API (client creds) başarısız: {e}")
        return None


def process_spotify_url(url):
    """
    Spotify resmi API'si kullanarak şarkı verilerini çeker.
    Tekli şarkı, albüm veya çalma listesi destekler.
    Dönen değer: List[Tuple(queries, duration, meta_tuple)]
    """
    url = clean_spotify_url(url)
    
    if 'spotify.com' not in url:
        return [([url], None, None, url)]
        
    # 429 hatalarını ve gereksiz API yükünü önlemek için önbellek kontrolü
    if url in spotify_url_cache:
        log_debug(f"Önbellekten Spotify verisi yükleniyor: {url}")
        return spotify_url_cache[url]
    
    client_id, client_secret = get_spotify_credentials()
    
    if client_id and client_secret:
        log_debug("Spotify API: Client Credentials kullanılıyor.")
        auth_manager = SpotifyClientCredentials(client_id=client_id, client_secret=client_secret)
        # retries=0: 429 alınınca hemen hata fırlat, kendi fallback mantığımız devralır
        sp = spotipy.Spotify(auth_manager=auth_manager, retries=0, status_retries=0)
    else:
        # Try to use Session Token as fallback (ZeroConf)
        token = get_spotify_token()
        if token:
            log_debug("Spotify API: Oturum token'ı kullanılıyor.")
            sp = spotipy.Spotify(auth=token, retries=0, status_retries=0)
        else:
            # Fallback for single tracks via Librespot if no API access at all
            if 'open.spotify.com/track/' in url:
                log_debug(f"Spotify API erişimi yok, Librespot ile metadata çekiliyor: {url}")
                try:
                    return [fetch_metadata_via_librespot(url)]
                except Exception as e:
                    log_debug(f"Librespot Metadata Hatası: {e}")
                    return [([url], None, None, url)]
            
            if 'spotify.com' in url:
                raise Exception("Spotify API erişimi sağlanamadı! Lütfen Client ID/Secret girin veya cihazı eşleştirin.")
            return [([url], None, None, url)]
    
    results_list = []

    try:
        if 'open.spotify.com/track/' in url:
            log_debug(f"Spotify Track tespiti: {url}")
            with spotify_api_lock:
                track = sp.track(url)
            results_list.append(parse_single_spotify_track(track, url))

        elif 'open.spotify.com/playlist/' in url:
            log_debug(f"Spotify Playlist tespiti: {url}")
            
            # Playlist ID'yi URL'den çıkar
            pl_match = re.search(r'playlist/([a-zA-Z0-9]+)', url)
            playlist_id = pl_match.group(1) if pl_match else None
            
            # YÖNTEM 0: Librespot Mercury (native Spotify protokolü — rate-limit yok)
            mercury_results = _fetch_playlist_via_mercury(playlist_id)
            if mercury_results:
                log_debug(f"Mercury: Playlist başarıyla alındı ({len(mercury_results)} parça).")
                spotify_url_cache[url] = mercury_results
                return mercury_results
            
            log_debug("Mercury başarısız, Web API yöntemlerine geçiliyor...")
            raw_tracks = None
            
            # YÖNTEM 1: Librespot token ile Spotify Web API
            if raw_tracks is None:
                raw_tracks = _fetch_playlist_via_token(url, playlist_id)
            
            # YÖNTEM 2: Client Credentials ile Spotify Web API
            if raw_tracks is None:
                raw_tracks = _fetch_playlist_via_client_creds(sp, url)
            
            # YÖNTEM 3: yt-dlp fallback (DRM uyarısı verirse None döner)
            if raw_tracks is None:
                log_debug("Tüm Spotify API yöntemleri başarısız, yt-dlp deneniyor...")
                try:
                    ydl_opts = {'quiet': True, 'extract_flat': True, 'no_warnings': True}
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        pl_info = ydl.extract_info(url, download=False)
                        for entry in pl_info.get('entries', []):
                            if not entry: continue
                            title = entry.get('title')
                            artist = entry.get('uploader') or entry.get('artist') or "Unknown Artist"
                            t_url = entry.get('url') or entry.get('webpage_url')
                            if title and t_url:
                                results_list.append(([f"{artist} - {title}"], None, (title, artist, "Playlist Track"), t_url))
                        if results_list:
                            spotify_url_cache[url] = results_list
                            return results_list
                except Exception as ydl_e:
                    log_debug(f"yt-dlp fallback başarısız: {ydl_e}")
            
            if raw_tracks is None:
                raise Exception(
                    "Playlist parçaları alınamadı. Lütfen:\n"
                    "1. 'Ayarlar' > 'Spotify ile Cihazı Eşleştir' adımını tamamlayın\n"
                    "2. Ya da Client ID/Secret girin"
                )
            
            # raw_tracks → parse (Web API formatı)
            for item in raw_tracks:
                if not item or not item.get('track'): continue
                t = item['track']
                if not t: continue
                results_list.append(parse_single_spotify_track(t, t['external_urls']['spotify']))
            
            spotify_url_cache[url] = results_list
            return results_list

        elif 'open.spotify.com/album/' in url:
            log_debug(f"Spotify Album tespiti: {url}")
            
            # Albüm için token önce dene
            token = get_spotify_token()
            if token:
                sp_user = spotipy.Spotify(auth=token, retries=0, status_retries=0)
            else:
                sp_user = sp
            
            try:
                with spotify_api_lock:
                    album_info = sp_user.album(url)
                    tracks_results = sp_user.album_tracks(url)
            except Exception as e:
                err_s = str(e)
                log_debug(f"Album çekme hatası: {err_s}")
                if '429' in err_s:
                    log_debug("Album 429 hit, 5s bekleniyor...")
                    _time.sleep(5)
                raise Exception(f"Album indirilemedi: {err_s}")

            tracks = tracks_results['items']
            while tracks_results.get('next'):
                _time.sleep(0.4) # Rate limit koruması
                tracks_results = sp_user.next(tracks_results)
                tracks.extend(tracks_results['items'])

            for t in tracks:
                t['album'] = album_info
                results_list.append(parse_single_spotify_track(t, t['external_urls']['spotify']))
        else:
            return [([url], None, None, url)]

        spotify_url_cache[url] = results_list
        return results_list
    except Exception as e:
        log_debug(f"Spotify İşleme Hatası: {str(e)}")
        if '429' in str(e):
             log_debug("Spotify Rate Limit (429) yakalandı. Lütfen biraz bekleyin.")
        if 'spotify.com' in url:
            raise Exception(f"Spotify API Hatası: {str(e)}")
        return [([url], None, None, url)]

def parse_single_spotify_track(track, url):
    """Helper to extract metadata from a track object"""
    title = track['name']
    artist = track['artists'][0]['name']
    duration_ms = track['duration_ms']
    album = track.get('album', {}).get('name', 'Unknown Album')
    
    isrc = track.get('external_ids', {}).get('isrc')
    cover_url = None
    if track.get('album') and track['album'].get('images') and len(track['album']['images']) > 0:
        cover_url = track['album']['images'][0]['url']
        
    spotify_metadata_cache[url] = {
        'title': title,
        'artist': artist,
        'album': album,
        'cover_url': cover_url,
        'duration_s': duration_ms / 1000.0,
        'isrc': isrc
    }

    queries = []
    if isrc:
        queries.append(f"isrc:{isrc}")
    queries.append(f"{artist} - {title}")
    queries.append(f"{artist} {title} official")
    queries.append(f"{title} {artist} high quality")
    
    return queries, duration_ms / 1000.0, (title, artist, album), url


def fetch_metadata_via_librespot(url):
    """Fetch track metadata directly using librespot Session"""
    from librespot.metadata import TrackId
    
    track_id_match = re.search(r'track/([a-zA-Z0-9]+)', url)
    if not track_id_match:
        raise Exception("Geçersiz Spotify track URL'si")
    track_id_str = track_id_match.group(1)
    
    session = get_librespot_session()
    track_id = TrackId.from_base62(track_id_str)
    
    # librespot-python metadata fetch
    track_obj = session.api().get_metadata_4_track(track_id)
    
    title = track_obj.name
    artist = track_obj.artist[0].name
    album = track_obj.album.name
    duration_s = track_obj.duration / 1000.0
    
    # ISRC handling
    isrc = None
    for gid in track_obj.external_id:
        if gid.type == "isrc":
            isrc = gid.id
            break

    # Cover URL - Librespot uses image IDs, we need to construct the URL
    # https://i.scdn.co/image/{file_id}
    cover_url = None
    if track_obj.album.cover_group.image:
        img_id_hex = binascii.hexlify(track_obj.album.cover_group.image[0].file_id).decode('utf-8')
        cover_url = f"https://i.scdn.co/image/{img_id_hex}"

    spotify_metadata_cache[url] = {
        'title': title,
        'artist': artist,
        'album': album,
        'cover_url': cover_url,
        'duration_s': duration_s,
        'isrc': isrc
    }

    queries = []
    if isrc:
        queries.append(f"isrc:{isrc}")
    queries.append(f"{artist} - {title}")
    
    return queries, duration_s, (title, artist, album), url



cancelled_urls = set()
confirmation_events = {}
confirmation_results = {}


def yt_dlp_progress_hook(d, url):
    """Callback hook for yt-dlp progress updates."""
    if url in cancelled_urls:
        log_debug(f"İptal isteği algılandı: {url}")
        raise Exception("CANCELLED")

    if d['status'] == 'downloading':
        total = d.get('total_bytes') or d.get('total_bytes_estimate') or 1
        downloaded = d.get('downloaded_bytes') or 0
        speed = d.get('speed') or 0
        eta = d.get('eta') or 0
        
        # Calculate percentage safely
        percentage = (downloaded / total) * 100 if total > 1 else 0
        
        update_progress(url, {
            "status": "downloading",
            "percentage": round(percentage, 2),
            "speed": speed,
            "eta": eta
        })
    elif d['status'] == 'finished':
        base_name = os.path.basename(d.get('filename'))
        update_progress(url, {
            "status": "postprocessing",
            "percentage": 90,
            "filename": base_name,
            "display_name": base_name
        })
        log_debug(f"Download finished (basename): {base_name}")


    elif d['status'] == 'error':
        update_progress(url, {
            "status": "error"
        })




# Global librespot session cache — reuse across calls
_librespot_session = None
_librespot_session_lock = threading.Lock()

def invalidate_librespot_session():
    """Session'ı geçersiz kıl — bir sonraki çağrıda yeni session açılır."""
    global _librespot_session
    with _librespot_session_lock:
        if _librespot_session is not None:
            try:
                _librespot_session.close()
            except Exception:
                pass
        _librespot_session = None
    log_debug("Librespot: Session geçersiz kılındı, sıradaki çağrıda yeniden açılacak.")

def get_librespot_session(force_new=False):
    """Returns a cached librespot Session, creating one if needed.
    Retries up to 3 times on transient errors (e.g. 'unpack requires 4 bytes').
    force_new=True → mevcut session'ı yok say ve yenisini oluştur.
    """
    global _librespot_session
    with _librespot_session_lock:
        if not force_new and _librespot_session is not None:
            try:
                if _librespot_session.is_valid():
                    return _librespot_session
            except Exception:
                pass
            _librespot_session = None

        # Eski session'ı kapat
        if _librespot_session is not None:
            try:
                _librespot_session.close()
            except Exception:
                pass
            _librespot_session = None

        from librespot.core import Session
        if not os.path.exists(CRED_FILE):
            log_debug("Librespot: Kimlik dosyası bulunamadı, oturum açılamıyor.")
            return None

        retry_delays = [1, 3, 5]
        for attempt, delay in enumerate(retry_delays, start=1):
            log_debug(f"Librespot: Oturum oluşturuluyor... (deneme {attempt}/{len(retry_delays)})")
            try:
                conf = Session.Configuration.Builder().set_store_credentials(False).build()
                _librespot_session = Session.Builder(conf).stored_file(CRED_FILE).create()
                if not _librespot_session:
                    raise Exception("Oturum oluşturulamadı.")
                log_debug(f"Librespot: Oturum açıldı — {_librespot_session.username()}")
                return _librespot_session
            except Exception as e:
                err_msg = str(e)
                log_debug(f"Librespot: Oturum açma hatası (deneme {attempt}): {err_msg}")
                _librespot_session = None
                # Kalıcı hatalar için yeniden deneme yapma
                if 'not found' in err_msg.lower() or 'invalid' in err_msg.lower() or 'authentication' in err_msg.lower():
                    log_debug("Librespot: Kalıcı hata — yeniden deneme yapılmıyor.")
                    return None
                if attempt < len(retry_delays):
                    log_debug(f"Librespot: {delay}s sonra tekrar denenecek...")
                    _time.sleep(delay)

        log_debug("Librespot: Tüm denemeler başarısız. Oturum açılamadı.")
        return None


def _is_empty_queue_error(e):
    """Librespot'un audio key beklerken oluşturduğu Empty() hatasını tespit eder."""
    import queue as _queue_mod
    err_repr = repr(e).lower()
    err_str = str(e).lower()
    tb_str = ''
    try:
        import traceback as _tb2
        import sys
        tb_str = _tb2.format_exc().lower()
    except Exception:
        pass
    return (
        isinstance(e, _queue_mod.Empty)
        or 'empty' in err_repr
        or '_queue.empty' in err_repr
        or 'get_audio_key' in tb_str
        or 'audio_key' in tb_str
        or 'wait_response' in tb_str
    )


def _load_stream_with_alternatives(session, track_id, audio_quality, track_id_str):
    """
    Librespot stream yükleyici. Ülke kısıtlaması varsa metadata'dan
    alternatif track GID'lerini alıp tek tek dener (bypass).
    Empty() / audio-key hatası durumunda session'ı yeniler ve bir kez daha dener.
    """
    from librespot.audio.decoders import VorbisOnlyAudioQuality
    from librespot.metadata import TrackId

    aq = VorbisOnlyAudioQuality(audio_quality)

    def _try_load(sess):
        """Verilen session ile stream yüklemeyi dene."""
        stream = sess.content_feeder().load(track_id, aq, False, None)
        if stream and stream.input_stream.size > 0:
            return stream
        return None

    # İlk deneme: mevcut session ile normal yükleme
    first_exc = None
    try:
        result = _try_load(session)
        if result:
            return result
    except Exception as e:
        first_exc = e
        err_lower = str(e).lower()

        # Empty() / audio-key hatası → session'ı yenile ve tekrar dene
        if _is_empty_queue_error(e):
            log_debug(f"Librespot: Empty() hatası — session yenileniyor ve tekrar deneniyor: {track_id_str}")
            new_session = get_librespot_session(force_new=True)
            if new_session:
                try:
                    result = _try_load(new_session)
                    if result:
                        return result
                except Exception as retry_exc:
                    if not _is_empty_queue_error(retry_exc):
                        raise retry_exc
                    log_debug(f"Librespot: Yenilenen session ile de Empty() — fallback'e geçiliyor.")
            raise e  # Upstream'e ilet; download_via_librespot_direct fallback yapar

        elif 'alternative' not in err_lower:
            raise  # Bölge kısıtlaması dışı hata — direkt fırlat

    # Ülke kısıtlaması: alternatif track'leri dene
    log_debug(f"Librespot: Bölge kısıtlaması tespit edildi, alternatif track'ler deneniyor: {track_id_str}")
    try:
        track_obj = session.api().get_metadata_4_track(track_id)
        alternatives = getattr(track_obj, 'alternative', [])
        log_debug(f"Librespot: {len(alternatives)} alternatif track bulundu")

        for alt in alternatives:
            try:
                alt_hex = binascii.hexlify(alt.gid).decode('utf-8')
                alt_id = TrackId.from_hex(alt_hex)
                log_debug(f"Librespot: Alternatif deneniyor: {alt_hex[:16]}...")
                stream = session.content_feeder().load(alt_id, aq, False, None)
                if stream and stream.input_stream.size > 0:
                    log_debug(f"Librespot: Alternatif track başarıyla yüklendi: {alt_hex[:16]}...")
                    return stream
            except Exception as alt_err:
                log_debug(f"Librespot: Alternatif başarısız: {alt_err}")
                continue
    except Exception as meta_err:
        log_debug(f"Librespot: Alternatif metadata alınamadı: {meta_err}")

    raise Exception("Cannot get alternative track — Tüm alternatifler denendi, hiçbiri yüklenemedi.")


def resolve_output_dir(target_dir):
    """Hedef indirme klasörünü çözer. Geçersiz, silinmiş veya izin verilmeyen yollarda güvenle Downloads klasörüne düşer."""
    default_dir = os.path.join(os.path.expanduser('~'), 'Downloads')
    if not target_dir or target_dir == 'downloads':
        conf = get_config()
        target_dir = conf.get('download_path') or default_dir
    try:
        abs_target = os.path.abspath(os.path.expanduser(target_dir))
        os.makedirs(abs_target, exist_ok=True)
        return abs_target
    except Exception as e:
        log_debug(f"Hedef klasör oluşturulamadı ({target_dir}): {e}. Varsayılan Downloads klasörüne geçiliyor.")
        try:
            os.makedirs(default_dir, exist_ok=True)
            return default_dir
        except Exception:
            fallback = os.path.abspath('downloads')
            os.makedirs(fallback, exist_ok=True)
            return fallback


def download_via_librespot_direct(track_url, output_dir, quality, meta=None):
    """
    Downloads a Spotify track directly using librespot Python API.
    Bypasses Zotify CLI and the Spotify Web API (TRACKS_URL) entirely,
    so there are NO rate limit issues.
    
    meta: optional dict with keys: title, artist, album, cover_url, isrc
          If not provided, basic filename is used.
    """
    track_url = clean_spotify_url(track_url)  # Strip ?si= params
    log_debug(f"Librespot doğrudan indirme başlatıldı: {track_url}")
    
    abs_output_dir = resolve_output_dir(output_dir)
    
    # Extract track ID from URL
    track_id_match = re.search(r'track/([a-zA-Z0-9]+)', track_url)
    if not track_id_match:
        raise Exception("Geçersiz Spotify track URL'si")
    track_id_str = track_id_match.group(1)
    
    # Set display name early
    if meta:
        display_name = f"{meta.get('title', 'Bilinmiyor')} - {meta.get('artist', '')}"
    else:
        display_name = f"Spotify Parçası ({track_id_str[:8]}...)"
    
    # Note: start_download already sets status=downloading before calling here.
    # Just update with the display name.
    update_progress(track_url, {
        "status": "downloading",
        "percentage": 0,
        "display_name": display_name
    })
    
    try:
        from librespot.core import Session
        from librespot.audio.decoders import VorbisOnlyAudioQuality, AudioQuality
        from librespot.metadata import TrackId
        import ffmpy

        session = get_librespot_session()
        if not session:
            raise Exception("Librespot oturumu açılamadı.")

        log_debug(f"Librespot: Stream yükleniyor: {track_id_str}")
        track_id = TrackId.from_base62(track_id_str)
        audio_quality = AudioQuality.VERY_HIGH if quality == 'best' else AudioQuality.HIGH
        stream = _load_stream_with_alternatives(session, track_id, audio_quality, track_id_str)
        total_size = stream.input_stream.size
        if total_size == 0:
            raise Exception("Stream boyutu 0 — Premium hesap gerekebilir veya şarkı bölgenizde mevcut değil.")
        log_debug(f"Librespot: Stream hazır, boyut: {total_size} bytes")
        if meta:
            safe_title = re.sub(r'[<>:"/\\|?*]', '_', meta.get('title', 'track'))
            safe_artist = re.sub(r'[<>:"/\\|?*]', '_', meta.get('artist', 'artist'))
            base_name = f"{safe_title} - {safe_artist}"
        else:
            base_name = f"spotify_{track_id_str}"
        
        ogg_path = os.path.join(abs_output_dir, f"{base_name}.ogg")
        mp3_path = os.path.join(abs_output_dir, f"{base_name}.mp3")
        
        log_debug(f"Librespot: OGG indiriliyor → {ogg_path}")
        downloaded = 0
        with open(ogg_path, 'wb') as f:
            while True:
                if track_url in cancelled_urls:
                    raise Exception("CANCELLED")
                chunk = stream.input_stream.stream().read(20000)
                if not chunk:
                    break
                f.write(chunk)
                downloaded += len(chunk)
                pct = min(int((downloaded / total_size) * 85), 85)
                update_progress(track_url, {"percentage": pct})

        log_debug(f"Librespot: OGG indirildi ({downloaded} bytes). MP3'e dönüştürülüyor...")
        update_progress(track_url, {"percentage": 87})
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        bitrate = "320k" if quality == 'best' else "192k"
        
        ff = ffmpy.FFmpeg(
            executable=ffmpeg_exe,
            global_options=['-y', '-hide_banner', '-loglevel', 'error'],
            inputs={ogg_path: None},
            outputs={mp3_path: ['-c:a', 'libmp3lame', '-b:a', bitrate, '-id3v2_version', '3']}
        )
        ff.run()
        
        # Remove temp OGG
        if os.path.exists(ogg_path):
            os.remove(ogg_path)
        
        if not os.path.exists(mp3_path):
            raise Exception("MP3 dönüşümü başarısız — ffmpeg çıktı dosyası oluşturulamadı.")
        
        log_debug(f"Librespot: MP3 oluşturuldu → {mp3_path}")
        update_progress(track_url, {"percentage": 95})
        
        if meta:
            try:
                try:
                    from engine import tagger
                except ModuleNotFoundError:
                    import tagger
                update_progress(track_url, {"percentage": 96, "display_name": f"Etiketleniyor: {meta.get('title', '...')}"})

                cover_path = None
                if meta.get('cover_url'):
                    update_progress(track_url, {"percentage": 97})
                    cover_path = os.path.join(abs_output_dir, f"_cover_{track_id_str}.jpg")
                    try:
                        req = urllib.request.Request(meta['cover_url'], headers={'User-Agent': 'Mozilla/5.0'})
                        with urllib.request.urlopen(req) as resp, open(cover_path, 'wb') as cf:
                            cf.write(resp.read())
                    except Exception as cover_err:
                        log_debug(f"Librespot: Kapak indirilemedi: {cover_err}")
                        cover_path = None

                lyrics = None
                update_progress(track_url, {"percentage": 98, "display_name": "Lirikler aranıyor..."})
                try:
                    lyrics = syncedlyrics.search(f"{meta['title']} {meta['artist']}")
                except Exception:
                    pass

                update_progress(track_url, {"percentage": 99})
                tagger.edit_metadata(mp3_path, meta.get('title'), meta.get('artist'), meta.get('album'), cover_path, lyrics=lyrics)

                if cover_path and os.path.exists(cover_path):
                    os.remove(cover_path)
                log_debug("Librespot: Metadata eklendi.")
            except Exception as tag_err:
                log_debug(f"Librespot: Metadata hatası: {tag_err}")

        update_progress(track_url, {
            "status": "finished", "percentage": 100,
            "display_name": os.path.basename(mp3_path),
            "filename": os.path.basename(mp3_path)
        })
        log_debug(f"Librespot: İndirme tamamlandı → {mp3_path}")
    except Exception as e:
        import traceback as _tb
        err_msg = str(e) or repr(e)
        log_debug(f"Librespot indirme hatası: {err_msg}")
        log_debug(f"Librespot traceback: {_tb.format_exc()}")
        for path in [locals().get('ogg_path'), locals().get('mp3_path')]:
            if path and os.path.exists(path):
                try: os.remove(path)
                except: pass

        # Fallback gerektiren hata türleri:
        # 1. Bölge kısıtlaması: 'alternative track'
        # 2. Audio key zaman aşımı: Empty() / queue.Empty
        # 3. Stream boyutu 0
        is_fallback_error = (
            'cannot get alternative track' in err_msg.lower()
            or 'alternative track' in err_msg.lower()
            or _is_empty_queue_error(e)
        )

        # Empty() kaynaklı fallback'te session'ı temizle
        if is_fallback_error and _is_empty_queue_error(e):
            log_debug("Librespot: Empty() fallback — session geçersiz kılınıyor.")
            invalidate_librespot_session()

        if is_fallback_error:
            # Kullanıcıya yt-dlp (YouTube/SoundCloud) üzerinden indirme teklif et.
            track_name = f"{meta.get('title', '?')} - {meta.get('artist', '?')}" if meta else track_id_str
            update_progress(track_url, {
                'status': 'needs_platform_fallback', 'percentage': 0,
                'display_name': track_name, 'track_url': track_url,
                'reason': 'Şarkı Spotify üzerinden indirilemedi (bölge kısıtlaması veya şifreleme hatası). YouTube/SoundCloud üzerinden denensin mi?',
            })
            event = threading.Event()
            confirmation_events[track_url] = event
            if event.wait(timeout=120.0):
                if confirmation_results.get(track_url, False):
                    log_debug(f"Kullanıcı platform fallback'i onayladı: {track_url}")
                    raise Exception(f"FALLBACK_APPROVED:{err_msg}")
                else:
                    log_debug(f"Kullanıcı platform fallback'i reddetti: {track_url}")
                    update_progress(track_url, {'status': 'error', 'message': 'İndirme iptal edildi.'})
            else:
                log_debug(f"Platform fallback zaman aşımı: {track_url}")
                update_progress(track_url, {'status': 'error', 'message': 'Zaman aşımı — işlem iptal edildi.'})
            return
        raise


def calculate_match_score(entry, target_title, target_artist, target_duration):
    """Stricter negative-prioritized scoring for audio matching"""
    if not entry: return -100, "Veri bulunamadı"
    duration = entry.get('duration')
    if not duration: return -100, "Süre bilgisi eksik"
    
    v_title = entry.get('title', '').lower()
    uploader = entry.get('uploader', '').lower()
    
    score = 70 # Start with a base score, then apply penalties/bonuses
    reasons = []
    
    # 1. Title Token Matching (CRITICAL)
    def tokenize(text):
        # Remove non-word chars and split, filter small words
        tokens = re.findall(r'\w+', text.lower())
        return [t for t in tokens if len(t) > 1]
    
    target_tokens = tokenize(target_title)
    video_tokens = tokenize(v_title)
    
    if not target_tokens: return -100, "Hedef başlık boş"
    
    # Check how many target keywords are in the video title
    found_count = 0
    for t in target_tokens:
        if t in video_tokens:
            found_count += 1
            
    match_ratio = found_count / len(target_tokens)
    
    # Heavy penalty for missing title words
    if match_ratio < 0.6:
        score -= 50
        reasons.append(f"Başlık uyuşmazlığı (%{int(match_ratio*100)})")
    elif match_ratio < 0.9:
        score -= 15
        
    # 2. Version Verification (BIDIRECTIONAL)
    # This handles both "I want the original but found a remix" 
    # AND "I want a remix but found the original"
    special_keywords = ['remix', 'slowed', 'reverb', 'live', 'instrumental', 'karaoke', 'edit', 'speed up', 'cover', 'acoustic']
    for kw in special_keywords:
        target_has = kw in target_title.lower()
        video_has = kw in v_title
        
        # Case 1: Target is normal, but video is special (Remix etc.) -> HEAVY PENALTY
        if video_has and not target_has:
            score -= 60
            reasons.append(f"İstenmeyen sürüm tespit edildi ({kw})")
            
        # Case 2: Target is special, but video is normal -> HEAVY PENALTY
        if target_has and not video_has:
            score -= 50
            reasons.append(f"Aranan sürüm bulunamadı ({kw})")
            
    # 3. Artist Verification
    artist_in_title = target_artist.lower() in v_title
    artist_in_uploader = target_artist.lower() in uploader
    
    if artist_in_title or artist_in_uploader:
        score += 20
        if artist_in_uploader and ("topic" in uploader or "vevo" in uploader):
            score += 10 # Extra trust for official channels
    else:
        score -= 30
        reasons.append("Sanatçı ismi doğrulanamadı")
        
    # 4. Duration Check (Strict)
    diff = abs(duration - target_duration)
    if diff <= 5:
        score += 10 # Perfect match bonus
    elif diff > 15:
        penalty = min(int((diff - 15) / 2), 40)
        score -= penalty
        reasons.append(f"Süre farkı ({int(diff)}sn)")
        
    # 5. Result is safe if title match is high AND artist is verified
    if match_ratio >= 0.9 and (artist_in_title or artist_in_uploader):
        score += 10 # Safe boost
        
    return max(-100, score), ", ".join(reasons) if reasons else "Yüksek uyumluluk"

# Domains that are direct URLs — no search needed
DIRECT_URL_DOMAINS = [
    'youtube.com', 'youtu.be', 'soundcloud.com',
    'instagram.com', 'tiktok.com', 'twitter.com', 'x.com',
    'facebook.com', 'fb.watch', 'twitch.tv', 'vimeo.com',
    'dailymotion.com', 'reddit.com', 'tumblr.com',
]

def start_download(input_url, format_type='mp3', quality='best', output_dir='downloads', cookie_browser='none'):
    """Synchronous download function handles single tracks and collections"""
    
    try:
        # 1. Expand input URL (Single, Playlist, Album)
        # Clean the input URL first (strip ?si= etc)
        input_url = clean_spotify_url(input_url)
        track_list = process_spotify_url(input_url)
        
        if len(track_list) > 1:
            log_debug(f"Koleksiyon algılandı: {len(track_list)} parça.")
            # Notify frontend that we're expanding a playlist
            update_progress(input_url, {"status": "expanding", "percentage": 0, "display_name": "Çalma listesi açılıyor..."})

        
        # 2. Iterate and download each track
        conf = get_config()
        output_dir = resolve_output_dir(output_dir)

        for queries, target_duration, meta_tuple, track_url in track_list:
            if input_url in cancelled_urls:
                break

            # Skip if this track is already being actively downloaded
            existing = download_progress.get(track_url, {})
            if existing.get('status') == 'downloading':
                if _time.time() - existing.get('last_seen', 0) <= 30:
                    log_debug(f"Atlanıyor — zaten indiriliyor: {track_url}")
                    continue
                log_debug(f"Eski kilit temizleniyor: {track_url}")
                del download_progress[track_url]

            cancelled_urls.discard(track_url)

            update_progress(track_url, {
                "status": "downloading",
                "percentage": 0,
                "display_name": "İndiriliyor...",
                "target_url": track_url,
            })

            # ── Spotify URL → her zaman Librespot ile indir ──────────────────
            if 'spotify.com' in track_url:
                if not has_spotify_credentials():
                    update_progress(track_url, {
                        "status": "error",
                        "message": "Spotify bağlı değil. Ayarlar > 'Spotify ile Cihazı Eşleştir' adımını tamamlayın.",
                    })
                    continue

                meta = spotify_metadata_cache.get(track_url)
                try:
                    download_via_librespot_direct(track_url, output_dir, quality, meta=meta)
                    continue
                except Exception as exc:
                    err_str = str(exc)
                    log_debug(f"Librespot indirme başarısız: {err_str}")
                    if err_str.startswith('FALLBACK_APPROVED:'):
                        # Kullanıcı YouTube/SoundCloud fallback'ini onayladı
                        log_debug(f"Kullanıcı onaylı fallback — yt-dlp devreye giriyor: {track_url}")
                        display = f"{meta.get('title', '?')} - {meta.get('artist', '?')}" if meta else track_url
                        update_progress(track_url, {
                            'status': 'downloading',
                            'percentage': 0,
                            'display_name': display,
                        })
                        # yt-dlp arama akışına düş
                    else:
                        update_progress(track_url, {"status": "error", "message": err_str})
                        continue

            try:
                download_url = None
                
                # Default meta if None
                if meta_tuple:
                    target_title, target_artist, target_album = meta_tuple
                else:
                    target_title, target_artist, target_album = "Medya", "Bilinmiyor", "Bilinmiyor"
                
                # Herhangi bir http/https URL'si (Spotify hariç) doğrudan medya bağlantısı olarak işlenir
                if queries[0].startswith(('http://', 'https://')):
                    download_url = queries[0]
                    log_debug(f"Doğrudan URL tespiti: {download_url}")
                
                best_match = None
                max_score = -1
                failure_reason = "Arama sonucu bulunamadı"

                # --- PHASE A: YouTube Search ---
                if not download_url and target_duration:
                    log_debug(f"YouTube Araması: {target_artist} - {target_title}")

                    ydl_search_opts = {
                        'quiet': True,
                        'no_warnings': True,
                        'extract_flat': True,  # Fast metadata-only search
                        'skip_download': True,
                    }
                    if cookie_browser and cookie_browser != 'none':
                        ydl_search_opts['cookiesfrombrowser'] = (cookie_browser,)

                    for query in queries:
                        # Skip bare isrc: queries — YouTube doesn’t support them
                        if query.startswith('isrc:'):
                            continue
                        full_query = f"ytsearch5:{query}"

                        with yt_dlp.YoutubeDL(ydl_search_opts) as ydl:
                            try:
                                search_results = ydl.extract_info(full_query, download=False)
                            except Exception:
                                continue

                            for entry in list(search_results.get('entries') or []):
                                if not entry: continue
                                score, reason = calculate_match_score(entry, target_title, target_artist, target_duration)
                                if score > max_score:
                                    max_score = score
                                    best_match = entry
                                    failure_reason = reason

                        if max_score >= 90:
                            break

                    if best_match and max_score >= 30:
                        download_url = best_match.get('url') or f"https://www.youtube.com/watch?v={best_match.get('id')}"
                        log_debug(f"YouTube Eşleşmesi: {best_match.get('title')} (Score: {max_score})")

                # --- PHASE B: SoundCloud Fallback ---
                if not download_url and target_duration:
                    log_debug(f"YouTube yetersiz, SoundCloud deneniyor: {target_artist} - {target_title} (Neden: {failure_reason})")
                    
                    # Simpler queries for SoundCloud
                    sc_queries = [f"{target_artist} {target_title}", f"{target_title} {target_artist}"]
                    for query in sc_queries:
                        full_query = f"scsearch5:{query}"
                        with yt_dlp.YoutubeDL({'quiet': True, 'no_warnings': True}) as ydl:
                            try:
                                search_results = ydl.extract_info(full_query, download=False)
                            except Exception:
                                continue
                            
                            if search_results and 'entries' in search_results:
                                raw_entries = search_results['entries']
                                try:
                                    entries = list(raw_entries) if raw_entries else []
                                except Exception:
                                    entries = []
                                for entry in entries:
                                    if not entry: continue
                                    score, reason = calculate_match_score(entry, target_title, target_artist, target_duration)
                                    if score > max_score:
                                        max_score = score
                                        best_match = entry
                                        failure_reason = reason
                        if max_score >= 80: break
                    
                    if best_match and max_score >= 25: # Lowered for better fallback success
                        download_url = best_match.get('webpage_url') or best_match.get('url')
                        log_debug(f"SoundCloud Eşleşmesi: {best_match['title']} (Score: {max_score})")

                # --- FINAL DECISION ---
                if not download_url:
                    if best_match:
                        download_url = best_match.get('webpage_url') or best_match.get('url') or f"https://www.youtube.com/watch?v={best_match.get('id')}"
                        log_debug(f"Zayıf Eşleşme Kullanılıyor: {best_match.get('title')} (Score: {max_score})")
                    elif 'youtube.com' in queries[0] or 'youtu.be' in queries[0] or 'soundcloud.com' in queries[0]:
                         download_url = queries[0]
                    else:
                         # Use the failure reason in the exception
                         raise Exception(f"Arama sonucu bulunamadı: {failure_reason}")

                # --- SMART CONFIRMATION ---
                if best_match is not None:
                    conf_threshold = get_config().get('match_threshold', 60)
                    if max_score < conf_threshold:
                        log_debug(f"Onay gerekiyor (Puan: {max_score}, Eşik: {conf_threshold}): {track_url}")
                        
                        # Store match info for frontend
                        update_progress(track_url, {
                            "status": "needs_confirmation",
                            "percentage": 0,
                            "max_score": max_score,
                            "failure_reason": failure_reason,
                            "found_title": best_match.get('title'),
                            "found_uploader": best_match.get('uploader'),
                            "found_url": best_match.get('webpage_url'),
                            "found_platform": "youtube" if 'youtube.com' in best_match.get('webpage_url', '') else "soundcloud",
                            "target_title": target_title,
                            "target_artist": target_artist,
                            "target_url": track_url
                        })


                        
                        # Create and wait for event
                        event = threading.Event()
                        confirmation_events[track_url] = event
                        
                        # Wait for 60 seconds or until event is set
                        confirmed = event.wait(timeout=60.0)
                        
                        if not confirmed:
                            log_debug(f"Onay zaman aşımı: {track_url}")
                            raise Exception("Onay zaman aşımı (60sn). İşlem iptal edildi.")
                        
                        result = confirmation_results.get(track_url, False)
                        if not result:
                            log_debug(f"Kullanıcı reddetti: {track_url}")
                            raise Exception("Kullanıcı tarafından reddedildi.")
                        
                        log_debug(f"Kullanıcı onayladı, devam ediliyor: {track_url}")

                output_dir = resolve_output_dir(output_dir)
                ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
                # PyInstaller fallback check
                if not os.path.exists(ffmpeg_path) and hasattr(sys, '_MEIPASS'):
                    pyi_ffmpeg = os.path.join(sys._MEIPASS, 'imageio_ffmpeg', 'binaries', os.path.basename(ffmpeg_path))
                    if os.path.exists(pyi_ffmpeg):
                        ffmpeg_path = pyi_ffmpeg

                def progress_hook(d):
                    return yt_dlp_progress_hook(d, track_url)

                def pp_hook(d):
                    if d['status'] == 'finished':
                        final_file = d.get('info_dict', {}).get('filepath') or d.get('info_dict', {}).get('_filename')
                        if final_file:
                            log_debug(f"Postprocessing bitti. Gerçek dosya: {final_file}")
                            update_progress(track_url, {
                                "status": "finished",
                                "percentage": 100,
                                "filename": os.path.basename(final_file),
                                "display_name": os.path.basename(final_file)
                            })

                ydl_opts = {
                    'socket_timeout': 15,
                    'retries': 5,
                    'outtmpl': os.path.join(output_dir, f'%(title)s-{datetime.datetime.now().strftime("%Y%m%d%H%M%S")}.%(ext)s'),
                    'progress_hooks': [progress_hook],
                    'postprocessor_hooks': [pp_hook],
                    'continuedl': True,
                    'noplaylist': True,
                    'concurrent_fragment_downloads': 5,
                    'ffmpeg_location': ffmpeg_path,
                    'logger': YtdlpLogger(),
                    # EJS/deno challenge solver is configured via global yt-dlp config.
                    # (~\AppData\Roaming\yt-dlp\config: --remote-components ejs:github)
                    'allow_unplayable_formats': False,
                }
                if format_type == 'mp3':
                    # Audio only: best quality audio, converted to mp3
                    ydl_opts['format'] = 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best'
                    ydl_opts['postprocessors'] = [{
                        'key': 'FFmpegExtractAudio',
                        'preferredcodec': 'mp3',
                        'preferredquality': '192' if quality == 'standard' else '320',
                    }]
                else:
                    # Video: prefer combined stream, fallback to best available then merge
                    ydl_opts['format'] = (
                        'bestvideo[ext=mp4]+bestaudio[ext=m4a]'
                        '/bestvideo[ext=mp4]+bestaudio'
                        '/bestvideo+bestaudio'
                        '/best[ext=mp4]'
                        '/best'
                    )
                    ydl_opts['merge_output_format'] = 'mp4'

                # Tarayıcı çerezleri ayarlanmışsa yt-dlp'ye aktar (özel/giriş gerektiren içerikler için)
                if cookie_browser and cookie_browser != 'none':
                    ydl_opts['cookiesfrombrowser'] = (cookie_browser,)

                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    # Risk Warning: If score is between absolute min (40) and safe (75)
                    if max_score < 75:
                        update_progress(track_url, {
                            "status": "downloading",
                            "percentage": 0,
                            "warning": "Düşük eşleşme kalitesi. Yanlış parça olabilir."
                        })
                    
                    # Extract info one last time to get generic metadata for non-Spotify sources
                    if track_url not in spotify_metadata_cache:
                        try:
                            info = ydl.extract_info(download_url, download=False)
                            spotify_metadata_cache[track_url] = {
                                'title': info.get('title', target_title),
                                'artist': info.get('uploader', info.get('artist', target_artist)),
                                'album': info.get('album', 'Bilinmeyen Albüm'),
                                'cover_url': info.get('thumbnail'),
                                'duration_s': info.get('duration', 0)
                            }
                        except Exception:
                            pass

                    ydl.download([download_url])

                # Fix filename and set status to finished for ALL non-Spotify downloads.
                # yt-dlp progress hook fires BEFORE FFmpeg converts or merges (e.g. .webm → .mp3, merging video/audio),
                # so we must correct the stored filename and finalize status after download completes.
                if track_url not in spotify_metadata_cache:
                    file_info = download_progress.get(track_url, {})
                    stored_filename = file_info.get('filename', '')
                    final_filename = stored_filename
                    
                    if stored_filename:
                        # Strip common yt-dlp temporary suffixes and extensions
                        # e.g., 'M A H V O L D U M-20260603225821.f140.m4a' -> 'M A H V O L D U M-20260603225821'
                        clean_base = re.sub(r'\.f\d+$', '', os.path.splitext(stored_filename)[0])
                        target_ext = f".{format_type}" if format_type in ['mp3', 'mp4'] else ""
                        
                        if target_ext:
                            candidate = os.path.join(output_dir, clean_base + target_ext)
                            if os.path.exists(candidate):
                                final_filename = clean_base + target_ext
                            else:
                                # Look for any file starting with clean_base and ending with target_ext in output_dir
                                try:
                                    for f in os.listdir(output_dir):
                                        if f.startswith(clean_base) and f.endswith(target_ext):
                                            final_filename = f
                                            break
                                except Exception:
                                    pass
                    
                    update_progress(track_url, {
                        'status': 'finished',
                        'percentage': 100,
                        'filename': final_filename,
                        'display_name': final_filename
                    })
                    log_debug(f"İndirme tamamlandı (non-Spotify): {final_filename}")

                # Post-process Metadata (only for Spotify tracks with cached metadata)
                if track_url in spotify_metadata_cache:
                    meta = spotify_metadata_cache[track_url]
                    file_info = download_progress.get(track_url)
                    if file_info and file_info.get('status') == 'finished':
                        final_filename = file_info.get('filename')
                        if not final_filename:
                            continue  # Skip tagging if filename is missing

                        # Fix extension: yt-dlp progress hook fires before FFmpeg converts
                        if format_type == 'mp3' and not final_filename.endswith('.mp3'):
                            base_path = os.path.splitext(final_filename)[0]
                            mp3_candidate = os.path.join(output_dir, base_path + '.mp3')
                            if os.path.exists(mp3_candidate):
                                final_filename = base_path + '.mp3'

                        # MP4 extension fix
                        if format_type == 'mp4' and not final_filename.endswith('.mp4'):
                            base_path = os.path.splitext(final_filename)[0]
                            mp4_candidate = os.path.join(output_dir, base_path + '.mp4')
                            if os.path.exists(mp4_candidate):
                                final_filename = base_path + '.mp4'

                        full_file_path = os.path.join(output_dir, final_filename)
                        if not os.path.exists(full_file_path) and os.path.exists(final_filename):
                            full_file_path = final_filename

                        if os.path.exists(full_file_path):
                            try:
                                from engine import tagger
                            except ModuleNotFoundError:
                                import tagger
                            try:
                                update_progress(track_url, {"percentage": 96, "display_name": f"Etiketleniyor: {meta.get('title', '...')}"})

                                # Cover Art
                                cover_path = None
                                if meta.get('cover_url'):
                                    update_progress(track_url, {"percentage": 97})
                                    cover_path = os.path.join(output_dir, f"temp_{_time.time()}.jpg")
                                    try:
                                        req = urllib.request.Request(meta['cover_url'], headers={'User-Agent': 'Mozilla/5.0'})
                                        with urllib.request.urlopen(req) as resp, open(cover_path, 'wb') as out_file:
                                            out_file.write(resp.read())
                                    except Exception:
                                        cover_path = None

                                # Lyrics (sadece MP3 için)
                                lyrics = None
                                if format_type == 'mp3':
                                    update_progress(track_url, {"percentage": 98, "display_name": "Lirikler aranıyor..."})
                                    try:
                                        import syncedlyrics
                                        lrc = syncedlyrics.search(f"{meta['title']} {meta['artist']}")
                                        if lrc:
                                            # USLT etiketi için zaman damgalarını temizle (daha uyumlu)
                                            lyrics = re.sub(r'\[\d+:\d+[\.:]\d+\]', '', lrc).strip()
                                    except Exception:
                                        pass

                                # Apply Tags (MP3 veya MP4)
                                update_progress(track_url, {"percentage": 99})
                                tagger.edit_metadata(full_file_path, meta['title'], meta['artist'], meta['album'], cover_path, lyrics=lyrics)
                                if cover_path and os.path.exists(cover_path):
                                    os.remove(cover_path)
                            except Exception as e:
                                log_debug(f"Etiketleme hatası: {str(e)}")

                            # Final Status
                            update_progress(track_url, {
                                "status": "finished",
                                "percentage": 100,
                                "filename": os.path.basename(full_file_path),
                                "display_name": os.path.basename(full_file_path)
                            })


            except Exception as e:
                err_msg = str(e)
                log_debug(f"Parça indirme hatası ({track_url}): {err_msg}")
                
                # Özel/giriş gerektiren içerik hatası tespiti
                err_lower = err_msg.lower()
                if any(k in err_lower for k in ['login', 'cookie', 'private', 'sign in', 'account', 'giriş']):
                    err_msg = ("Bu içerik özel veya giriş gerektiriyor. "
                               "Ayarlar > Oturum Yönetimi (Cookies) bölümünden giriş yaptığınız tarayıcıyı seçerek tekrar deneyin.")
                
                update_progress(track_url, {"status": "error", "message": err_msg})
            finally:
                # Bellek sızıntısını önle: işlem sonrası olay/sonuç kayıtlarını temizle
                confirmation_events.pop(track_url, None)
                confirmation_results.pop(track_url, None)


        # Finish collection
        if len(track_list) > 1:
            update_progress(input_url, {"status": "finished", "percentage": 100, "display_name": "Tüm liste tamamlandı."})


    except Exception as e:
        log_debug(f"Kritik Hata (start_download): {str(e)}")
        err_msg = str(e)
        if '429' in err_msg:
            err_msg = "Spotify tarafından sınırlandınız (429). Lütfen 30 saniye bekleyip tekrar deneyin."
        update_progress(input_url, {"status": "error", "message": f"Hata: {err_msg}"})


def get_video_info(original_url):
    """Retrieve metadata before downloading (returns first track for playlists)"""
    try:
        track_list = process_spotify_url(original_url)
        if not track_list: return None
        queries, _, _, _ = track_list[0]
        url = queries[0]
    except Exception as e:
        log_debug(f"Info alma sırasında Spotify hatası: {e}")
        url = original_url

    # isrc: gibi şemaları yt-dlp'ye gönderme, sadece http/https kabul et
    if not str(url).startswith('http'):
        # Eğer bir sorgu ise ytsearch kullan
        url = f"ytsearch1:{url}"

    # Instagram/TikTok vb. için önizleme hızını artırmak için kısıtlı extraction kullan
    ydl_opts = {
        'quiet': True,
        'extract_flat': 'in_playlist', 
        'skip_download': True,
        'playlist_items': '1', 
        'no_check_certificates': True,
    }
    
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            info = ydl.extract_info(url, download=False)
            return info
        except Exception as e:
            log_debug(f"Bilgi alma hatası ({url}): {e}")
            # Fallback: simpler extraction
            ydl_opts['extract_flat'] = True
            with yt_dlp.YoutubeDL(ydl_opts) as ydl2:
                return ydl2.extract_info(url, download=False)

def request_cancel(url):
    """Add URL to cancelled list"""
    cancelled_urls.add(url)


# ── Global Download Queue & Worker Thread ──────────────────────────────────
import queue

download_queue = queue.Queue()

# Stuck detection: takılı kalan indirmeleri izle
STUCK_TIMEOUT = 90  # saniye

def _stuck_watcher(url: str):
    """
    İndirme başladığı sürece periyodik olarak kontrol et.
    Eğer durum aktifse ve son güncellemeden beri STUCK_TIMEOUT saniye geçmişse zaman aşımına uğrat.
    """
    check_interval = 10
    while True:
        _time.sleep(check_interval)
        info = download_progress.get(url, {})
        status = info.get('status', '')
        
        # Eğer indirme artık aktif değilse izlemeyi bitir
        if status not in ('downloading', 'searching', 'postprocessing'):
            break
            
        last_seen = info.get('last_seen', 0)
        now = _time.time()
        
        if now - last_seen >= STUCK_TIMEOUT:
            log_debug(f"[Stuck Watcher] Takılı kalan indirme tespit edildi: {url} (son güncelleme {int(now - last_seen)}s önce)")
            update_progress(url, {
                "status": "error",
                "message": "İndirme zaman aşımına uğradı (90 saniye boyunca ilerleme olmadı). Lütfen tekrar deneyin."
            })
            break

def _queue_worker():
    while True:
        try:
            task = download_queue.get()
            if task is None:
                break
            
            url, format_type, quality, output_dir, cookie_browser = task
            log_debug(f"Kuyruk worker: {url} indirmesi başlatılıyor...")

            # Stuck detection thread'i başlat
            watcher = threading.Thread(
                target=_stuck_watcher, args=(url,), daemon=True,
                name=f"StuckWatcher-{url[:30]}"
            )
            watcher.start()

            try:
                start_download(url, format_type, quality, output_dir, cookie_browser)
            except Exception as e:
                log_debug(f"Kuyruk worker indirme hatası ({url}): {e}")
            finally:
                download_queue.task_done()
        except Exception as e:
            log_debug(f"Kuyruk worker hatası: {e}")
            _time.sleep(1)

# Worker daemon thread'i arka planda başlat
_worker_thread = threading.Thread(target=_queue_worker, daemon=True, name="DownloadQueueWorker")
_worker_thread.start()

def add_to_queue(url, format_type='mp3', quality='best', output_dir='downloads', cookie_browser='none'):
    """İndirme isteğini sıraya ekler ve durumu günceller."""
    update_progress(url, {
        "status": "searching",
        "message": "Hazırlanıyor (Kuyrukta bekliyor...)",
        "percentage": 0,
        "display_name": "Sıraya Alındı..."
    })
    download_queue.put((url, format_type, quality, output_dir, cookie_browser))


