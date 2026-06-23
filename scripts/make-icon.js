/**
 * PNG → ICO dönüştürücü
 * Kullanım: node scripts/make-icon.js
 */
const fs = require('fs');
const path = require('path');

const srcPng = path.join(__dirname, '..', 'public', 'miku-icon.png');
const destIco = path.join(__dirname, '..', 'public', 'miku-icon.ico');

// PNG dosyasını oku
const pngData = fs.readFileSync(srcPng);

// ICO header: 1 görüntü, 256x256 PNG gömülü
// ICO Format: ICONDIR + ICONDIRENTRY + PNG veri
const ICONDIR = Buffer.alloc(6);
ICONDIR.writeUInt16LE(0, 0);       // Reserved
ICONDIR.writeUInt16LE(1, 2);       // Type: 1 = ICO
ICONDIR.writeUInt16LE(1, 4);       // Count: 1 görüntü

const ICONDIRENTRY = Buffer.alloc(16);
ICONDIRENTRY.writeUInt8(0, 0);     // Width: 0 = 256
ICONDIRENTRY.writeUInt8(0, 1);     // Height: 0 = 256
ICONDIRENTRY.writeUInt8(0, 2);     // ColorCount
ICONDIRENTRY.writeUInt8(0, 3);     // Reserved
ICONDIRENTRY.writeUInt16LE(1, 4);  // Planes
ICONDIRENTRY.writeUInt16LE(32, 6); // BitCount
ICONDIRENTRY.writeUInt32LE(pngData.length, 8);  // SizeInBytes
ICONDIRENTRY.writeUInt32LE(6 + 16, 12);          // ImageOffset (header + entry)

const icoData = Buffer.concat([ICONDIR, ICONDIRENTRY, pngData]);
fs.writeFileSync(destIco, icoData);

console.log(`✅ ICO oluşturuldu: ${destIco} (${icoData.length} bytes)`);
