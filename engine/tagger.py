from mutagen.id3 import ID3, TIT2, TPE1, TALB, APIC, USLT, ID3NoHeaderError
from mutagen.mp4 import MP4, MP4Cover
import os

def edit_metadata(file_path, title=None, artist=None, album=None, cover_path=None, lyrics=None):
    """
    Belirtilen MP3 veya MP4 dosyasına metadata etiketleri yazar.
    """
    if not os.path.exists(file_path):
        return {"error": "File not found"}

    ext = os.path.splitext(file_path)[1].lower()

    # --- MP4 / M4A ---
    if ext in ('.mp4', '.m4a'):
        return _tag_mp4(file_path, title, artist, album, cover_path)

    # --- MP3 (ID3v2.3) ---
    return _tag_mp3(file_path, title, artist, album, cover_path, lyrics)


def _tag_mp3(file_path, title, artist, album, cover_path, lyrics):
    """Windows Explorer (ID3v2.3) uyumlu MP3 etiketleme."""
    try:
        try:
            tags = ID3(file_path)
        except ID3NoHeaderError:
            # Dosyada henüz ID3 header yok — mutagen.id3.ID3 ile yükle ve oluştur
            from mutagen.id3 import ID3 as ID3Loader
            tags = ID3Loader()
            tags.save(file_path)          # Önce boş header oluştur
            tags = ID3(file_path)         # Sonra tekrar aç

        if title:
            tags.add(TIT2(encoding=1, text=title))
        if artist:
            tags.add(TPE1(encoding=1, text=artist))
        if album:
            tags.add(TALB(encoding=3, text=album))
        if lyrics:
            # USLT — VLC, foobar2000, Windows Media Player tarafından okunur
            # v2.3 için encoding=1 (UTF-16) daha uyumludur
            tags.delall('USLT')  # Eski varsa temizle
            tags.add(USLT(encoding=1, lang='eng', desc='', text=lyrics))

        if cover_path and os.path.exists(cover_path):
            tags.delall('APIC')  # Eski kapak varsa temizle
            with open(cover_path, 'rb') as img:
                tags.add(APIC(
                    encoding=1,
                    mime='image/jpeg',
                    type=3,
                    desc=u'Cover',
                    data=img.read()
                ))

        # CRITICAL: Force ID3v2.3 for Windows Explorer support
        tags.save(file_path, v2_version=3)
        return {"status": "success", "message": "Metadata updated successfully (ID3v2.3)"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def _tag_mp4(file_path, title, artist, album, cover_path):
    """MP4/M4A dosyalarına metadata yazar."""
    try:
        tags = MP4(file_path)
        if title:
            tags['\xa9nam'] = [title]
        if artist:
            tags['\xa9ART'] = [artist]
        if album:
            tags['\xa9alb'] = [album]
        if cover_path and os.path.exists(cover_path):
            with open(cover_path, 'rb') as img:
                tags['covr'] = [MP4Cover(img.read(), imageformat=MP4Cover.FORMAT_JPEG)]
        tags.save()
        return {"status": "success", "message": "MP4 metadata updated"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

