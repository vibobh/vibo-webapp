/**
 * Builds favicons from public/image (79).png:
 * 48×48 px square, transparent background around the scaled image.
 * Run: node scripts/generate-favicon.mjs
 */
import sharp from "sharp";
import { readFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const srcPath = join(root, "public", "image (79).png");

const SIZE = 48;
const PADDING = 4;
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

async function renderIcon48() {
  const pngBuffer = readFileSync(srcPath);
  const inner = Math.max(8, SIZE - PADDING * 2);
  const resized = await sharp(pngBuffer)
    .ensureAlpha()
    .resize(inner, inner, { fit: "contain" })
    .toBuffer();

  const bg = await sharp({
    create: {
      width: SIZE,
      height: SIZE,
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

  const buf = await renderIcon48();
  await sharp(buf).toFile(join(appDir, "icon.png"));
  await sharp(buf).toFile(join(pub, "favicon.png"));
  await sharp(buf).toFile(join(pub, "favicon-48.png"));
  await sharp(buf).toFile(join(appDir, "apple-icon.png"));

  console.log(
    `OK: ${SIZE}×${SIZE} from "image (79).png", transparent bg → icon.png, apple-icon.png, favicon.png, favicon-48.png`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
