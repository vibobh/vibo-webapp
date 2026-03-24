/**
 * Videos are **not** stored in Git (too large for GitHub; LFS hits paid bandwidth limits).
 *
 * **Option A — full URLs in Vercel (easiest):** set `NEXT_PUBLIC_VIDEO_VID1` … `NEXT_PUBLIC_VIDEO_VID5`
 * to each complete HTTPS link (copy/paste from GitHub Assets → copy link).
 *
 * **Option B — one base URL:** set `NEXT_PUBLIC_VIDEO_BASE_URL` to the folder that contains
 * `vid1.mp4` … `vid5.mp4` (no trailing slash), e.g. GitHub Release download base.
 *
 * Priority: per-video vars override the base URL. If neither is set, local dev uses `/public/videos/`.
 */

function stripQuotes(s: string): string {
  let t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1);
  }
  return t.trim();
}

function normalizeVideoBase(raw: string | undefined): string {
  if (!raw) return "";
  return stripQuotes(raw).replace(/\/$/, "");
}

/** Explicit env map so Next.js inlines `NEXT_PUBLIC_*` at build time. */
function individualUrlForFile(fileName: string): string | undefined {
  const map: Record<string, string | undefined> = {
    "vid1.mp4": process.env.NEXT_PUBLIC_VIDEO_VID1,
    "vid2.mp4": process.env.NEXT_PUBLIC_VIDEO_VID2,
    "vid3.mp4": process.env.NEXT_PUBLIC_VIDEO_VID3,
    "vid4.mp4": process.env.NEXT_PUBLIC_VIDEO_VID4,
    "vid5.mp4": process.env.NEXT_PUBLIC_VIDEO_VID5,
  };
  const raw = map[fileName];
  if (!raw?.trim()) return undefined;
  return stripQuotes(raw);
}

/**
 * Final URL for `<video src>`. Uses per-video env vars first, then base + filename.
 */
export function videoUrl(publicPath: string): string {
  const clean = publicPath.replace(/^\//, "");
  const fileName = clean.includes("/") ? (clean.split("/").pop() ?? clean) : clean;

  const individual = individualUrlForFile(fileName);
  if (individual) {
    return individual;
  }

  const base = normalizeVideoBase(process.env.NEXT_PUBLIC_VIDEO_BASE_URL);
  if (!base) {
    return `/${clean}`;
  }

  const encodedFile = encodeURIComponent(fileName);
  return `${base}/${encodedFile}`;
}
