# Hero videos in production

MP4s are loaded from **`NEXT_PUBLIC_VIDEO_BASE_URL`** + filename (`vid1.mp4` … `vid5.mp4`).  
They are **not** stored in the Git repo (avoids GitHub **Git LFS** bandwidth limits).

**Size:** aim for **each file under ~10 MB** (faster loads, fewer upload limits). See **`docs/COMPRESS_VIDEOS.md`**.

## Setup

1. Host `vid1.mp4` … `vid5.mp4` at the **same base URL** (HTTPS).

   **Free option — GitHub Release**

   - Repo → **Releases** → **Draft a new release**
   - Tag: e.g. `media-v1`
   - Upload all five MP4s as release assets
   - Base URL:  
     `https://github.com/vibobh/vibo-webapp/releases/download/media-v1`  
     (replace owner/repo/tag if different)

2. **Vercel** → Project → **Environment variables**:

   | Name | Example value |
   |------|----------------|
   | `NEXT_PUBLIC_VIDEO_BASE_URL` | `https://github.com/vibobh/vibo-webapp/releases/download/media-v1` |

3. Redeploy.

## Verify

1. In the browser, open this directly (fix owner/repo/tag to match yours):  
   `https://github.com/vibobh/vibo-webapp/releases/download/media-v1/vid1.mp4`  
   You should **download or play** the file — **not** a 404 HTML page.

2. On **Vercel** → **Settings** → **Environment Variables**:  
   - Name: `NEXT_PUBLIC_VIDEO_BASE_URL`  
   - Value: **no** quotes, **no** trailing `/`  
     Example: `https://github.com/vibobh/vibo-webapp/releases/download/media-v1`  
   - Enable for **Production** (and Preview if you want preview deploys to work).

3. **Redeploy** after changing env vars (Next.js bakes `NEXT_PUBLIC_*` in at **build** time).

4. On the live site → **DevTools** → **Network** → filter `mp4` → status should be **200**.

### If videos still don’t play

| Cause | Fix |
|--------|-----|
| **Private GitHub repo** | Release file URLs are **not** public for anonymous visitors. Use a **public** repo for assets, or host files on **Cloudflare R2**, **Backblaze**, etc. |
| Wrong tag / filename | Tag must match the release; files must be exactly `vid1.mp4` … `vid5.mp4` (case can matter). |
| Env not applied | Redeploy **Production** after saving the variable. |
| Console shows `[LazyVideo] Failed to load` | Open the printed URL in a new tab — if it 404s, fix the release URL or filenames. |

## Local dev

Leave `NEXT_PUBLIC_VIDEO_BASE_URL` unset and keep files in `public/videos/`.
