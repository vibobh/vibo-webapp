# Video assets (not in Git)

Large `.mp4` files are **ignored** so the repo stays under GitHub’s limits (max **100 MB** per file).

## Local development

Copy your clips here as `vid1.mp4` … `vid5.mp4` (same names the app expects).  
After cloning, restore from your backup or re-export from your editor.

## Production (Vercel)

Pick one:

1. **Git LFS** — track `*.mp4` with [Git LFS](https://git-lfs.github.com/) and push (uses GitHub LFS quota).
2. **External hosting** — upload to S3, R2, Cloudinary, etc. and point the app at URLs via env (e.g. `NEXT_PUBLIC_VIDEO_BASE_URL`).
3. **Smaller files** — re-encode so each file is **under 100 MB**, then remove the ignore rules and commit (still heavy for clones; CDN is better long-term).
