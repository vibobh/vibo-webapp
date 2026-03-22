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
export function videoUrl(publicPath: string): string {
  const base = process.env.NEXT_PUBLIC_VIDEO_BASE_URL?.replace(/\/$/, "") ?? "";
  const clean = publicPath.replace(/^\//, "");
  const fileName = clean.includes("/") ? (clean.split("/").pop() ?? clean) : clean;

  if (!base) {
    return `/${clean}`;
  }

  return `${base}/${fileName}`;
}
