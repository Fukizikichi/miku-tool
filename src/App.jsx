import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Download, History, Settings, Music, Video, Search, Share2, Loader2, PlayCircle, ExternalLink, CheckCircle2, X, XCircle, Eye, Music2, Radio, ShieldAlert, RefreshCw, Check, HelpCircle, Lock, LockOpen, FolderOpen, Play, Pause, Volume2, VolumeX, SkipBack, SkipForward, Zap, Clock, Sparkles } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';

import SearchResultItem from './components/SearchResultItem';
import AudioPlayer from './components/AudioPlayer';
import Toast from './components/Toast';
import DynamicMikuLogo from './components/DynamicMikuLogo';
import { SidebarButton, FormatBtn } from './components/SidebarButton';
import { cn } from './utils/cn';

// Hatsune Miku Melodik Synth Arpej Bildirim Sesi (C5 -> E5 -> G5 -> C6)
const playPing = () => {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const notes = [523.25, 659.25, 783.99, 1046.50];
        const now = audioCtx.currentTime;

        notes.forEach((freq, idx) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'triangle'; // Sıcak retro-anime synth tonu
            osc.frequency.setValueAtTime(freq, now + idx * 0.08);

            gain.gain.setValueAtTime(0, now + idx * 0.08);
            gain.gain.linearRampToValueAtTime(0.18, now + idx * 0.08 + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + (idx === 3 ? 0.6 : 0.25));

            osc.connect(gain);
            gain.connect(audioCtx.destination);

            osc.start(now + idx * 0.08);
            osc.stop(now + idx * 0.08 + (idx === 3 ? 0.65 : 0.3));
        });
    } catch (e) { console.error("Audio error", e); }
};

const formatSpeed = (bytesPerSec) => {
    if (!bytesPerSec || bytesPerSec <= 0) return null;
    if (bytesPerSec >= 1024 * 1024) {
        return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
    }
    return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
};

const formatEta = (seconds) => {
    if (!seconds || seconds <= 0 || seconds > 36000) return null;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
};

const getErrorTip = (errorMessage) => {
  if (!errorMessage) return '';
  const msg = errorMessage.toLowerCase();
  
  // Hata mesajının kendisi zaten net yönergeler içeriyorsa ekstra ipucu gösterme
  if (msg.includes('ayarlar >') || msg.includes('oturum yönetimi') || msg.includes('cookies') || msg.includes('giriş yap') || msg.includes('seçin') || msg.includes('eşleştirin')) {
    return '';
  }

  // İptal edildi - ipucu yok
  if (msg.includes('cancelled') || msg.includes('iptal')) {
    return '';
  }
  
  // Spotify kimlik bilgisi / eşleştirme hatası
  if (msg.includes('spotify') && (msg.includes('credentials') || msg.includes('pairing') || msg.includes('kimlik') || msg.includes('auth') || msg.includes('401') || msg.includes('403'))) {
    return "💡 İpucu: Spotify hesabı eşleştirilmemiş veya kimlik bilgileri geçersiz. Ayarlar > 'Spotify Yeniden Eşleştir' adımını tamamlayın.";
  }

  // Ağ/bağlantı hatası
  if (msg.includes('network') || msg.includes('connection') || msg.includes('bağlantı') || msg.includes('timeout') || msg.includes('timed out') || msg.includes('unreachable') || msg.includes('ssl')) {
    return "💡 İpucu: İnternet bağlantısı kesintisi veya platform yanıt vermedi. Bağlantınızı kontrol edip tekrar deneyin.";
  }

  // Hız sınırı / 429
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests') || msg.includes('sınırlandır')) {
    return "💡 İpucu: Platform çok fazla istek algıladı (429). 30–60 saniye bekleyip tekrar deneyin.";
  }

  // Platform koruması / imza / blok — güncelleme öncelikli
  if (msg.includes('sign in') || msg.includes('login') || msg.includes('private') || msg.includes('age-restricted') || msg.includes('members only')) {
    return "💡 İpucu: Bu içerik giriş gerektiriyor. Ayarlar > Oturum Yönetimi bölümünden giriş yaptığınız tarayıcıyı seçin.";
  }

  if (msg.includes('signature') || msg.includes('impersonation') || msg.includes('challenge') || msg.includes('proof') || msg.includes('sabotage')) {
    return "💡 İpucu: YouTube güvenlik sistemi güncel motor gerektiriyor. Ayarlar > 'İndirme Motorunu Güncelle' butonuna basın; ardından uygulamayı yeniden başlatın.";
  }

  if (msg.includes('unexpected response') || msg.includes('extract') || msg.includes('block') || msg.includes('unavailable') || msg.includes('no video formats')) {
    return "💡 İpucu: Platform içeriğe erişimi engelledi. İndirme motorunu güncelleyip uygulamayı yeniden başlatmayı deneyin.";
  }

  // Python kod hatası — yeniden başlatma öner
  if (msg.includes('is not defined') || msg.includes('nameerror') || msg.includes('syntaxerror') || msg.includes('attributeerror') || msg.includes('keyerror') || msg.includes('typeerror')) {
    return "💡 İpucu: Dahili bir yazılım hatası oluştu. Uygulamayı kapatıp yeniden başlatmak sorunu çözecektir.";
  }

  // Dosya/dizin hatası
  if (msg.includes('permission') || msg.includes('access denied') || msg.includes('erişim') || msg.includes('no space') || msg.includes('disk')) {
    return "💡 İpucu: Hedef klasöre yazma izni yok veya disk dolu. Ayarlar > İndirme Klasörü'nü değiştirmeyi deneyin.";
  }

  // Genel / bilinmeyen hata — güncelleme değil, yeniden başlatma öner
  return "💡 İpucu: Beklenmeyen bir hata oluştu. Uygulamayı yeniden başlatmayı deneyin; sorun devam ederse İndirme Motorunu Güncelle seçeneğini kullanın.";
};

