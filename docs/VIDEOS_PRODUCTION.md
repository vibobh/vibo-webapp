# Hero videos in production

MP4s are loaded from **`NEXT_PUBLIC_VIDEO_BASE_URL`** + filename (`vid1.mp4` … `vid5.mp4`).  
They are **not** stored in the Git repo (avoids GitHub **Git LFS** bandwidth limits).

**Size:** aim for **each file under ~10 MB** (faster loads, fewer upload limits). See **`docs/COMPRESS_VIDEOS.md`**.

## Setup

1. Host `vid1.mp4` … `vid5.mp4` at the **same base URL** (HTTPS).

   **Free option — GitHub Release**

   - Repo → **Releases** → **Draft a new release**
   - Tag: e.g. `media-v1` (remember it **exactly** — this becomes part of the URL)
   - Upload all five MP4s as **release assets** (the files listed under the release, not only the tag)
   - **Publish** the release (not left as **Draft**)
   - Base URL (no trailing slash):  
     `https://github.com/vibobh/vibo-webapp/releases/download/media-v1`  
     (replace `vibobh`, `vibo-webapp`, and `media-v1` with your owner, repo name, and tag)

   **Do not use** `releases/latest/download/...` unless you know what you’re doing: GitHub’s **“latest”** ignores **draft** releases and **pre-releases**. If your only release is a **pre-release**, **`latest` URLs often 404** — use the **tag** URL above instead.

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

### Browser shows **404 Not Found** on the `.mp4` link

Do this on GitHub (exact steps):

1. Open: `https://github.com/YOUR_USER/YOUR_REPO/releases` (fix user/repo).
2. Click the **release** you created (the title, e.g. “Hero videos”).
3. Scroll to **Assets** (files under the release). You must see **`vid1.mp4`**, **`vid2.mp4`**, … listed there.
   - If there are **no** `.mp4` files, you didn’t attach them — edit the release and **upload the files**.
4. **Right‑click** **`vid1.mp4`** → **Copy link address** (or click Download and copy the URL from the address bar after it loads).
5. The link should look like:  
   `https://github.com/USER/REPO/releases/download/SOME_TAG/vid1.mp4`  
   Your **`NEXT_PUBLIC_VIDEO_BASE_URL`** is that URL **with `/vid1.mp4` removed** (and no trailing `/`).  
   Example: `https://github.com/vibobh/vibo-webapp/releases/download/media-v1`
6. Paste that into Vercel → **Redeploy** Production.

**Still 404?**

| Check | What to do |
|--------|------------|
| **Private repository** | Anonymous users get 404. Make the repo **Public**, or host videos elsewhere (R2, etc.). |
| **Wrong tag** | Tag in the URL must match the release tag **exactly** (`media-v1` ≠ `Media-v1` on some systems). |
| **Pre-release + `latest` URL** | Don’t use `releases/latest/download/...` if the only release is a **pre-release**. Use `releases/download/TAG/...` from step 5. |
| **Draft release** | Publish the release; drafts are not downloadable publicly. |

### If videos still don’t play (but URL returns 200)

| Cause | Fix |
|--------|-----|
| **Private GitHub repo** | Release file URLs are **not** public for anonymous visitors. Use a **public** repo for assets, or host files on **Cloudflare R2**, **Backblaze**, etc. |
| Wrong tag / filename | Tag must match the release; files must be exactly `vid1.mp4` … `vid5.mp4` (case can matter). |
| Env not applied | Redeploy **Production** after saving the variable. |
| Console shows `[LazyVideo] Failed to load` | Open the printed URL in a new tab — if it 404s, fix the release URL or filenames. |

## Local dev

Leave `NEXT_PUBLIC_VIDEO_BASE_URL` unset and keep files in `public/videos/`.
