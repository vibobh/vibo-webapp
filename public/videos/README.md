# Video assets (Git LFS)

These `.mp4` files are stored with **[Git LFS](https://git-lfs.github.com/)** so they can live in this repo without hitting GitHub’s **100 MB per-file** limit for normal Git blobs.

## After cloning

Install Git LFS, then pull file contents:

```bash
git lfs install
git lfs pull
```

If videos show as tiny pointer files only, run `git lfs pull` again or `git lfs fetch --all`.

## Replacing a clip

Keep the same filename (`vid1.mp4` … `vid5.mp4`) so paths in `Hero.tsx`, `Creators.tsx`, etc. stay valid.

```bash
git add public/videos/vid3.mp4
git commit -m "chore: update vid3"
git push
```

## Quota

GitHub includes **1 GB** of LFS storage on the free plan (shared with bandwidth). Very large libraries may need [extra data packs](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-git-large-file-storage) or hosting on a CDN instead.
