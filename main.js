const { app, BrowserWindow, Notification, clipboard, dialog, ipcMain, shell, Tray, Menu, nativeImage, protocol } = require('electron');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-gpu-sandbox');
// 'no-sandbox' kald\u0131r\u0131ld\u0131 \u2014 Chrome sandbox'u devre d\u0131\u015f\u0131 b\u0131rakmak gereksiz bir g\u00fcvenlik riski olu\u015fturur.
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');

// Register file:// scheme as standard and secure to allow standard origin behaviors and headers in iframes
protocol.registerSchemesAsPrivileged([
  { scheme: 'file', privileges: { standard: true, secure: true, corsEnabled: true, supportFetchAPI: true } }
]);

// Set a standard Chrome User-Agent globally so YouTube embed doesn't block Electron's default User-Agent
app.userAgentFallback = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// ── Güvenli log (app.ready sonrası başlatılacak) ─────────────────────────────
let _logFile = path.join(os.tmpdir(), 'miku-debug.log');
function log(...args) {
  const msg = `[${new Date().toISOString()}] ${args.join(' ')}\n`;
  try { fs.appendFileSync(_logFile, msg); } catch (e) {}
  console.log(...args);
}

// ── Kritik Hata Yakalama ────────────────────────────────────────────────────
process.on('uncaughtException', (error) => {
  const msg = error.stack || error.message;
  try { fs.appendFileSync(_logFile, `[CRASH] ${msg}\n`); } catch (e) {}
  if (app.isReady() && dialog) {
    dialog.showErrorBox('Kritik Hata', msg);
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.stack : String(reason);
  try { fs.appendFileSync(_logFile, `[REJECTION] ${msg}\n`); } catch (e) {}
});

// ── Global değişkenler ──────────────────────────────────────────────────────
let mainWindow = null;
let pythonProcess = null;
let tray = null;
let trayEnabled = false;

// ── Config (userData içinde — app.ready sonrası çağrılmalı) ─────────────────
function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function readConfig() {
  try {
    const p = getConfigPath();
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) { /* sessiz */ }
  return {};
}

function writeConfig(data) {
  try {
    const p = getConfigPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify({ ...readConfig(), ...data }), 'utf8');
  } catch (e) { /* sessiz */ }
}

// ── Tray ────────────────────────────────────────────────────────────────────
function createTray(iconPath) {
  if (tray) return;
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath);
  } catch (e) {
    icon = nativeImage.createEmpty();
  }
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('Miku Tool');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Aç', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: 'Çıkış', click: () => { app.isQuitting = true; tray?.destroy(); app.quit(); } }
  ]));
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

function destroyTray() {
  if (tray) { tray.destroy(); tray = null; }
}

// ── Pencere Oluştur ─────────────────────────────────────────────────────────
function createWindow() {
  // Log dosyasını userData'ya taşı (artık app ready)
  _logFile = path.join(app.getPath('userData'), 'miku-debug.log');
  log('=== Miku Tool Başlatılıyor ===');
  log('isPackaged:', app.isPackaged);
  log('appPath:', app.getAppPath());
  log('resourcesPath:', process.resourcesPath);
  log('__dirname:', __dirname);
  log('userData:', app.getPath('userData'));

  const conf = readConfig();
  trayEnabled = conf.tray_on_close === true;

  // Simge yolu
  const appRoot = app.getAppPath();
  const iconPath = path.join(appRoot, 'public', 'miku-icon.ico');
  const iconExists = fs.existsSync(iconPath);
  log('iconPath:', iconPath, '| exists:', iconExists);

  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    transparent: false,
    show: true,
    backgroundColor: '#0f172a',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false,
    },
    icon: iconExists ? iconPath : undefined,
  });

  // Harici bağlantı ve pencere güvenliği:
  // Harici web bağlantılarının Electron penceresi içinde açılmasını engelle, kullanıcının varsayılan tarayıcısına yönlendir.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Sadece yerel React dev sunucusu veya paketlenmiş yerel dosyalara izin ver
    if (!url.startsWith('http://localhost:5173') && !url.startsWith('file://')) {
      event.preventDefault();
      if (url.startsWith('http:') || url.startsWith('https:')) {
        shell.openExternal(url);
      }
    }
  });

  mainWindow.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  // İçerik yükle
  if (!app.isPackaged) {
    // DEV: Vite dev server
    mainWindow.loadURL('http://localhost:5173').catch((err) => {
      log('Dev server yüklenemedi:', err.message);
      dialog.showErrorBox('Dev Hatası', 'Önce "npm run dev" çalıştırın.\n' + err.message);
    });
  } else {
    // PRODUCTION: dist/index.html
    const htmlPath = path.join(appRoot, 'dist', 'index.html');
    log('htmlPath:', htmlPath, '| exists:', fs.existsSync(htmlPath));

    mainWindow.loadFile(htmlPath)
      .then(() => log('✓ HTML yüklendi'))
      .catch((err) => {
        log('✗ HTML yükleme hatası:', err.message);
        // Fallback: resources/app klasöründen dene
        const fallback = path.join(process.resourcesPath, 'app', 'dist', 'index.html');
        log('Fallback:', fallback, '| exists:', fs.existsSync(fallback));
        mainWindow.loadFile(fallback).catch((err2) => {
          log('✗ Fallback da başarısız:', err2.message);
          dialog.showErrorBox(
            'Arayüz Yüklenemedi',
            `HTML bulunamadı!\n\nYol 1: ${htmlPath}\nYol 2: ${fallback}\n\nLog: ${_logFile}`
          );
        });
      });

      }

  // Kapat → tray
  mainWindow.on('close', (e) => {
    if (trayEnabled && !app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      if (!tray) createTray(iconPath);
    }
  });

  // Evrensel Pano (Clipboard) İzleyici
  let lastText = clipboard.readText();
  setInterval(() => {
    const text = clipboard.readText();
    if (text && text !== lastText) {
      const trimmed = text.trim();
      const m = trimmed.match(/https?:\/\/[^\s]+/i);
      if (m) {
        try {
          const u = new URL(m[0]);
          const host = u.hostname.toLowerCase();
          if (host && host !== 'localhost' && host !== '127.0.0.1' && !host.endsWith('.local')) {
            lastText = text;
            mainWindow?.webContents.send('clipboard-link', m[0]);
            showNotification('Link Yakalandı!', 'İndirilebilir bir medya linki kopyaladınız.');
          }
        } catch {}
      }
    }
  }, 1000);
}

