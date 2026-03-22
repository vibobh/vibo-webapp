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

Open the site → DevTools → **Network** → filter `mp4`. Requests should go to your CDN/release URL and return **200** with video bytes (not HTML).

## Local dev

Leave `NEXT_PUBLIC_VIDEO_BASE_URL` unset and keep files in `public/videos/`.
