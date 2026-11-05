# 🎵 Miku Tool — Modern Medya & Müzik İndirici

<p align="left">
  <a href="README-(EN).md">English</a> •
  <a href="README-(TR).md"><b>Türkçe</b></a>
</p>

Miku Tool; YouTube, Spotify, Instagram, Pinterest, TikTok, Twitter (X), SoundCloud, Vimeo, Reddit ve daha birçok platformdan yüksek kaliteli video ve ses indirmeyi sağlayan modern bir masaüstü uygulamasıdır.

Electron, React (Tailwind CSS, Framer Motion) ve Python (FastAPI, yt-dlp, Librespot) tabanlı hibrit bir mimari ile geliştirilmiştir.

---

## ✨ Özellikler

- **Evrensel Medya Desteği:** YouTube, Pinterest, Instagram (Reels & Post), TikTok, X (Twitter), SoundCloud, Facebook, Reddit vb. tüm platformlardan tek tıkla indirme.
- **Spotify Doğrudan İndirme:** Spotify bağlantılarını Librespot protokolü ile doğrudan kayıpsız formatta indirme (ayrıca YouTube/SoundCloud akıllı eşleme yedeği).
- **Akıllı Metadata ve Kapak Resmi:** Şarkı adı, sanatçı, albüm, kapak resmi ve senkronize şarkı sözü (LRC) etiketlerini otomatik işleme.
- **Kişiselleştirilebilir Arayüz:** Modern Hatsune Miku temalı, akıcı animasyonlar, dinamik karakter tepkileri ve karanlık cam efekti (glassmorphism).
- **Taşınabilir (Portable) & Kurulum Desteği:** Kurulum gerektirmeyen taşınabilir sürüm ve tek tıkla kurulum sağlayan yükleyici paketi.
- **Otomatik Pano Algılama:** Desteklenen bir medya bağlantısı kopyalandığında anında algılama ve bildirim.

---

## 🚀 Hızlı Başlangıç

### Hazır Sürümler (Kullanıcılar İçin)
`release/` klasörü altından:
- **Taşınabilir Sürüm:** `release/win-unpacked/Miku Tool.exe` doğrudan çalıştırılabilir.
- **Kurulum Dosyası:** `release/Miku Tool Setup 1.0.0.exe` ile bilgisayarınıza kurabilirsiniz.

---

## 🛠️ Geliştirici Kurulumu (Kaynak Koddan Çalıştırma)

### Gereksinimler
- **Node.js:** v18+ ve npm
- **Python:** 3.11 veya üzeri (Python 3.13 önerilir)

### 1. Depoyu Klonlayın
```bash
git clone https://github.com/Fukizikichi/miku-tool.git
cd miku-tool
```

### 2. Bağımlılıkları Kurun
```bash
# Node.js bağımlılıkları
npm install

# Python sanal ortamı ve kütüphaneleri
python -m venv venv
venv\Scripts\pip install -r requirements.txt
```

### 3. Yönetim Paneli ile Başlatın
Windows üzerinde projeyi başlatmak veya derlemek için `start.cmd` dosyasını kullanabilirsiniz:
- `[1]` Geliştirici Modunda Başlat (Vite + Electron)
- `[2]` Sadece Backend Derle (`miku-engine.exe`)
- `[3]` Tüm Projeyi Derle ve Paketle
- `[4]` Bağımlılıkları Kur / Güncelle
- `[5]` Projeyi Temizle

---

## ⚙️ Yapılandırma (`config.json`)

Ayarlar kullanıcı profilinizin `AppData/Roaming/Miku Tool/config.json` dosyasında tutulur.
Varsayılan olarak indirme klasörü sisteminizin `İndirilenler (Downloads)` klasörüne ayarlıdır.

Örnek şablon için [`config.example.json`](config.example.json) dosyasına bakabilirsiniz:
```json
{
  "download_path": "",
  "cookie_browser": "none",
  "match_threshold": 60,
  "spotify_client_id": "",
  "spotify_client_secret": "",
  "tray_on_close": false
}
```

---

## 📜 Lisans
Bu proje açık kaynaklıdır ve kişisel kullanım amaçlı geliştirilmiştir.
