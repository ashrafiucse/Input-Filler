// Generates the store-sized extension icons from the master source in
// assets/icon.png. The transparent padding is auto-cropped first so the logo
// fills the icon (otherwise it looks tiny in the small toolbar slot).
// Run after replacing the master: `npm run icons`.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const SIZES = [16, 32, 48, 96, 128];
const SRC = 'assets/icon.png';
const OUT = 'public/icon';

mkdirSync(OUT, { recursive: true });
for (const s of SIZES) {
  await sharp(SRC)
    .trim({ threshold: 2 }) // crop transparent padding around the logo
    .resize(s, s, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(`${OUT}/${s}.png`);
  console.log(`wrote ${OUT}/${s}.png (${s}x${s})`);
}
console.log('done');
