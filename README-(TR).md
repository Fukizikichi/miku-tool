# 🎵 Miku Tool

<p align="left">
  <a href="README-(EN).md">English</a> •
  <a href="README-(TR).md"><b>Türkçe</b></a>
</p>

YouTube, Spotify ve diğer sosyal medya platformlarından medya indirmeyi kolaylaştıran modern bir masaüstü uygulaması.

---

## 💡 Neden Yaptım

YouTube, Spotify gibi platformlardan mp3/mp4 indirmek genelde ya ücretli servislere bağlı kalıyor ya da karmaşık ve uğraştırıcı yöntemler gerektiriyor. Bunu kendim için kolaylaştırmak ve pratikleştirmek amacıyla bu uygulamayı geliştirdim.

## 🛠️ Kullanılan Teknolojiler

- **Frontend:** Node.js, Electron, Vite, React, Tailwind CSS, Framer Motion
- **Backend:** Python (FastAPI, yt-dlp, Librespot), PyInstaller

## ✨ Özellikler

- YouTube, Spotify, Pinterest, Instagram vb. platformlardan medya indirme
- Spotify parçalarını doğrudan veya akıllı eşleme ile indirme
- Şarkı sözleri (LRC) ve ID3 kapak resmi/metadata işleme
- Basit, estetik ve kullanıcı dostu arayüz (Hatsune Miku temalı)
- Tek dosya halinde çalıştırılabilir backend (`miku-engine.exe`) ve taşınabilir (portable) kurulum

## 🔒 Karşılaştığım Bir Sorun & Çözümü

Geliştirme sürecinde Spotify API kimlik bilgilerinin yanlışlıkla repoya dahil olduğunu fark ettim. Bunun üzerine kimlik bilgilerini derhal rotate ettim (eski anahtarları geçersiz kılıp yenilerini oluşturdum) ve `.gitignore` dosyasını, hassas bilgilerin bir daha commit edilmeyecek şekilde güncelledim. Bu deneyim, geliştirme sürecinde kimlik bilgisi ve gizlilik yönetimine artık baştan daha dikkatli yaklaşmamı sağladı.

## 🚀 Nasıl Çalıştırılır

```bash
# Reponuzu klonlayın
git clone https://github.com/Fukizikichi/miku-tool.git
cd miku-tool

# Frontend bağımlılıklarını kurun
npm install

# Backend için sanal ortam oluşturup kütüphaneleri yükleyin
python -m venv venv
venv\Scripts\pip install -r requirements.txt

# Geliştirme modunda çalıştırın
npm run dev
```

> **İpucu (Windows):** Geliştirme modunu başlatmak veya projeyi tek tıkla derlemek için `start.cmd` dosyasını da kullanabilirsiniz.

---

Bu proje kişisel bir öğrenme/geliştirme projesidir. Geri bildirim ve önerilere açığım.

## 📜 Lisans

Bu proje kişisel kullanım amacıyla paylaşılmıştır.
