/**
 * Generates production SEO assets: og.png, icon.png (512), apple-touch-icon.png,
 * favicon.ico, and optional vibo-app-icon.png when missing.
 * Run: node scripts/generate-seo-assets.mjs
 */
import sharp from "sharp";
import toIco from "to-ico";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const pub = join(root, "public");

const BRAND = "#4b0415";
const ACCENT = "#c4a87c";
const CREAM = "#fdfcf9";

async function defaultMarkBuffer() {
  const svg = `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" fill="${BRAND}" rx="96"/>
  <text x="256" y="330" text-anchor="middle" font-family="system-ui,Arial,sans-serif" font-size="260" font-weight="700" fill="${CREAM}">V</text>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function getLogoBuffer() {
  const src = join(pub, "vibo-app-icon.png");
  if (existsSync(src)) {
    return readFileSync(src);
  }
  console.warn('Missing public/vibo-app-icon.png — generating placeholder "V" mark.');
  const buf = await defaultMarkBuffer();
  writeFileSync(src, buf);
  return buf;
}

async function main() {
  mkdirSync(pub, { recursive: true });

  const logoBuf = await getLogoBuffer();

  const png512 = await sharp(logoBuf)
    .ensureAlpha()
    .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  writeFileSync(join(pub, "icon.png"), png512);

  const apple = await sharp(logoBuf)
    .ensureAlpha()
    .resize(180, 180, { fit: "contain", background: { r: 253, g: 252, b: 249, alpha: 1 } })
    .png()
    .toBuffer();
  writeFileSync(join(pub, "apple-touch-icon.png"), apple);

  const sizes = [16, 32, 48];
  const icoBuffers = await Promise.all(
    sizes.map((s) =>
      sharp(logoBuf)
        .ensureAlpha()
        .resize(s, s, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer(),
    ),
  );
  const ico = await toIco(icoBuffers);
  writeFileSync(join(pub, "favicon.ico"), ico);

  const ogSvg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${BRAND}"/>
      <stop offset="100%" style="stop-color:#2a0210"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <text x="600" y="260" text-anchor="middle" font-family="system-ui,Segoe UI,Arial,sans-serif" font-size="96" font-weight="700" fill="${CREAM}">Vibo</text>
  <text x="600" y="340" text-anchor="middle" font-family="system-ui,Segoe UI,Arial,sans-serif" font-size="36" fill="${ACCENT}">فايبو · Social media platform</text>
  <text x="600" y="420" text-anchor="middle" font-family="system-ui,Segoe UI,Arial,sans-serif" font-size="24" fill="${CREAM}" opacity="0.85">Videos, photos, and real connections.</text>
</svg>`;

  await sharp(Buffer.from(ogSvg)).png().toFile(join(pub, "og.png"));

  console.log(
    "OK: public/og.png, icon.png (512), apple-touch-icon.png (180), favicon.ico, vibo-app-icon.png (if generated)",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
