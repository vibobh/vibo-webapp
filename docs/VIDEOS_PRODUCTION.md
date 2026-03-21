# Videos on Vercel (`/videos/vid*.mp4`)

The landing page loads MP4s from **`public/videos/`** (see `Hero.tsx`, `Creators.tsx`, etc.). Those files are stored in **Git LFS** because they’re large.

## How it works

1. **GitHub** holds LFS pointers + LFS objects for `vid1.mp4` … `vid5.mp4`.
2. **Vercel** must check out the **real** video files during the build, not the tiny pointer text files.

## What you must do in Vercel

1. **Project → Settings → Git**  
   Turn **Git LFS** **ON** (see [Git LFS on Vercel](https://vercel.com/changelog/git-lfs-support)).

2. **Redeploy** (Deployments → … → Redeploy), or push a new commit.

3. **`vercel.json`** runs `git lfs install && git lfs pull` before `npm install` so LFS objects are present in the build output.

## Verify

- Open [your site](https://vibo-webapp.vercel.app/) → DevTools → **Network** → filter `mp4`.
- Open a URL directly, e.g. `https://vibo-webapp.vercel.app/videos/vid1.mp4`  
  - **Good:** response is large (many MB), `Content-Type: video/mp4`.  
  - **Bad:** file is only ~100–200 bytes → still a pointer; fix LFS + redeploy.

## Changing videos later

```bash
# replace file, same name
git add public/videos/vid3.mp4
git commit -m "chore: update vid3"
git push
```

Ensure **Git LFS** still tracks `*.mp4` (see `.gitattributes`).

## If you outgrow LFS quota

Host clips on **S3 / R2 / Cloudinary / Vercel Blob** and switch components to full URLs via `NEXT_PUBLIC_VIDEO_BASE_URL` (would need a small code change).