// ── Python Backend ──────────────────────────────────────────────────────────
function startPythonBackend() {
  let backendPath;
  let args = [];

  if (!app.isPackaged) {
    const winVenv = path.join(__dirname, 'venv', 'Scripts', 'python.exe');
    const unixVenv = path.join(__dirname, 'venv', 'bin', 'python');
    if (fs.existsSync(winVenv)) {
      backendPath = winVenv;
    } else if (fs.existsSync(unixVenv)) {
      backendPath = unixVenv;
    } else {
      backendPath = process.platform === 'win32' ? 'python' : 'python3';
    }
    args = ['-m', 'uvicorn', 'engine.api:app', '--host', '0.0.0.0', '--port', '8000'];
  } else {
    backendPath = path.join(process.resourcesPath, 'miku-engine.exe');
  }

  log('Backend yolu:', backendPath, '| exists:', fs.existsSync(backendPath));

  if (!fs.existsSync(backendPath)) {
    log('UYARI: Backend bulunamadı, atlanıyor.');
    return;
  }

  try {
    pythonProcess = spawn(backendPath, args, { detached: false });
    pythonProcess.on('error', (err) => log('Backend başlatma hatası:', err.message));
    pythonProcess.on('exit', (code) => log('Backend kapandı, kod:', code));
  } catch (e) {
    log('Backend spawn hatası:', e.message);
  }
}

// ── Bildirim ────────────────────────────────────────────────────────────────
function showNotification(title, body) {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
}

// ── Uygulama Başlat ─────────────────────────────────────────────────────────
app.setName('Miku Tool');
app.setAppUserModelId('com.mikutool.app');

app.whenReady().then(() => {
  log('=== app.whenReady tetiklendi ===');
  // Set headers for YouTube embeds to prevent Error 153 configuration error
  const { session } = require('electron');
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*'] },
    (details, callback) => {
      const url = details.url;
      let referer = 'https://www.youtube.com/';
      let origin = 'https://www.youtube.com';
      
      if (url.includes('youtube-nocookie.com')) {
        referer = 'https://www.youtube-nocookie.com/';
        origin = 'https://www.youtube-nocookie.com';
      }
      
      details.requestHeaders['Referer'] = referer;
      details.requestHeaders['Origin'] = origin;
      details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
      
      callback({ requestHeaders: details.requestHeaders });
    }
  );


  startPythonBackend();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => { app.isQuitting = true; });

app.on('will-quit', () => {
  if (pythonProcess) {
    try { pythonProcess.kill(); } catch (e) {}
  }
  // Windows'ta zorla öldürme (Tray kapalıyken veya çıkış yapıldığında kesin olarak çalışır)
  const { exec } = require('child_process');
  exec('taskkill /F /IM miku-engine.exe /T', () => {});
});

// ── IPC Handlers ─────────────────────────────────────────────────────────────
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  return result.filePaths[0];
});

ipcMain.handle('show-notification', async (_, title, message) => {
  showNotification(title, message);
});

ipcMain.handle('show-in-folder', async (_, filename) => {
  if (!filename) return false;
  if (path.isAbsolute(filename) && fs.existsSync(filename)) {
    shell.showItemInFolder(filename);
    return true;
  }
  const conf = readConfig();
  const base = conf.download_path || 'downloads';
  const dirs = [
    path.isAbsolute(base) ? base : path.resolve(__dirname, base),
    path.resolve(__dirname, 'downloads'),
    path.join(os.homedir(), 'Downloads'),
  ];
  for (const dir of dirs) {
    const full = path.join(dir, filename);
    if (fs.existsSync(full)) { shell.showItemInFolder(full); return true; }
  }
  return false;
});

ipcMain.handle('set-tray-enabled', async (_, enabled) => {
  trayEnabled = enabled;
  writeConfig({ tray_on_close: enabled });
  if (!enabled) destroyTray();
  return { success: true };
});

ipcMain.handle('get-tray-enabled', async () => ({ enabled: readConfig().tray_on_close === true }));

ipcMain.handle('set-auto-launch', async (_, enabled) => {
  app.setLoginItemSettings({ openAtLogin: enabled, name: 'Miku Tool', path: app.getPath('exe') });
  writeConfig({ auto_launch: enabled });
  return { success: true };
});

ipcMain.handle('get-auto-launch', async () => {
  return { enabled: app.getLoginItemSettings().openAtLogin };
});

ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());
