/**
 * Regenerate vibo-news-placeholder.png with a transparent background (dark pixels → alpha).
 * Run from project root: node scripts/transparent-news-placeholder.mjs
 */
import sharp from "sharp";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { writeFileSync, copyFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const input = join(__dirname, "../public/images/vibo-news-placeholder.png");

const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;

for (let i = 0; i < data.length; i += 4) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  if (lum < 42) {
    data[i + 3] = 0;
  }
}

const out = await sharp(data, {
  raw: { width, height, channels: 4 },
})
  .png({ compressionLevel: 9, effort: 10 })
  .toBuffer();

const tmp = join(tmpdir(), `vibo-news-placeholder-${Date.now()}.png`);
writeFileSync(tmp, out);
copyFileSync(tmp, input);
unlinkSync(tmp);

console.log("Updated:", input);
