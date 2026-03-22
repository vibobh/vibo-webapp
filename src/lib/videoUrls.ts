/**
 * Videos are **not** stored in Git (too large for GitHub; LFS hits paid bandwidth limits).
 *
 * Production: set `NEXT_PUBLIC_VIDEO_BASE_URL` to the folder that contains `vid1.mp4` … `vid5.mp4`
 * (no trailing slash). Examples:
 * - GitHub Release: `https://github.com/OWNER/REPO/releases/download/media-v1`
 * - Cloudflare R2 / any HTTPS CDN with public read
 *
 * Local dev: leave unset — Next.js serves files from `public/videos/`.
 */
function normalizeVideoBase(raw: string | undefined): string {
  if (!raw) return "";
  let s = raw.trim();
  // Vercel UI sometimes saves wrapping quotes by mistake
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1);
  }
  return s.replace(/\/$/, "");
}

/**
 * Final URL for <video src>. Encodes the filename (spaces etc.) for GitHub Release assets.
 */
export function videoUrl(publicPath: string): string {
  const base = normalizeVideoBase(process.env.NEXT_PUBLIC_VIDEO_BASE_URL);
  const clean = publicPath.replace(/^\//, "");
  const fileName = clean.includes("/") ? (clean.split("/").pop() ?? clean) : clean;

  if (!base) {
    return `/${clean}`;
  }

  const encodedFile = encodeURIComponent(fileName);
  return `${base}/${encodedFile}`;
}
