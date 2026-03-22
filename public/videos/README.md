# Video assets (`vid1.mp4` … `vid5.mp4`)

These files are **not committed** to Git (they are large; **Git LFS** hits paid bandwidth limits on GitHub and breaks Vercel clones).

## Local development

Place `vid1.mp4` … `vid5.mp4` in this folder. Next.js serves them at `/videos/…`.

## Production (Vercel)

1. Upload the five files to **free** static hosting, for example:
   - **GitHub Release** — create a release (e.g. tag `media-v1`), attach `vid1.mp4` … `vid5.mp4`.  
     Base URL looks like:  
     `https://github.com/OWNER/REPO/releases/download/media-v1`
   - **Cloudflare R2**, **Backblaze B2**, or any HTTPS URL where each file is reachable as  
     `BASE/vid1.mp4`, …, `BASE/vid5.mp4`.

2. In **Vercel → Environment variables**, set:

   `NEXT_PUBLIC_VIDEO_BASE_URL` = that base URL (**no** trailing slash)

3. Redeploy.

See **`docs/VIDEOS_PRODUCTION.md`** and **`DEPLOYMENT.md`**.