export default function App() {
  const [activeTab, setActiveTab] = useState('download');
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState('mp3');
  const quality = 'best'; // Sabit en yüksek kalite
  const [matchThreshold, setMatchThreshold] = useState(60);
  const [spotifyKeysLocked, setSpotifyKeysLocked] = useState(true);
  const [progress, setProgress] = useState(null);
  const [allDownloads, setAllDownloads] = useState({});
  const [videoInfo, setVideoInfo] = useState(null);
  
  // Search state
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef(null);
  const searchAbortControllerRef = useRef(null);

  // Preview Modal
  const [previewItem, setPreviewItem] = useState(null);

  // Cancel state
  const [isCancelling, setIsCancelling] = useState(false);

  // Smart Confirmation State
  const [pendingConfirmationUrl, setPendingConfirmationUrl] = useState(null);
  // Platform Fallback State (Cannot get alternative track)
  const [pendingFallbackUrl, setPendingFallbackUrl] = useState(null);

  const [spotifyClientId, setSpotifyClientId] = useState('');
  const [spotifyClientSecret, setSpotifyClientSecret] = useState('');
  const [downloadPath, setDownloadPath] = useState('');
  const [localIp, setLocalIp] = useState('localhost');
  const [cookieBrowser, setCookieBrowser] = useState('none');
  const [spotifyConnectStatus, setSpotifyConnectStatus] = useState('idle');
  const [hasSpotifyCredentials, setHasSpotifyCredentials] = useState(false);
  const [isFetchingInfo, setIsFetchingInfo] = useState(false);
  const [historyList, setHistoryList] = useState([]);
  const [toast, setToast] = useState({ message: '', visible: false });
  const [historySearch, setHistorySearch] = useState('');
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  // Audio Player state
  const [player, setPlayer] = useState({ src: null, title: '', isOpen: false });

  // Sistem ayarları (Electron IPC)
  const [trayEnabled, setTrayEnabled] = useState(false);
  const [autoLaunchEnabled, setAutoLaunchEnabled] = useState(false);

  // Log Viewer state
  const [logLines, setLogLines] = useState([]);
  const [logLoading, setLogLoading] = useState(false);
  const [logTotalLines, setLogTotalLines] = useState(0);
  const [logTotalSize, setLogTotalSize] = useState(0);
  const [logLineCount, setLogLineCount] = useState(100);
  const logEndRef = useRef(null);
  const logIntervalRef = useRef(null);
  const toastTimeoutRef = useRef(null);
  const [logAutoRefresh, setLogAutoRefresh] = useState(false);

  const fetchLogs = async (n = logLineCount) => {
    setLogLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/api/logs?lines=${n}`);
      const data = await res.json();
      if (data.status === 'success') {
        setLogLines(data.lines || []);
        setLogTotalLines(data.total_lines || 0);
        setLogTotalSize(data.total_size || 0);
      }
    } catch (e) {
      // sessiz hata
    } finally {
      setLogLoading(false);
    }
  };

  const clearLogs = async () => {
    try {
      await fetch('http://localhost:8000/api/logs/clear', { method: 'POST' });
      setLogLines(['[Log temizlendi]']);
      setLogTotalLines(1);
      setLogTotalSize(0);
      showToast('✓ Loglar temizlendi!');
    } catch (e) {
      showToast('⚠️ Temizleme hatası!');
    }
  };

  const copyLogs = () => {
    const text = logLines.join('\n');
    navigator.clipboard.writeText(text).then(() => showToast('✓ Loglar kopyalandı!'));
  };

  // Log auto-refresh: Ayarlar sekmesi açıkken her 3sn güncelle
  useEffect(() => {
    if (activeTab === 'settings' && logAutoRefresh) {
      fetchLogs(logLineCount);
      logIntervalRef.current = setInterval(() => fetchLogs(logLineCount), 3000);
    } else {
      if (logIntervalRef.current) clearInterval(logIntervalRef.current);
    }
    return () => { if (logIntervalRef.current) clearInterval(logIntervalRef.current); };
  }, [activeTab, logAutoRefresh, logLineCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ayarlar sekmesine ilk geçişte logları yükle
  useEffect(() => {
    if (activeTab === 'settings') fetchLogs(logLineCount);
  }, [activeTab, logLineCount]); // eslint-disable-line react-hooks/exhaustive-deps



  const showToast = (message, duration = 3000) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, visible: true });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(prev => ({ ...prev, visible: false }));
    }, duration);
  };


  // Load config on mount
  useEffect(() => {
    fetch('http://localhost:8000/api/config')
      .then(res => res.json())
      .then(data => {
        if (data.download_path) setDownloadPath(data.download_path);
        if (data.cookie_browser) setCookieBrowser(data.cookie_browser);
        if (data.has_spotify_credentials) setHasSpotifyCredentials(true);
        if (data.spotify_client_id) { setSpotifyClientId(data.spotify_client_id); setSpotifyKeysLocked(true); }
        if (data.spotify_client_secret) setSpotifyClientSecret(data.spotify_client_secret);
        if (data.match_threshold !== undefined) setMatchThreshold(data.match_threshold);
      })
      .catch(() => {});

    fetch('http://localhost:8000/api/ip')
      .then(res => res.json())
      .then(data => { if (data.ip) setLocalIp(data.ip); })
      .catch(() => {});

    fetch('http://localhost:8000/api/history')
      .then(res => res.json())
      .then(data => { if (data && Array.isArray(data)) setHistoryList(data); })
      .catch(() => {});

    // Electron sistem ayarlarını oku (Güvenli preload API veya legacy require)
    const ipc = (window && (window.electronAPI || (window.require ? window.require('electron').ipcRenderer : null)));
    if (ipc) {
      ipc.invoke('get-tray-enabled').then(r => setTrayEnabled(r.enabled)).catch(() => {});
      ipc.invoke('get-auto-launch').then(r => setAutoLaunchEnabled(r.enabled)).catch(() => {});
    }
  }, []);

  // Electron IPC — her render'da yeniden oluşturmamak için memoize ediliyor
  const isElectron = !!(window && (window.electronAPI || window.require));
  const ipcRenderer = useMemo(
    () => (window.electronAPI || (window.require ? window.require('electron').ipcRenderer : null)),
    [isElectron]
  );

  const handleShowInFolder = useCallback(async (filename) => {
    if (ipcRenderer && filename) {
      await ipcRenderer.invoke('show-in-folder', filename);
    }
  }, [ipcRenderer]);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8000/ws');
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data) {
          setAllDownloads(prev => {
            // Smart Confirmation Check
            Object.entries(data).forEach(([u, info]) => {
              if (info.status === 'needs_confirmation') {
                setPendingConfirmationUrl(u);
              }
              if (info.status === 'needs_platform_fallback') {
                setPendingFallbackUrl(u);
              }
              // Progress ping and sound
              if (info.status === 'finished' && (!prev[u] || prev[u].status !== 'finished')) {
                playPing();
                if (ipcRenderer) ipcRenderer.invoke('show-notification', info.display_name || 'Parça İndirildi', 'İndirme tamamlandı! 🎵');
              }
            });

            return { ...prev, ...data };
          });

          // History update logic
          Object.entries(data).forEach(([u, info]) => {
            if (info.status === 'finished' || info.status === 'error') {
              setHistoryList(prev => {
                const exists = prev.some(h => h.url === u);
                if (exists) return prev.map(h => h.url === u ? { ...h, ...info, url: u } : h);
                return [{ url: u, ...info, time: new Date().toISOString() }, ...prev].slice(0, 100);
              });
            }
          });
        }
      } catch (e) {
        // WS parse error — sessizce geç
      }
    };

    if (ipcRenderer) {
      ipcRenderer.on('clipboard-link', (event, link) => {
        setUrl(link);
      });
    }

    return () => {
      ws.close();
      if (ipcRenderer) ipcRenderer.removeAllListeners('clipboard-link');
    }
  }, []);

  // Debounced Search with AbortController and instant caching
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort();
      searchAbortControllerRef.current = null;
    }

    const trimmed = url ? url.trim() : '';

    if (trimmed && !trimmed.startsWith('http') && trimmed.length >= 2) {
      setIsSearching(true);
      searchTimeoutRef.current = setTimeout(async () => {
        const controller = new AbortController();
        searchAbortControllerRef.current = controller;
        try {
          const res = await fetch(`http://localhost:8000/api/search?q=${encodeURIComponent(trimmed)}`, {
            signal: controller.signal
          });
          const data = await res.json();
          if (Array.isArray(data)) {
            setSearchResults(data);
          } else {
            setSearchResults([]);
          }
        } catch (e) {
          if (e.name !== 'AbortError') {
            console.error("Search failed", e);
            setSearchResults([]);
          }
        } finally {
          if (searchAbortControllerRef.current === controller) {
            setIsSearching(false);
            searchAbortControllerRef.current = null;
          }
        }
      }, 250); 
    } else {
      setSearchResults([]);
      setIsSearching(false);
    }

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      if (searchAbortControllerRef.current) {
        searchAbortControllerRef.current.abort();
      }
    };
  }, [url]);

  // Sync Progress — Playlist'ler için birleşik progress hesapla
  useEffect(() => {
    if (!url) return;

    // Önce URL'e doğrudan eşleşen bir kayıt bul (tek parça veya playlist başlığı)
    const cleanUrl = url.split('?')[0].split('&si=')[0];
    const directKey = Object.keys(allDownloads).find(key => {
      const cleanKey = key.split('?')[0].split('&si=')[0];
      return cleanKey === cleanUrl || key === url || key.includes(cleanUrl) || cleanUrl.includes(cleanKey.split('?')[0]);
    });

    const directInfo = directKey ? allDownloads[directKey] : null;

    // Playlist tespiti: Girilen URL bir Spotify/genel playlist URL'si mi?
    const isPlaylistUrl = url.includes('/playlist/') || url.includes('?list=');

    if (isPlaylistUrl) {
      // Playlist'e ait tüm alt track'leri bul
      const playlistId = (url.match(/playlist\/([a-zA-Z0-9]+)/) || [])[1] || '';
      const allEntries = Object.entries(allDownloads);

      // Spotify track'leri olan alt kayıtlar
      const childTracks = allEntries.filter(([k, v]) =>
        k !== url && k !== directKey &&
        (k.includes('spotify.com/track/') || v.target_url)
      );

      if (childTracks.length > 0 || (directInfo && directInfo.status === 'expanding')) {
        const total = childTracks.length;
        const finished = childTracks.filter(([, v]) => v.status === 'finished').length;
        const errored = childTracks.filter(([, v]) => v.status === 'error').length;
        const downloading = childTracks.filter(([, v]) => v.status === 'downloading').length;

        // Aktif olarak indirilen parçanın adını göster
        const activeTrack = childTracks.find(([, v]) => v.status === 'downloading');
        const displayName = activeTrack
          ? activeTrack[1].display_name
          : finished + errored === total && total > 0
            ? `Tümü tamamlandı — ${finished} parça`
            : `${finished}/${total} parça tamamlandı`;

        const avgPct = total > 0
          ? Math.round(childTracks.reduce((sum, [, v]) => sum + (v.percentage || 0), 0) / total)
          : (directInfo?.percentage || 0);

        const overallStatus = finished + errored === total && total > 0
          ? 'finished'
          : downloading > 0 || (directInfo?.status === 'expanding')
            ? 'downloading'
            : directInfo?.status || 'downloading';

        setProgress({
          status: overallStatus,
          percentage: overallStatus === 'finished' ? 100 : avgPct,
          display_name: displayName,
          playlist_total: total,
          playlist_finished: finished,
          playlist_errored: errored,
        });
        return;
      }
    }

    // Tek parça veya playlist henüz açılmadıysa direkt kaydı kullan
    if (directInfo) {
      setProgress(directInfo);
    } else if (!progress || progress.status === 'searching') {
      // Henüz backend'den veri gelmediyse mevcut progress'i koru
    }
  }, [allDownloads, url]);

  // Thumbnail info
  useEffect(() => {
    if (!url || !url.startsWith('http')) {
      setVideoInfo(null);
      return;
    }
    const timer = setTimeout(async () => {
      setIsFetchingInfo(true);
      try {
        const res = await fetch(`http://localhost:8000/api/info?url=${encodeURIComponent(url)}`);
        const data = await res.json();
        if (data && data.status === 'success') {
          setVideoInfo(data);
        }
      } catch (e) {} finally {
        setIsFetchingInfo(false);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [url]);

  const handleDownload = async (targetUrl = url) => {
    const finalUrl = targetUrl || url;
    if (!finalUrl) return;
    try {
      if (targetUrl !== url) setUrl(targetUrl);
      setIsCancelling(false);
      
      // Immediate UI Feedback BEFORE fetch
      setSearchResults([]); 
      setProgress({ status: 'searching', percentage: 0, display_name: 'Hazırlanıyor...' });
      showToast('İndirme İşlemi Başlatıldı');
      
      fetch('http://localhost:8000/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: finalUrl, format, quality, output_dir: downloadPath || 'downloads', cookie_browser: cookieBrowser })
      }).then(async res => {
          if (!res.ok) {
              const err = await res.json();
              throw new Error(err.message || 'İndirme başlatılamadı');
          }
      }).catch(err => {
          console.error('Download request failed', err);
          let msg = err.message || 'Bağlantı hatası!';
          if (msg.includes('429')) msg = "Spotify/Platform sınırlandırması (429). Biraz bekleyip tekrar deneyin.";
          setProgress({ status: 'error', message: msg });
      });
      
    } catch (error) {
      console.error('Download failed', error);
    }
  };

  const handleConfirmationResponse = async (approved) => {
    if (!pendingConfirmationUrl) return;
    try {
      await fetch('http://localhost:8000/api/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: pendingConfirmationUrl, approved })
      });
      setPendingConfirmationUrl(null);
    } catch (e) {
      console.error(e);
    }
  };

  const handleFallbackResponse = async (approved) => {
    if (!pendingFallbackUrl) return;
    try {
      await fetch('http://localhost:8000/api/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: pendingFallbackUrl, approved })
      });
      setPendingFallbackUrl(null);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCancel = async () => {
    if (isCancelling) return;
    setIsCancelling(true);
    try {
      await fetch('http://localhost:8000/api/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
    } catch (e) {
      console.error('Cancel failed', e);
    }
  };

  // Close modal on ESC key
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setPreviewItem(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const selectFolder = async () => {
    if (ipcRenderer) {
      const path = await ipcRenderer.invoke('select-directory');
      if (path) setDownloadPath(path);
    }
  };

  const saveConfig = async () => {
    try {
      await fetch('http://localhost:8000/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          download_path: downloadPath,
          cookie_browser: cookieBrowser,
          spotify_client_id: spotifyClientId,
          spotify_client_secret: spotifyClientSecret,
          match_threshold: matchThreshold
        })
      });
      showToast('✓ Ayarlar kaydedildi!');
    } catch (e) {
      showToast('⚠️ Kaydetme hatası!');
    }
  };

  const handleSpotifyConnect = async () => {
    setSpotifyConnectStatus('waiting');
    try {
      const resp = await fetch('http://localhost:8000/api/spotify-connect', { method: 'POST' });
      const data = await resp.json();
      if (data.status === 'success') {
        setSpotifyConnectStatus('success');
        setHasSpotifyCredentials(true);
        setTimeout(() => setSpotifyConnectStatus('idle'), 8000);
      } else {
        setSpotifyConnectStatus('error');
        showToast('⚠️ Bağlantı hatası: ' + (data.message || 'Bilinmeyen hata'), 8000);
      }
    } catch(err) {
      setSpotifyConnectStatus('error');
      showToast('⚠️ Bağlantı kurulamadı. Backend çalışıyor mu?', 6000);
    }
  };

  const filteredHistory = useMemo(() => {
    if (!historySearch.trim()) return historyList;
    const q = historySearch.toLowerCase();
    return historyList.filter(item => 
      (item.display_name && item.display_name.toLowerCase().includes(q)) ||
      (item.filename && item.filename.toLowerCase().includes(q)) ||
      (item.url && item.url.toLowerCase().includes(q))
    );
  }, [historyList, historySearch]);

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const res = await fetch('https://api.github.com/repos/Fukizikichi/miku-tool/releases/latest');
      if (!res.ok) {
        if (res.status === 404) {
          showToast('Henüz yayınlanmış bir GitHub Release bulunmuyor.');
        } else {
          showToast('Güncelleme kontrolü yapılamadı.');
        }
        return;
      }
      const data = await res.json();
      const latestTag = data.tag_name || '';
      const currentVersion = 'v1.0.0';
      if (latestTag && latestTag !== currentVersion) {
        showToast(`🎉 Yeni sürüm yayınlandı: ${latestTag}!`);
      } else {
        showToast('✓ En güncel sürümü kullanıyorsunuz (v1.0.0).');
      }
    } catch (e) {
      showToast('Güncelleme kontrolü sırasında ağ hatası oluştu.');
    } finally {
      setCheckingUpdate(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-900 overflow-hidden relative text-white font-sans">
      {/* Background Orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/20 rounded-full blur-[120px] pointer-events-none z-0"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-500/20 rounded-full blur-[120px] pointer-events-none z-0"></div>

      <AnimatePresence>
        {videoInfo && videoInfo.thumbnail && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-0 pointer-events-none transition-all duration-1000"
            style={{
              backgroundImage: `url(${videoInfo.thumbnail})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: 'blur(80px) saturate(150%) brightness(0.6)'
            }}
          />
        )}
      </AnimatePresence>

      {/* Custom Title Bar */}
      <div
        className="drag shrink-0 h-10 z-50 flex items-center justify-between px-4 bg-black/20 backdrop-blur-md border-b border-white/5"
        style={{ WebkitAppRegion: 'drag' }}
      >
        {/* Left: App identity */}
        <div className="flex items-center gap-2 opacity-50" style={{ WebkitAppRegion: 'no-drag', pointerEvents: 'none' }}>
          <svg width="14" height="14" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="20" cy="20" r="20" fill="#00D4FF" fillOpacity="0.15"/>
            <path d="M20 6C20 6 14 10 12 18C10 26 14 32 20 34C26 32 30 26 28 18C26 10 20 6 20 6Z" fill="#00D4FF" fillOpacity="0.7"/>
            <circle cx="16" cy="19" r="2" fill="white"/>
            <circle cx="24" cy="19" r="2" fill="white"/>
          </svg>
          <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/60">Miku Tool</span>
        </div>
        {/* Right: window controls */}
        <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' }}>
          <button
            onClick={() => ipcRenderer && ipcRenderer.send('window-minimize')}
            className="no-drag w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/40 hover:text-white/80 transition-all"
            title="Küçült"
          >
            <svg width="10" height="2" viewBox="0 0 10 2" fill="currentColor"><rect width="10" height="1.5" rx="0.75"/></svg>
          </button>
          <button
            onClick={() => ipcRenderer && ipcRenderer.send('window-maximize')}
            className="no-drag w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/40 hover:text-white/80 transition-all"
            title="Büyüt / Küçült"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="0.75" y="0.75" width="8.5" height="8.5" rx="1.5"/></svg>
          </button>
          <button
            onClick={() => ipcRenderer && ipcRenderer.send('window-close')}
            className="no-drag w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/80 text-white/40 hover:text-white transition-all"
            title="Kapat"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="1" y1="1" x2="9" y2="9"/><line x1="9" y1="1" x2="1" y2="9"/></svg>
          </button>
        </div>
      </div>

      {/* App Body */}
      <div className="flex flex-1 overflow-hidden relative z-10">
        {/* Sidebar */}
        <div className="w-64 glass-panel border-y-0 border-l-0 rounded-none z-10 flex flex-col p-4 no-drag">
          <motion.div 
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="flex items-center gap-3 mb-10 px-2 mt-4"
          >
            <DynamicMikuLogo 
              isPlaying={previewItem !== null} 
              isDownloading={progress?.status === 'downloading'} 
            />
            <h1 className="text-sm font-semibold tracking-[0.2em] uppercase text-white/70">Miku Downloader</h1>
          </motion.div>

          {/* Kuyruk sayacı hesabı */}
          {(() => {
            const queueCount = Object.values(allDownloads).filter(
              v => ['searching', 'downloading', 'expanding'].includes(v.status)
            ).length;
            return (
              <nav className="flex flex-col gap-2">
                <SidebarButton active={activeTab === 'download'} onClick={() => setActiveTab('download')} icon={<Download size={20} />} label="İndirici" badge={queueCount > 0 ? queueCount : null} />
                <SidebarButton active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={<History size={20} />} label="Geçmiş" />
                <SidebarButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<Settings size={20} />} label="Ayarlar" />
                {player.isOpen && (
                  <button
                    onClick={() => setActiveTab('history')}
                    className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-primary/10 border border-primary/20 text-primary mt-2"
                  >
                    <Music2 size={16} className="animate-pulse" />
                    <span className="text-[9px] font-bold uppercase tracking-wider truncate">{player.title || 'Çalıyor...'}</span>
                  </button>
                )}
              </nav>
            );
          })()}
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col z-10 overflow-y-auto no-drag custom-scrollbar overflow-x-hidden">
          <div className="p-8 pb-20 w-full max-w-4xl mx-auto">
          
          <AnimatePresence mode="wait">
            {activeTab === 'download' && (
              <motion.div 
                key="download"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="w-full"
              >
                <h2 className="text-xl font-semibold tracking-[0.15em] uppercase text-slate-200 mb-2">MEDYA İNDİR</h2>
                <p className="text-slate-400 mb-8 font-medium">Link yapıştırın veya doğrudan arama yapın.</p>

                <div className="glass-panel p-6 flex flex-col gap-6 relative z-[30] no-drag">
                  <div className="relative group">
                    <input 
                      type="text" 
                      placeholder="Medya linki yapıştırın (YouTube, Spotify, Instagram, Dailymotion...) veya şarkı arayın..." 
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      disabled={progress && ['downloading', 'searching', 'expanding', 'postprocessing'].includes(progress.status)}
                      className={cn(
                        "w-full bg-black/40 border border-white/5 rounded-2xl h-16 pl-14 pr-16 text-sm focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all outline-none placeholder:text-slate-600 font-medium",
                        progress && ['downloading', 'searching', 'expanding', 'postprocessing'].includes(progress.status)
                          ? 'opacity-40 cursor-not-allowed'
                          : ''
                      )}
                    />
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors">
                      {(isFetchingInfo || isSearching) ? <Loader2 size={24} className="animate-spin text-primary" /> : <Search size={24} />}
                    </div>
                    {url && !(progress && ['downloading', 'searching', 'expanding', 'postprocessing'].includes(progress.status)) && (
                        <button 
                            onClick={() => setUrl('')}
                            className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors p-1"
                        >
                            <X size={20} />
                        </button>
                    )}
                    {isFetchingInfo && (
                        <div className="absolute -bottom-6 left-2 flex items-center gap-2">
                            <span className="text-[10px] font-bold text-primary uppercase tracking-[0.2em] animate-pulse">Link Analiz Ediliyor...</span>
                        </div>
                    )}
                    {isSearching && !isFetchingInfo && (
                        <div className="absolute -bottom-6 left-2 flex items-center gap-2">
                            <span className="text-[10px] font-bold text-primary uppercase tracking-[0.2em] animate-pulse">Sonuçlar Aranıyor...</span>
                        </div>
                    )}
                  </div>

                  {/* Search Results Dropdown - Optimized transition */}
                  <AnimatePresence>
                    {searchResults.length > 0 && (
                      <motion.div 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex flex-col gap-1 p-1 bg-black/40 rounded-xl border border-white/5 overflow-hidden z-30"
                      >
                        {searchResults.map((item, idx) => (
                          <SearchResultItem 
                            key={item.id || item.url} 
                            item={item} 
                            idx={idx} 
                            setUrl={setUrl} 
                            setSearchResults={setSearchResults} 
                            setPreviewItem={setPreviewItem}
                            cn={cn}
                          />
                        ))}

                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="flex gap-2 p-2 bg-black/30 rounded-xl border border-white/5">
                    <FormatBtn active={format === 'mp3'} onClick={() => setFormat('mp3')} icon={<Music size={18} />} label="MP3" disabled={progress && ['downloading', 'searching', 'expanding', 'postprocessing'].includes(progress.status)} />
                    <FormatBtn active={format === 'mp4'} onClick={() => setFormat('mp4')} icon={<Video size={18} />} label="MP4" disabled={progress && ['downloading', 'searching', 'expanding', 'postprocessing'].includes(progress.status)} />
                  </div>

                  <motion.button 
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => handleDownload()} 
                    disabled={!url || (progress && (['downloading', 'searching', 'expanding', 'postprocessing'].includes(progress.status)))}
                    className={cn(
                        "btn-primary mt-2 flex items-center justify-center gap-3 h-14 shadow-2xl shadow-primary/20 relative overflow-hidden",
                        (!url || (progress && (['downloading', 'searching', 'expanding', 'postprocessing'].includes(progress.status)))) && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {(progress && (['downloading', 'searching', 'expanding', 'postprocessing'].includes(progress.status))) ? (
                      <>
                        <Loader2 size={24} className="animate-spin" />
                        ŞİMDİ İNDİR
                      </>
                    ) : (
                      <>
                        <Download size={24} />
                        ŞİMDİ İNDİR
                      </>
                    )}
                  </motion.button>
                </div>

                <AnimatePresence>
                    {progress && (
                    <motion.div 
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                        className="mt-8 glass-panel p-6 relative overflow-hidden"
                    >
                        <div className="flex justify-between items-end mb-3 relative z-10">
                        <div className="flex flex-col">
                            <span className={cn(
                              "text-[10px] uppercase font-bold tracking-widest mb-1",
                              progress.status === 'finished' ? 'text-green-400' :
                              progress.status === 'error' ? 'text-red-400' :
                              progress.status === 'expanding' ? 'text-blue-400' :
                              progress.status === 'cancelled' ? 'text-orange-400' :
                              (progress.status === 'downloading' && progress.percentage >= 85) ? 'text-yellow-400' : 'text-primary'
                            )}>
                                {progress.status === 'finished' ? '✓ Tamamlandı' : 
                                 progress.status === 'error' ? '✕ Hata!' : 
                                 progress.status === 'expanding' ? '⋯ Liste Açılıyor' :
                                 progress.status === 'cancelled' ? '↩ İptal Edildi' :
                                 (progress.status === 'downloading' && progress.percentage >= 85) ? '⚙ Dönüştürülüyor...' :
                                 'İşlem Devam Ediyor'}
                            </span>
                            <div className="text-sm font-semibold tracking-tight truncate max-w-[300px]">
                                {(progress.status === 'downloading' && progress.percentage >= 85)
                                  ? (progress.display_name || 'Ses/Video dönüştürülüyor, lütfen bekleyin...')
                                  : (progress.display_name || 'Hazırlanıyor...')}
                            </div>
                            {/* Dönüştürme açıklaması */}
                            {progress.status === 'downloading' && progress.percentage >= 85 && (
                              <div className="text-[9px] text-yellow-400/60 mt-1">
                                FFmpeg ile MP3/MP4'e dönüştürme yapılıyor. İptal etmeyin.
                              </div>
                            )}
                            {/* Playlist sayacı */}
                            {progress.playlist_total > 0 && (
                              <div className="flex items-center gap-2 mt-1.5">
                                <div className="flex items-center gap-1 text-[10px] font-bold text-green-400">
                                  <CheckCircle2 size={10} />
                                  {progress.playlist_finished}
                                </div>
                                {progress.playlist_errored > 0 && (
                                  <div className="flex items-center gap-1 text-[10px] font-bold text-red-400">
                                    <XCircle size={10} />
                                    {progress.playlist_errored}
                                  </div>
                                )}
                                <div className="text-[10px] text-slate-500 font-bold">
                                  / {progress.playlist_total} parça
                                </div>
                                <div className="flex-1 bg-black/30 rounded-full h-1 overflow-hidden">
                                  <div
                                    className="h-full bg-green-500 rounded-full transition-all duration-500"
                                    style={{ width: `${Math.round((progress.playlist_finished / progress.playlist_total) * 100)}%` }}
                                  />
                                </div>
                              </div>
                            )}
                            {progress.status === 'error' && progress.message && (
                               <div className="flex flex-col gap-1 mt-1">
                                 <div className="text-[10px] text-red-500/80 font-bold uppercase tracking-tighter animate-pulse">
                                     {progress.message}
                                 </div>
                                 {getErrorTip(progress.message) && (
                                   <div className="text-[9px] text-slate-400 font-medium">
                                       {getErrorTip(progress.message)}
                                   </div>
                                 )}
                               </div>
                            )}
                        </div>
                        <span className="text-lg text-primary font-semibold tracking-tight">{Math.round(progress.percentage)}%</span>
                        </div>

                        {/* Progress bar */}
                        <div className="w-full bg-black/40 rounded-full h-3 overflow-hidden mt-2 relative z-10">
                            <motion.div 
                                className={cn(
                                  "h-full rounded-full",
                                  progress.status === 'error' || progress.status === 'cancelled'
                                    ? 'bg-orange-500/60' :
                                  progress.status === 'expanding'
                                    ? 'bg-blue-500 animate-pulse' :
                                  (progress.status === 'downloading' && progress.percentage >= 85)
                                    ? 'bg-gradient-to-r from-yellow-500 to-orange-500 animate-pulse'
                                    : 'bg-gradient-to-r from-primary to-purple-600'
                                )}
                                initial={{ width: 0 }}
                                animate={{ width: `${progress.percentage}%` }}
                                transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
                            />
                        </div>

                        {/* Hız ve Kalan Süre Göstergesi */}
                        {progress.status === 'downloading' && (progress.speed || progress.eta) && (
                          <div className="flex items-center justify-between mt-2.5 px-1 text-[11px] font-mono">
                            {progress.speed > 0 ? (
                              <span className="flex items-center gap-1.5 text-primary font-semibold">
                                <Zap size={12} className="text-primary animate-pulse" />
                                {formatSpeed(progress.speed)}
                              </span>
                            ) : <span />}
                            {progress.eta > 0 && (
                              <span className="flex items-center gap-1.5 text-slate-400 font-medium">
                                <Clock size={12} className="text-slate-500" />
                                {formatEta(progress.eta)} kaldı
                              </span>
                            )}
                          </div>
                        )}

                        {/* Cancel Button — only while downloading */}
                        <AnimatePresence>
                          {progress.status === 'downloading' && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="overflow-hidden"
                            >
                              <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={handleCancel}
                                disabled={isCancelling}
                                className={cn(
                                  "mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl border transition-all text-[10px] font-bold uppercase tracking-widest",
                                  isCancelling
                                    ? 'border-slate-700 text-slate-600 cursor-not-allowed'
                                    : 'border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/60'
                                )}
                              >
                                {isCancelling
                                  ? <><Loader2 size={14} className="animate-spin" /> İptal ediliyor...</>
                                  : <><XCircle size={14} /> İndirmeyi İptal Et</>
                                }
                              </motion.button>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {progress.status === 'finished' && (
                          <div className="flex flex-col gap-3 w-full mt-6">
                            {progress.filename && (
                              <button
                                onClick={() => setPlayer({
                                  src: `http://localhost:8000/api/files/${encodeURIComponent(progress.filename)}`,
                                  title: progress.display_name || progress.filename,
                                  isOpen: true
                                })}
                                className="flex items-center justify-center gap-2 py-3 px-6 rounded-2xl border border-primary/30 text-primary hover:bg-primary/10 hover:border-primary/60 transition-all text-[10px] font-black uppercase tracking-widest relative z-10 w-full cursor-pointer shadow-lg shadow-primary/5"
                              >
                                <Play size={14} /> Şimdi Oynat
                              </button>
                            )}
                            <button
                                onClick={() => handleShowInFolder(progress.filename)}
                                className="flex items-center justify-center gap-2 py-3 px-6 rounded-2xl border border-green-500/30 text-green-400 hover:bg-green-500/10 hover:border-green-500/60 transition-all text-[10px] font-black uppercase tracking-widest relative z-10 w-full cursor-pointer shadow-lg shadow-green-500/5"
                            >
                                <FolderOpen size={14} /> Dosyayı Klasörde Göster
                            </button>
                          </div>
                        )}

                        {/* QR Code — on finish */}
                        {progress.status === 'finished' && (
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                            className="mt-8 flex flex-col items-center justify-center p-6 bg-primary/5 rounded-3xl border border-primary/10 relative z-10"
                        >
                            <div className="flex items-center gap-2 text-primary font-bold text-xs mb-6 uppercase tracking-widest">
                                <Share2 size={16} /> QR KOD İLE TELEFONA AKTAR
                            </div>
                            <div className="bg-white p-4 rounded-3xl shadow-2xl mb-4">
                                <QRCodeCanvas 
                                    value={progress.filename ? `http://${localIp}:8000/api/files/${encodeURIComponent(progress.filename)}` : url} 
                                    size={180} level="H"
                                />
                            </div>
                            <p className="text-[10px] text-slate-500 font-bold opacity-50 px-8 text-center uppercase tracking-tighter">
                                Telefonunuzu aynı Wi-Fi ağına bağlayıp kodu okutun.
                            </p>
                        </motion.div>
                        )}
                    </motion.div>
                    )}
                </AnimatePresence>
              </motion.div>
            )}

            {activeTab === 'history' && (
              <motion.div 
                key="history"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="w-full"
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold tracking-[0.15em] uppercase text-slate-200">İŞLEMLER & GEÇMİŞ</h2>
                  <button 
                    onClick={async () => {
                      showToast('Liste temizleniyor...');
                      try {
                        await fetch('http://localhost:8000/api/clear_progress', { method: 'POST' });
                        setAllDownloads({});
                        setHistoryList([]);
                        setHistorySearch('');
                        showToast('✓ Liste temizlendi.');
                      } catch(e) { showToast('⚠️ Hata oluştu.'); }
                    }}
                    className="text-[10px] font-bold text-slate-500 hover:text-red-500 transition-colors tracking-widest bg-white/5 px-4 py-2 rounded-xl border border-white/5"
                  >
                    LİSTEYİ SIFIRLA
                  </button>
                </div>

                {historyList.length > 0 && (
                  <div className="relative mb-6">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                    <input
                      type="text"
                      placeholder="Geçmişte filtrele (şarkı adı, sanatçı, dosya)..."
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl pl-10 pr-9 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-primary/50 transition-colors"
                    />
                    {historySearch && (
                      <button
                        onClick={() => setHistorySearch('')}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )}
                
                {historyList.length === 0 ? (
                  <div className="glass-panel p-20 text-center flex flex-col items-center gap-4 opacity-40">
                    <History size={64} />
                    <p className="text-lg font-bold uppercase tracking-widest">Henüz bir işlem yok.</p>
                  </div>
                ) : filteredHistory.length === 0 ? (
                  <div className="glass-panel p-12 text-center flex flex-col items-center gap-3 opacity-50">
                    <Search size={36} className="text-slate-500" />
                    <p className="text-sm font-semibold">"{historySearch}" ile eşleşen bir indirme bulunamadı.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {filteredHistory.map((item, i) => (
                      <motion.div 
                        layout
                        key={item.url || i} 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="glass-panel p-5 flex items-center gap-5 hover:border-primary/30 transition-all group relative overflow-hidden"
                      >
                        <div className={cn(
                            "w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border border-white/5 shadow-inner",
                            item.status === 'finished' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 
                            item.status === 'error' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                            'bg-primary/10 text-primary border-primary/20'
                        )}>
                          {item.status === 'finished' ? <CheckCircle2 size={28} /> : 
                           item.status === 'error' ? <XCircle size={28} /> :
                           <Loader2 size={28} className="animate-spin" />}
                        </div>

                        <div className="flex flex-col flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-bold truncate text-slate-200">{item.display_name || item.filename || "İşlem Bekleniyor"}</span>
                            <span className={cn(
                                "text-[8px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest",
                                item.status === 'finished' ? 'bg-green-500/20 text-green-400' :
                                item.status === 'error' ? 'bg-red-500/20 text-red-400' :
                                'bg-primary/20 text-primary animate-pulse'
                            )}>
                                {item.status}
                            </span>
                          </div>
                          {item.status === 'error' && item.message && (
                             <div className="flex flex-col gap-1 mb-1">
                               <div className="text-[10px] text-red-500/80 font-bold uppercase tracking-tighter">
                                   Hata: {item.message}
                               </div>
                               {getErrorTip(item.message) && (
                                 <div className="text-[9px] text-slate-400 font-medium">
                                     {getErrorTip(item.message)}
                                 </div>
                               )}
                             </div>
                           )}
                          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter opacity-60 truncate">{item.url}</span>
                          
                          {item.status === 'downloading' && (
                             <div className="w-full bg-white/5 h-1 rounded-full mt-3 overflow-hidden">
                                <motion.div 
                                    className="h-full bg-primary"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${item.percentage}%` }}
                                />
                             </div>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-2 shrink-0">
                            <div className="text-[10px] font-bold text-slate-600 tabular-nums">
                                {item.time ? new Date(item.time).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                            </div>
                            {item.status === 'finished' && (
                                <div className="flex flex-col gap-1.5 items-end">
                                    {item.filename && (
                                        <button
                                            onClick={() => setPlayer({
                                                src: `http://localhost:8000/api/files/${encodeURIComponent(item.filename)}`,
                                                title: item.display_name || item.filename,
                                                isOpen: true
                                            })}
                                            className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-primary hover:text-white bg-primary/10 hover:bg-primary/20 border border-primary/20 px-3 py-1.5 rounded-xl transition-all"
                                        >
                                            <Play size={10} /> OYNAT
                                        </button>
                                    )}
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => { setUrl(item.url); setActiveTab('download'); }}
                                            className="text-[10px] text-slate-500 hover:text-slate-300 hover:underline font-black uppercase tracking-widest"
                                        >
                                            TEKRAR GÖR
                                        </button>
                                        <span className="text-[10px] text-slate-700 font-bold select-none">•</span>
                                        <button 
                                            onClick={() => handleShowInFolder(item.filename)}
                                            className="text-[10px] text-green-400 hover:underline font-black uppercase tracking-widest"
                                        >
                                            KLASÖRDE GÖSTER
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}


            {activeTab === 'settings' && (
              <motion.div 
                key="settings"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.02 }}
                className="w-full"
              >
                 <h2 className="text-xl font-semibold tracking-[0.15em] uppercase text-slate-200 mb-8">AYARLAR</h2>
                 <div className="glass-panel p-8 flex flex-col gap-10">
                    
                    <section>
                      <h3 className="text-xs font-bold mb-6 text-primary tracking-[0.2em] uppercase">Spotify API & Direct Download</h3>
                      <div className="flex flex-col gap-6">
                        
                        {/* Spotify API Keys */}
                        <div className="flex flex-col gap-4 p-6 bg-white/5 rounded-3xl border border-white/5">
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Spotify API Anahtarları</label>
                            {spotifyKeysLocked ? (
                              <button
                                onClick={() => {
                                  setSpotifyKeysLocked(false);
                                  showToast('⚠️ Anahtarları değiştiriyorsunuz. Kaydedildiğinde üstlerine yazılır.');
                                }}
                                className="text-[10px] font-bold text-primary/70 hover:text-primary uppercase tracking-widest flex items-center gap-1 bg-primary/10 px-3 py-1.5 rounded-xl border border-primary/20"
                              >
                                <Lock size={11} /> Değiştir
                              </button>
                            ) : (
                              <button
                                onClick={() => setSpotifyKeysLocked(true)}
                                className="text-[10px] font-bold text-slate-500 hover:text-slate-300 uppercase tracking-widest flex items-center gap-1 bg-white/5 px-3 py-1.5 rounded-xl border border-white/10"
                              >
                                <LockOpen size={11} /> İptal
                              </button>
                            )}
                          </div>
                          {spotifyKeysLocked ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="flex flex-col gap-2">
                                <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest pl-1">Client ID</label>
                                <input readOnly value={spotifyClientId ? '••••••••••••' : ''} placeholder="Girilmedi" className="glass-input text-xs opacity-50 cursor-not-allowed" />
                              </div>
                              <div className="flex flex-col gap-2">
                                <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest pl-1">Client Secret</label>
                                <input readOnly value={spotifyClientSecret ? '••••••••••••' : ''} placeholder="Girilmedi" className="glass-input text-xs opacity-50 cursor-not-allowed" />
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="flex flex-col gap-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Spotify Client ID</label>
                                <input type="text" value={spotifyClientId} onChange={e => setSpotifyClientId(e.target.value)} placeholder="Client ID girin..." className="glass-input text-xs" />
                              </div>
                              <div className="flex flex-col gap-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Spotify Client Secret</label>
                                <input type="password" value={spotifyClientSecret} onChange={e => setSpotifyClientSecret(e.target.value)} placeholder="Client Secret girin..." className="glass-input text-xs" />
                              </div>
                            </div>
                          )}
                          <p className="text-[11px] text-slate-600 italic px-1">
                            * Arama kotasını yükseltmek için gereklidir. Girmeseniz de Spotify Connect ile indirme yapabilirsiniz.
                          </p>

                          <div className="bg-primary/5 p-5 rounded-2xl border border-primary/10 flex flex-col gap-2 mt-2">
                            <span className="text-[10px] font-black text-primary uppercase tracking-widest block">API Anahtarları Nasıl Alınır?</span>
                            <p className="text-[12px] text-slate-400 leading-relaxed font-mono">
                              1. <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer" className="text-primary hover:underline font-bold">Spotify Developer Dashboard</a> sayfasına gidip giriş yapın.<br/>
                              2. <strong>"Create app"</strong> butonuna basın, uygulama adı ve açıklaması belirleyin.<br/>
                              3. <strong>Redirect URI</strong> alanına <code>http://localhost:3000</code> yazın ve kaydedin.<br/>
                              4. Uygulamanın <strong>"Settings"</strong> menüsünden <strong>Client ID</strong> ve <strong>Client Secret</strong> değerlerini kopyalayıp buraya yapıştırın.
                            </p>
                          </div>
                        </div>

                        {/* Spotify Connect */}
                        <div className="bg-primary/5 p-6 rounded-[32px] border border-primary/10">
                            <div className="mb-5">
                                <h4 className="text-[14px] font-bold text-white mb-1">SPOTIFY BAĞLANTISI</h4>
                                <p className="text-[13px] text-slate-500">Spotify playlist ve albüm indirmeleri için telefon ile eşleştirin.</p>
                            </div>
                            <div className="flex flex-col items-center justify-center p-6 bg-slate-800/50 rounded-2xl border border-white/5 space-y-4">
                                {spotifyConnectStatus === 'idle' || spotifyConnectStatus === 'error' ? (
                                    <>
                                        <button
                                            onClick={handleSpotifyConnect}
                                            className="btn-primary w-full px-6 py-4 flex items-center justify-center gap-3 font-semibold tracking-wider text-[11px] uppercase bg-green-500 hover:bg-green-600 shadow-green-500/20 shadow-lg text-white"
                                        >
                                            <Radio size={18} />
                                            {hasSpotifyCredentials ? 'Spotify Yeniden Eşleştir' : 'Spotify ile Cihazı Eşleştir'}
                                        </button>
                                        {hasSpotifyCredentials && (
                                            <p className="text-[12px] text-green-400 text-center px-4 font-bold mt-1 uppercase tracking-widest">✓ Cihaz Önceden Eşleştirildi!</p>
                                        )}
                                        <p className="text-[12px] text-slate-400 text-center px-4 leading-relaxed">Şifreye gerek olmadan ağınızdaki Spotify'dan kimlik bilgilerini aktarır.</p>
                                    </>
                                ) : spotifyConnectStatus === 'waiting' ? (
                                    <div className="flex flex-col items-center gap-4 animate-pulse">
                                        <RefreshCw className="animate-spin text-green-400" size={32} />
                                        <div className="text-center">
                                            <p className="text-[14px] font-bold text-white mb-2 tracking-wide">Eşleşme Bekleniyor</p>
                                            <p className="text-[12px] text-slate-400 leading-relaxed font-mono">1. Telefondan Spotify'ı açın ve bir şarkı başlatın.<br/> 2. Cihazlar (Hoparlör) kısmına basın.<br/> 3. Listeden "MikuTool" cihazını seçin.</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center border border-green-500/30 text-green-400">
                                            <Check size={32} />
                                        </div>
                                        <p className="text-[14px] font-bold text-white tracking-widest uppercase">Eşleşme Başarılı</p>
                                        <p className="text-[11px] text-green-400/80 text-center font-medium px-4">Kimlik bilgileri kaydedildi. Bağlantının otomatik kesilmesi normaldir.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-4 mt-2 items-center">
                            <button onClick={saveConfig} className="btn-primary w-fit px-10 py-5 text-[10px] font-semibold uppercase tracking-wider shadow-xl shadow-primary/20">
                                Ayarları Kaydet
                            </button>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={async () => {
                                        showToast('⏳ yt-dlp güncelleniyor...');
                                        try {
                                            const res = await fetch('http://localhost:8000/api/update_ytdlp', { method: 'POST' });
                                            const data = await res.json();
                                            if (data.status === 'success') {
                                                showToast('✓ Motor güncellendi! Değişikliklerin geçerli olması için uygulamayı yeniden başlatın.', 10000);
                                            } else {
                                                showToast('⚠️ Güncelleme başarısız: ' + (data.output || 'Bilinmeyen hata'), 8000);
                                            }
                                        } catch(e) { showToast('⚠️ Bağlantı hatası! Backend çalışıyor mu?', 6000); }
                                    }} 
                                    className="btn-secondary w-fit px-10 py-5 text-[10px] font-semibold uppercase tracking-wider border border-white/10 hover:border-primary/50"
                                >
                                    <RefreshCw size={14} className="mr-2 inline" />
                                    İndirme Motorunu Güncelle (yt-dlp)
                                </button>
                                <button 
                                    onClick={() => showToast('yt-dlp motoru YouTube ve diğer platformların indirme algoritmalarını takip eder. İndirmelerde hata alırsanız güncelleyin.', 8000)}
                                    className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-slate-400 transition-all"
                                    title="Bilgi Al"
                                >
                                    <HelpCircle size={18} />
                                </button>
                            </div>
                        </div>
                      </div>
                    </section>

                    <div className="h-px bg-white/5" />

                    <section>
                       <h3 className="text-xs font-semibold mb-4 tracking-[0.15em] uppercase text-primary/80">Depolama Dizini</h3>
                       <div className="flex gap-2">
                        <input type="text" readOnly value={downloadPath || "STANDART İNDİRMELER"} className="glass-input flex-1 italic text-xs opacity-50" />
                        <button onClick={selectFolder} className="btn-secondary px-6 font-semibold uppercase text-[9px]">Gözat</button>
                      </div>
                    </section>

                    <section className="bg-primary/5 p-6 rounded-3xl border border-primary/10">
                        <h3 className="text-xs font-semibold mb-2 uppercase tracking-wider text-primary/80">Oturum Yönetimi (Cookies)</h3>
                        <p className="text-[14px] text-slate-500 mb-4 font-medium uppercase tracking-wide opacity-80">Özel içerikler için giriş yapılmış tarayıcıyı seçin:</p>
                        <select
                            value={cookieBrowser}
                            onChange={e => setCookieBrowser(e.target.value)}
                            className="bg-black/40 border border-white/10 rounded-2xl px-4 py-4 text-white focus:outline-none focus:border-primary w-full appearance-none font-semibold text-[11px] uppercase tracking-wider"
                        >
                            <option value="none">DEVRE DIŞI</option>
                            <option value="chrome">GOOGLE CHROME</option>
                            <option value="firefox">MOZILLA FIREFOX</option>
                            <option value="edge">MICROSOFT EDGE</option>
                            <option value="brave">BRAVE BROWSER</option>
                        </select>
                    </section>

                    <div className="h-px bg-white/5" />

                    {/* Eşleşme Hassasiyeti */}
                    <section className="bg-white/3 p-6 rounded-3xl border border-white/5">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Eşleşme Hassasiyeti (Smart Confirmation)</h3>
                            <span className="text-lg font-bold text-primary tabular-nums">{matchThreshold}</span>
                        </div>
                        <input
                            type="range"
                            min={0} max={100} step={5}
                            value={matchThreshold}
                            onChange={e => setMatchThreshold(Number(e.target.value))}
                            className="w-full accent-primary"
                        />
                        <div className="flex justify-between text-[10px] text-slate-600 mt-1 px-1">
                            <span>Daima Onay</span>
                            <span>Otomatik</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
                            Bu değerin <span className="text-primary font-bold">altındaki</span> skor alan şarkılar otomatik onay ister. <span className="text-amber-400">Düşürdükçe daha az onay sorulur ama yanlış şarkı gelme ihtimali artar.</span> Varsayılan: 60.
                        </p>
                     </section>

                     <div className="h-px bg-white/5" />

                     {/* Log Viewer — Sistem Günlüğü */}
                     <section>
                       <div className="flex items-center justify-between mb-4">
                         <div className="flex items-center gap-2">
                           <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Sistem Günlüğü</h3>
                           {logTotalLines > 0 && (
                             <span className="text-[9px] text-slate-600 font-bold bg-white/5 px-2 py-0.5 rounded-full">
                               {logTotalLines} satır / {(logTotalSize / 1024).toFixed(1)} KB
                             </span>
                           )}
                         </div>
                         <div className="flex items-center gap-2">
                           <button
                             onClick={() => setLogAutoRefresh(p => !p)}
                             className={cn(
                               "text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl border transition-all flex items-center gap-1.5",
                               logAutoRefresh
                                 ? 'bg-primary/20 text-primary border-primary/30'
                                 : 'bg-white/5 text-slate-500 border-white/10 hover:text-slate-300'
                             )}
                           >
                             <svg className={cn('w-2.5 h-2.5', logAutoRefresh && 'animate-spin')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                             {logAutoRefresh ? 'Canlı' : 'Duraklat'}
                           </button>
                           <button
                             onClick={() => fetchLogs(logLineCount)}
                             disabled={logLoading}
                             className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                           >
                             {logLoading ? '...' : 'Yenile'}
                           </button>
                           <button
                             onClick={copyLogs}
                             className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 text-slate-400 hover:text-primary hover:border-primary/30 transition-all"
                           >
                             Kopyala
                           </button>
                           <button
                             onClick={clearLogs}
                             className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 hover:bg-red-500/15 transition-all"
                           >
                             Temizle
                           </button>
                         </div>
                       </div>

                       {/* Satır sayısı seçici */}
                       <div className="flex items-center gap-3 mb-3">
                         <span className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">Son</span>
                         {[50, 100, 200, 500].map(n => (
                           <button
                             key={n}
                             onClick={() => { setLogLineCount(n); fetchLogs(n); }}
                             className={cn(
                               "text-[9px] font-black px-2.5 py-1 rounded-lg border transition-all",
                               logLineCount === n
                                 ? 'bg-primary/20 text-primary border-primary/30'
                                 : 'bg-white/5 text-slate-500 border-white/10 hover:text-slate-300'
                             )}
                           >
                             {n}
                           </button>
                         ))}
                         <span className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">satır</span>
                       </div>

                       {/* Log terminal penceresi */}
                       <div
                         className="bg-black/60 border border-white/5 rounded-2xl p-4 font-mono text-[10px] leading-relaxed overflow-y-auto"
                         style={{ maxHeight: '280px', minHeight: '160px' }}
                       >
                         {logLines.length === 0 ? (
                           <div className="text-slate-700 text-center py-8 uppercase tracking-widest font-bold">
                             {logLoading ? 'Loglar yükleniyor...' : 'Log bulunamadı'}
                           </div>
                         ) : (
                           logLines.map((line, i) => {
                             const isError = /error|hata|critical|exception|traceback/i.test(line);
                             const isWarn  = /warn|uyar|429|timeout|zaman aşımı/i.test(line);
                             const isOk    = /tamamlandı|başar|success|finished|açıldı/i.test(line);
                             return (
                               <div
                                 key={i}
                                 className={cn(
                                   'py-0.5 px-1 rounded select-text break-all',
                                   isError ? 'text-red-400 bg-red-500/5' :
                                   isWarn  ? 'text-amber-400' :
                                   isOk    ? 'text-green-400' :
                                   'text-slate-500'
                                 )}
                               >
                                 <span className="text-slate-700 mr-2 select-none">{logTotalLines - logLines.length + i + 1}</span>
                                 {line}
                               </div>
                             );
                           })
                         )}
                         <div ref={logEndRef} />
                       </div>
                     </section>

                     <div className="h-px bg-white/5" />

                     {/* Sistem Ayarları — Tray & Otomatik Başlat */}
                     <section className="bg-white/3 p-6 rounded-3xl border border-white/5">
                       <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-5">Sistem</h3>
                       <div className="flex flex-col gap-4">

                         {/* Tray Toggle */}
                         <div className="flex items-center justify-between">
                           <div>
                             <p className="text-sm font-semibold text-white">Tray'e Küçült</p>
                             <p className="text-[11px] text-slate-500 mt-0.5">Kapatınca tamamen kapanmak yerine arka planda çalışmaya devam et.</p>
                           </div>
                           <button
                             onClick={async () => {
                               const next = !trayEnabled;
                               setTrayEnabled(next);
                               if (ipcRenderer) {
                                 await ipcRenderer.invoke('set-tray-enabled', next);
                               }
                               showToast(next ? '✓ Tray aktif — kapatınca küçülür' : '✓ Tray devre dışı');
                             }}
                             className={cn(
                               'relative w-12 h-6 rounded-full transition-all duration-300 border shrink-0',
                               trayEnabled
                                 ? 'bg-primary border-primary/50 shadow-lg shadow-primary/20'
                                 : 'bg-white/5 border-white/10'
                             )}
                           >
                             <span className={cn(
                               'absolute top-0.5 w-5 h-5 rounded-full transition-all duration-300 shadow-md',
                               trayEnabled ? 'left-6 bg-black' : 'left-0.5 bg-slate-400'
                             )} />
                           </button>
                         </div>

                         <div className="h-px bg-white/5" />

                         {/* Auto Launch Toggle */}
                         <div className="flex items-center justify-between">
                           <div>
                             <p className="text-sm font-semibold text-white">Otomatik Başlat</p>
                             <p className="text-[11px] text-slate-500 mt-0.5">Bilgisayar açıldığında Miku Tool'u otomatik başlat.</p>
                           </div>
                           <button
                             onClick={async () => {
                               const next = !autoLaunchEnabled;
                               setAutoLaunchEnabled(next);
                               if (ipcRenderer) {
                                 await ipcRenderer.invoke('set-auto-launch', next);
                               }
                               showToast(next ? '✓ Otomatik başlatma aktif' : '✓ Otomatik başlatma devre dışı');
                             }}
                             className={cn(
                               'relative w-12 h-6 rounded-full transition-all duration-300 border shrink-0',
                               autoLaunchEnabled
                                 ? 'bg-primary border-primary/50 shadow-lg shadow-primary/20'
                                 : 'bg-white/5 border-white/10'
                             )}
                           >
                             <span className={cn(
                               'absolute top-0.5 w-5 h-5 rounded-full transition-all duration-300 shadow-md',
                               autoLaunchEnabled ? 'left-6 bg-black' : 'left-0.5 bg-slate-400'
                             )} />
                           </button>
                         </div>

                         <div className="h-px bg-white/5" />

                         {/* Miku Melodisi (İndirme Tamamlandı Sesi) */}
                         <div className="flex items-center justify-between">
                           <div>
                             <p className="text-sm font-semibold text-white">Miku Melodisi (Bildirim Sesi)</p>
                             <p className="text-[11px] text-slate-500 mt-0.5">İndirme tamamlandığında çalınan Hatsune Miku arpej synth sesi.</p>
                           </div>
                           <button
                             onClick={() => {
                               playPing();
                               showToast('🎵 Miku bildirim melodisi çalındı!');
                             }}
                             className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/20 text-xs font-semibold text-primary hover:bg-primary/20 transition-all cursor-pointer"
                           >
                             <Volume2 size={13} />
                             Dinle
                           </button>
                         </div>

                       </div>
                     </section>

                     <div className="h-px bg-white/5" />

                     {/* Hakkında & Güncelleme Denetimi */}
                     <section className="bg-white/3 p-6 rounded-3xl border border-white/5 flex flex-col items-center justify-center text-center">
                         <div className="flex items-center gap-2 mb-1.5">
                           <Sparkles size={16} className="text-primary animate-pulse" />
                           <p className="text-xs font-bold tracking-[0.25em] text-white uppercase">Miku Tool</p>
                           <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-bold">v1.0.0</span>
                         </div>
                         <p className="text-[11px] text-slate-400 max-w-sm mb-4">
                           YouTube, Spotify, SoundCloud, Dailymotion, Instagram ve TikTok için modern, güvenli ve evrensel medya indirici.
                         </p>
                         <button
                           onClick={handleCheckUpdate}
                           disabled={checkingUpdate}
                           className="flex items-center gap-2 px-5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 hover:text-white transition-all cursor-pointer shadow-lg active:scale-95"
                         >
                           <RefreshCw size={12} className={cn(checkingUpdate && "animate-spin text-primary")} />
                           {checkingUpdate ? 'Kontrol Ediliyor...' : 'Güncellemeleri Denetle'}
                         </button>
                     </section>
                  </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      {/* Multi-Platform Preview Modal */}
      <AnimatePresence>
        {previewItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPreviewItem(null)}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.85, opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-3xl rounded-3xl overflow-hidden shadow-2xl border border-white/10 bg-black"
            >
              {/* Close button */}
              <button
                onClick={() => setPreviewItem(null)}
                className="absolute top-3 right-3 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/90 text-white transition-all border border-white/10"
              >
                <X size={16} />
              </button>

              {/* Header */}
              <div className="flex items-center gap-3 px-5 py-4 bg-white/5 border-b border-white/5">
                <div className={cn(
                  "w-7 h-7 rounded-lg flex items-center justify-center",
                  previewItem?.platform === 'spotify' ? 'bg-[#1DB954]/20' :
                  previewItem?.platform === 'soundcloud' ? 'bg-[#FF5500]/20' : 'bg-red-500/20'
                )}>
                  {previewItem?.platform === 'spotify' ? <Music2 size={16} className="text-[#1DB954]" /> :
                   previewItem?.platform === 'soundcloud' ? <Radio size={16} className="text-[#FF5500]" /> :
                   <PlayCircle size={16} className="text-red-400" />}
                </div>
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                  {previewItem?.platform?.toUpperCase()} Önizleme
                </span>
                <a
                  href={previewItem?.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto flex items-center gap-1.5 text-[14px] font-semibold uppercase tracking-wider text-primary hover:text-white transition-colors"
                >
                  <ExternalLink size={12} /> {previewItem?.platform === 'youtube' ? "YouTube'da" : "Platformda"} Aç
                </a>
              </div>

              {/* Iframe Logic */}
              <div className="relative w-full overflow-hidden" style={{ height: previewItem?.platform === 'youtube' ? 'auto' : '166px', paddingBottom: previewItem?.platform === 'youtube' ? '56.25%' : '0' }}>
                {previewItem?.platform === 'youtube' ? (
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${previewItem?.id}?autoplay=1&rel=0`}
                    title="YouTube preview"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                    className="absolute inset-0 w-full h-full border-none"
                  />
                ) : previewItem?.platform === 'spotify' ? (
                  <iframe
                    src={`https://open.spotify.com/embed/track/${previewItem?.id}?utm_source=generator`}
                    width="100%"
                    height="166"
                    frameBorder="0"
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    loading="lazy"
                    className="border-none"
                  />
                ) : (
                  // SoundCloud — auto_play=false (tarayıcı politikası gereği otomatik oynatma engelli)
                  <iframe
                    width="100%"
                    height="166"
                    scrolling="no"
                    frameBorder="no"
                    allow="autoplay"
                    src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(previewItem?.url || '')}&color=%2300d4ff&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=true`}
                    className="border-none w-full"
                    onError={(e) => { e.target.style.display='none'; }}
                  />
                )}
              </div>

              {/* Download from modal */}
              <div className="px-5 py-4 bg-white/5 border-t border-white/5 flex items-center justify-between gap-3">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest truncate max-w-[60%]">
                  {previewItem.title}
                </span>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => { handleDownload(previewItem.url); setPreviewItem(null); }}
                  className="btn-primary px-6 py-2.5 text-[9px] font-semibold uppercase tracking-wider shrink-0"
                >
                  <Download size={14} /> İndir
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Smart Confirmation Modal */}
      <AnimatePresence>
        {pendingConfirmationUrl && allDownloads[pendingConfirmationUrl]?.status === 'needs_confirmation' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-xl p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 30 }}
              className="w-full max-w-md bg-slate-900/90 border border-white/10 rounded-[32px] overflow-hidden shadow-2xl"
            >
              <div className="p-8">
                <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mb-6 mx-auto">
                    <ShieldAlert size={32} className="text-amber-500" />
                </div>
                
                <h2 className="text-xl font-bold text-center mb-2 text-white">Emin Misiniz?</h2>
                <p className="text-slate-400 text-center text-sm mb-8 leading-relaxed">
                    İstediğiniz şarkı ile bulduğumuz şarkı arasında düşük eşleşme puanı tespiti yapıldı.
                </p>

                <div className="space-y-4 mb-8">
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest block mb-1">İstenen Medya</span>
                            <p className="text-xs font-semibold text-slate-200 line-clamp-1">{allDownloads[pendingConfirmationUrl].target_title}</p>
                        </div>
                        <button 
                            onClick={() => {
                                const item = allDownloads[pendingConfirmationUrl];
                                setPreviewItem({
                                    platform: 'spotify',
                                    id: item.target_url.split('track/')[1]?.split('?')[0],
                                    url: item.target_url,
                                    title: item.target_title
                                });
                            }}
                            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-primary shrink-0 transition-all"
                            title="Önizle"
                        >
                            <Eye size={14} />
                        </button>
                    </div>

                    <div className="bg-amber-500/5 p-4 rounded-2xl border border-amber-500/10 relative overflow-hidden flex items-center justify-between gap-3">
                        <div className="absolute top-0 right-10 p-2 bg-amber-500/20 rounded-bl-xl">
                            <span className="text-[10px] font-black text-amber-500">%{allDownloads[pendingConfirmationUrl].max_score} PUAN</span>
                        </div>
                        <div className="min-w-0">
                            <span className="text-[10px] text-amber-500 uppercase font-black tracking-widest block mb-1">Bulunan Medya</span>
                            <p className="text-xs font-semibold text-slate-200 line-clamp-1">{allDownloads[pendingConfirmationUrl].found_title}</p>
                            <p className="text-[10px] text-slate-500 mt-1 uppercase font-bold">{allDownloads[pendingConfirmationUrl].found_uploader} • {allDownloads[pendingConfirmationUrl].found_platform}</p>
                        </div>
                        <button 
                            onClick={() => {
                                const item = allDownloads[pendingConfirmationUrl];
                                setPreviewItem({
                                    platform: item.found_platform,
                                    id: item.found_platform === 'youtube' ? item.found_url.split('v=')[1] : null,
                                    url: item.found_url,
                                    title: item.found_title
                                });
                            }}
                            className="w-8 h-8 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 flex items-center justify-center text-amber-500 shrink-0 transition-all border border-amber-500/20"
                            title="Önizle"
                        >
                            <Eye size={14} />
                        </button>
                    </div>

                    <div className="px-2">
                        <p className="text-[10px] text-red-400 font-bold uppercase tracking-tight italic opacity-80">
                           Neden: {allDownloads[pendingConfirmationUrl].failure_reason}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <button 
                        onClick={() => handleConfirmationResponse(false)}
                        className="py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-xs transition-all border border-white/5"
                    >
                        HAYIR, İPTAL ET
                    </button>
                    <button 
                        onClick={() => handleConfirmationResponse(true)}
                        className="py-4 rounded-2xl bg-primary hover:bg-primary-hover text-white font-bold text-xs transition-all shadow-lg shadow-primary/20"
                    >
                        EVET, DOĞRU ŞARKI
                    </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Platform Fallback Modal — Cannot get alternative track */}
      <AnimatePresence>
        {pendingFallbackUrl && allDownloads[pendingFallbackUrl]?.status === 'needs_platform_fallback' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 backdrop-blur-xl p-4"
          >
            <motion.div
              initial={{ scale: 0.88, opacity: 0, y: 40 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.88, opacity: 0, y: 40 }}
              transition={{ type: 'spring', bounce: 0.25, duration: 0.45 }}
              className="w-full max-w-md bg-slate-900/95 border border-white/10 rounded-[36px] overflow-hidden shadow-2xl"
            >
              {/* Top gradient stripe */}
              <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 via-orange-400 to-red-500" />

              <div className="p-8">
                {/* Icon */}
                <motion.div
                  animate={{ rotate: [0, -8, 8, -6, 6, 0] }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="w-20 h-20 bg-amber-500/10 border border-amber-500/20 rounded-3xl flex items-center justify-center mb-6 mx-auto"
                >
                  <svg viewBox="0 0 24 24" className="w-10 h-10 text-amber-400" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
                  </svg>
                </motion.div>

                <h2 className="text-xl font-bold text-center mb-1 text-white">Spotify'dan İndirilemedi</h2>
                <p className="text-slate-400 text-center text-sm mb-7 leading-relaxed">
                  Bu şarkı bölgenizde kısıtlı veya Spotify stream'e kapalı olabilir.
                  <br />
                  <span className="text-amber-400 font-semibold">YouTube / SoundCloud</span>'da arama yapılsın mı?
                </p>

                {/* Track info card */}
                <div className="bg-white/5 border border-white/5 rounded-2xl p-4 mb-7 flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#1DB954]/10 rounded-xl flex items-center justify-center shrink-0">
                    <Music2 size={18} className="text-[#1DB954]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">{allDownloads[pendingFallbackUrl]?.display_name || 'Bilinmeyen Şarkı'}</div>
                    <div className="text-[10px] text-red-400 font-semibold uppercase tracking-tight mt-0.5 opacity-80">
                      Spotify hatası: Cannot get alternative track
                    </div>
                  </div>
                </div>

                {/* Platform badges */}
                <div className="flex gap-3 mb-8 justify-center">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-full">
                    <PlayCircle size={13} className="text-red-400" />
                    <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">YouTube</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FF5500]/10 border border-[#FF5500]/20 rounded-full">
                    <Radio size={13} className="text-[#FF5500]" />
                    <span className="text-[10px] font-bold text-[#FF5500] uppercase tracking-wider">SoundCloud</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleFallbackResponse(false)}
                    className="py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-xs transition-all border border-white/5"
                  >
                    HAYIR, İPTAL ET
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleFallbackResponse(true)}
                    className="py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-white font-bold text-xs transition-all shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2"
                  >
                    <Search size={14} />
                    EVET, ARA
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      </div>
      {/* Audio Player */}
      <AnimatePresence>
        {player.isOpen && player.src && (
          <AudioPlayer
            player={player}
            onClose={() => setPlayer(prev => ({ ...prev, isOpen: false, src: null }))}
          />
        )}
      </AnimatePresence>

      <Toast 
        message={toast.message} 
        visible={toast.visible} 
        onHide={() => setToast(prev => ({ ...prev, visible: false }))} 
      />
    </div>
  );
}

