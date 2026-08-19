Miku Tool

YouTube, Spotify gibi platformlardan medya indirmeyi kolaylaştıran bir masaüstü uygulaması.

Neden yaptım

YouTube, Spotify gibi platformlardan mp3/mp4 indirmek genelde ya ücretli servislere bağlı kalıyor ya da uğraştırıcı yöntemler gerektiriyor. Bunu kendim için kolaylaştırmak amacıyla bu uygulamayı geliştirdim.

Kullanılan Teknolojiler
Frontend: Node.js, Vite, React
Backend: Python, PyInstaller
Özellikler
YouTube ve Spotify gibi platformlardan medya indirme
Basit ve kullanıcı dostu arayüz
Tek dosya halinde çalıştırılabilir (PyInstaller ile paketlenmiş backend)
Karşılaştığım Bir Sorun

Geliştirme sürecinde Spotify API kimlik bilgilerinin yanlışlıkla repoya dahil olduğunu fark ettim. Bunun üzerine kimlik bilgilerini rotate ettim (eski anahtarları geçersiz kılıp yenilerini oluşturdum) ve .gitignore dosyasını, hassas bilgilerin bir daha commit edilmeyecek şekilde düzelttim. Bu deneyim, geliştirme sürecinde kimlik bilgisi ve gizlilik yönetimine artık baştan daha dikkatli yaklaşmamı sağladı.

Nasıl Çalıştırılır
bash
# Reponuzu klonlayın
git clone https://github.com/Fukizikichi/miku-tool.git
cd miku-tool

# Frontend bağımlılıklarını kurun
npm install

# Geliştirme modunda çalıştırın
npm run dev

Not: Backend tarafı için Python ve gerekli bağımlılıkların kurulu olması gerekir.

Bu proje kişisel bir öğrenme/geliştirme projesidir. Geri bildirim ve önerilere açığım.

Lisans
Bu proje kişisel kullanım amacıyla paylaşılmıştır.
