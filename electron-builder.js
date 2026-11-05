const fs = require('fs');
const path = require('path');

const certPath = path.join(__dirname, 'certs', 'mikutool.pfx');
const hasCert = fs.existsSync(certPath);

module.exports = {
  appId: "com.mikutool.app",
  productName: "Miku Tool",
  directories: {
    output: "release"
  },
  electronDist: "node_modules/electron/dist",
  asar: false,
  files: [
    "dist/**",
    "main.js",
    "public/**"
  ],
  extraResources: [
    "miku-engine.exe"
  ],
  win: {
    target: ["dir", "nsis"],
    icon: "public/miku-icon.ico",
    ...(hasCert ? {
      cscLink: "certs/mikutool.pfx",
      cscKeyPassword: process.env.CSC_KEY_PASSWORD || "MikuPass123!"
    } : {})
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "Miku Tool",
    uninstallDisplayName: "Miku Tool",
    deleteAppDataOnUninstall: false
  }
};
