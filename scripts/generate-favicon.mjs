/**
 * Builds favicons from public/images/vibo-icon-maroon.png:
 * white icon only, transparent background (same mark as footer, no plate).
 * Run: node scripts/generate-favicon.mjs
 */
import sharp from "sharp";
import { readFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const srcPath = join(root, "public/images/vibo-icon-maroon.png");

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

async function toWhiteSilhouette(pngBuffer) {
  const { data, info } = await sharp(pngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    out[i] = 255;
    out[i + 1] = 255;
    out[i + 2] = 255;
    out[i + 3] = a;
  }
  return sharp(out, {
    raw: { width, height, channels: 4 },
  }).png();
}

/** White icon centered on transparent square canvas */
async function renderIconBuffer(canvasSize, padding) {
  const pngBuffer = readFileSync(srcPath);
  const whitePipe = await toWhiteSilhouette(pngBuffer);
  const inner = Math.max(8, canvasSize - padding * 2);
  const resized = await whitePipe
    .resize(inner, inner, { fit: "contain" })
    .toBuffer();

  const bg = await sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 4,
      background: TRANSPARENT,
    },
  })
    .png()
    .toBuffer();

  return sharp(bg)
    .composite([{ input: resized, gravity: "center" }])
    .png()
    .toBuffer();
}

async function main() {
  const appDir = join(root, "src/app");
  if (!existsSync(appDir)) {
    mkdirSync(appDir, { recursive: true });
  }

  const pub = join(root, "public");

  const buf32 = await renderIconBuffer(32, 4);
  await sharp(buf32).toFile(join(appDir, "icon.png"));
  await sharp(buf32).toFile(join(pub, "favicon.png"));

  const buf48 = await renderIconBuffer(48, 6);
  await sharp(buf48).toFile(join(pub, "favicon-48.png"));

  const buf180 = await renderIconBuffer(180, 28);
  await sharp(buf180).toFile(join(appDir, "apple-icon.png"));

  console.log(
    "OK: src/app/icon.png, src/app/apple-icon.png, public/favicon.png, public/favicon-48.png",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
