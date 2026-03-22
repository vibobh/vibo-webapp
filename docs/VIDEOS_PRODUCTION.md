# Hero videos in production

Videos are **not** in the Git repo. You point the app at HTTPS URLs using **Vercel environment variables** only.

**Size:** aim for **each file under ~10 MB** when possible. See **`docs/COMPRESS_VIDEOS.md`**.

## Setup (recommended: full links in Vercel)

1. Upload `vid1.mp4` … `vid5.mp4` somewhere public (e.g. **GitHub Release** → **Assets**).

2. For **each** file, **right‑click → Copy link address** (full URL ending in `vid1.mp4`, etc.).

3. **Vercel** → Project → **Settings** → **Environment Variables** → add **five** variables (Production):

   | Name | Value |
   |------|--------|
   | `NEXT_PUBLIC_VIDEO_VID1` | Full URL to `vid1.mp4` |
   | `NEXT_PUBLIC_VIDEO_VID2` | Full URL to `vid2.mp4` |
   | `NEXT_PUBLIC_VIDEO_VID3` | Full URL to `vid3.mp4` |
   | `NEXT_PUBLIC_VIDEO_VID4` | Full URL to `vid4.mp4` |
   | `NEXT_PUBLIC_VIDEO_VID5` | Full URL to `vid5.mp4` |

   No quotes. Each value is the **entire** link GitHub gives you.

4. **Redeploy** Production (required so Next.js picks up `NEXT_PUBLIC_*` at build time).

**You do not need** `NEXT_PUBLIC_VIDEO_BASE_URL` if you set all five `NEXT_PUBLIC_VIDEO_VID*` variables.

---

## Alternative: one base URL in Vercel

If all five files live under the **same** folder URL:

1. **GitHub Release** (example): publish assets under one tag, e.g. `media-v1`.
2. Set only:

   | Name | Example value |
   |------|----------------|
   | `NEXT_PUBLIC_VIDEO_BASE_URL` | `https://github.com/vibobh/vibo-webapp/releases/download/media-v1` |

   (No trailing `/`.)

3. Redeploy.

**Do not use** `releases/latest/download/...` unless you understand GitHub’s “latest” rules (it skips drafts and pre-releases).

## Verify

1. In the browser, open this directly (fix owner/repo/tag to match yours):  
   `https://github.com/vibobh/vibo-webapp/releases/download/media-v1/vid1.mp4`  
   You should **download or play** the file — **not** a 404 HTML page.

2. On **Vercel** → **Environment Variables**: either the **five** `NEXT_PUBLIC_VIDEO_VID1` … `VID5` full URLs, **or** `NEXT_PUBLIC_VIDEO_BASE_URL` — see **Setup** above. Enable for **Production** (and Preview if needed).

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
