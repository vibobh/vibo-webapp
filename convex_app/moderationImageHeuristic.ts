"use node";

/**
 * Lightweight pixel heuristic (no ML): high skin fraction + weak face-band skin +
 * centroid in lower mass → typical body/bikini/back-only framing.
 * Runs before Gemini. JPEG-only decoder (Convex-friendly pure JS).
 */

import { decode as decodeJpeg } from "jpeg-js";

function isLikelySkinRgba(r: number, g: number, b: number): boolean {
  if (r < 58 || r > 255 || g > 247) return false;
  const rg = Math.abs(r - g);
  const rb = Math.abs(r - b);
  if (rg <= 42 && rg >= 13 && rb > 52 && rb < 148) return true;
  if (rg < 52 && rg > 38 && rb < 148 && rg > rb) return true;
  if (
    r >= 95 &&
    g >= 40 &&
    b >= 20 &&
    Math.max(r, g, b) - Math.min(r, g, b) > 15 &&
    r > g &&
    r > b
  ) {
    return true;
  }
  return false;
}

function decodeJpegBuffer(
  imageBuffer: Buffer,
): { data: Buffer; width: number; height: number } | null {
  try {
    // Runtime `jpeg-js` accepts decode options; `@types/jpeg-js` overloads omit this form.
    const decoded = decodeJpeg(imageBuffer, {
      maxMemoryUsageInMB: 48,
      formatAsRGBA: true,
    } as never);
    return {
      data: Buffer.from(decoded.data),
      width: decoded.width,
      height: decoded.height,
    };
  } catch {
    return null;
  }
}

/** Map full-res JPEG into ~maxSide×maxSide-ish grid via nearest-neighbour sampling */
function sampledRgbaGrid(
  data: Buffer,
  w: number,
  h: number,
  maxSide: number,
): { width: number; height: number; get: (sx: number, sy: number) => [number, number, number, number] } {
  const scale = Math.min(maxSide / w, maxSide / h, 1);
  const outW = Math.max(24, Math.round(w * scale));
  const outH = Math.max(24, Math.round(h * scale));
  return {
    width: outW,
    height: outH,
    get: (sx: number, sy: number) => {
      const xSrc = Math.min(w - 1, Math.round(((sx + 0.5) / outW) * w));
      const ySrc = Math.min(h - 1, Math.round(((sy + 0.5) / outH) * h));
      const idx = (ySrc * w + xSrc) * 4;
      return [
        data[idx] ?? 0,
        data[idx + 1] ?? 0,
        data[idx + 2] ?? 0,
        data[idx + 3] ?? 255,
      ];
    },
  };
}

export async function analyzeVisualSafetyHeuristic(
  imageBuffer: Buffer,
): Promise<{
  skinRatio: number;
  upperThirdSkinRatio: number;
  centroidYNorm: number;
  hardSkinBodyBlock: boolean;
}> {
  const decoded = decodeJpegBuffer(imageBuffer);
  if (!decoded) {
    return {
      skinRatio: 0,
      upperThirdSkinRatio: 0,
      centroidYNorm: 0,
      hardSkinBodyBlock: false,
    };
  }

  const { data, width: w, height: h } = decoded;
  const grid = sampledRgbaGrid(data, w, h, 96);
  const width = grid.width;
  const height = grid.height;

  let skinCount = 0;
  let upperSkin = 0;
  let upperPix = 0;
  let sumYWeighted = 0;
  const third = Math.max(1, Math.floor(height / 3));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = grid.get(x, y);
      const r = px[0];
      const g = px[1];
      const b = px[2];
      const inUpperThird = y < third;
      if (inUpperThird) upperPix++;
      const skin = isLikelySkinRgba(r, g, b);
      if (!skin) continue;
      skinCount++;
      sumYWeighted += y + 0.5;
      if (inUpperThird) upperSkin++;
    }
  }

  const total = width * height;
  const skinRatio = skinCount / Math.max(1, total);
  const upperThirdSkinRatio = upperPix > 0 ? upperSkin / upperPix : 0;
  const centroidYNorm =
    skinCount > 0 ? sumYWeighted / skinCount / Math.max(1, height) : 0;

  /** Same rule as requested: skinRate high, sparse face band skin, centroid low in frame → body-shot */
  const noFaceDetected = upperThirdSkinRatio < 0.08;
  const bodyRegionDominant = centroidYNorm > 0.43;
  const hardSkinBodyBlock =
    skinRatio > 0.35 && noFaceDetected && bodyRegionDominant;

  return {
    skinRatio,
    upperThirdSkinRatio,
    centroidYNorm,
    hardSkinBodyBlock,
  };
}
