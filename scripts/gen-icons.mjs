// Generates placeholder PNG icons (brand-colored squares with form-bar glyphs)
// at the sizes WXT/browser expect. No image dependencies; uses zlib only.
// Run: node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) >>> 0 : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function png(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const o = y * stride + 1 + x * 4;
      raw[o] = rgba[i];
      raw[o + 1] = rgba[i + 1];
      raw[o + 2] = rgba[i + 2];
      raw[o + 3] = rgba[i + 3];
    }
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function draw(s) {
  const rgba = new Uint8Array(s * s * 4);
  const set = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= s || y >= s) return;
    const i = (y * s + x) * 4;
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = 255;
  };
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) set(x, y, 47, 111, 216); // brand blue
  const hh = Math.max(1, Math.round(s * 0.24));
  for (let y = 0; y < hh; y++) for (let x = 0; x < s; x++) set(x, y, 30, 80, 160); // header band
  const barH = Math.max(1, Math.round(s * 0.09));
  const gap = Math.max(1, Math.round(s * 0.06));
  const top = hh + Math.round(s * 0.12);
  const left = Math.round(s * 0.2);
  const w = Math.round(s * 0.6);
  for (let b = 0; b < 3; b++) {
    const y0 = top + b * (barH + gap);
    const col = b === 1 ? [255, 255, 255] : [220, 230, 245]; // middle bar = "filled"
    for (let y = y0; y < y0 + barH; y++) for (let x = left; x < left + w; x++) set(x, y, col[0], col[1], col[2]);
  }
  return rgba;
}

mkdirSync('public/icon', { recursive: true });
for (const s of [16, 32, 48, 96, 128]) {
  writeFileSync(`public/icon/${s}.png`, png(s, s, draw(s)));
}
console.log('icons generated: public/icon/{16,32,48,96,128}.png');
