// Generates the store-sized extension icons from the master source in
// assets/icon.png. Run after replacing the master: `npm run icons`.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const SIZES = [16, 32, 48, 96, 128];
const SRC = 'assets/icon.png';
const OUT = 'public/icon';

mkdirSync(OUT, { recursive: true });
for (const s of SIZES) {
  await sharp(SRC).resize(s, s, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(`${OUT}/${s}.png`);
  console.log(`wrote ${OUT}/${s}.png (${s}x${s})`);
}
console.log('done');
