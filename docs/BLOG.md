# Blog (`/blogs`)

Public listing: `/blogs`  
Single post: `/blogs/[slug]` (e.g. `/blogs/my-first-post`)  
Admin UI: `/blogs/mangment` (typo preserved; `/blogs/management` redirects here)

## Stack

- **Convex** stores posts and hosts images (file storage).
- **Next.js API routes** verify the admin session and call Convex with `BLOG_ADMIN_SECRET`.

## Environment variables (Vercel + local)

| Variable | Where |
|----------|--------|
| `NEXT_PUBLIC_CONVEX_URL` | Vercel + local (from Convex dashboard). If you only have `CONVEX_URL` from `npx convex dev`, `next.config.js` mirrors it for the browser. |
| `BLOG_SESSION_SECRET` | Long random string; signs the HTTP-only session cookie |
| `BLOG_ADMIN_SECRET` | Same long random string in **Vercel** and **Convex** dashboard |
| `BLOG_ADMIN_EMAIL` | Admin login email |
| `BLOG_ADMIN_PASSWORD` | Admin login password — **never commit**; rotate if exposed |

Convex: **Settings → Environment Variables** → add `BLOG_ADMIN_SECRET` (same value as Vercel).

After changing env vars on Vercel, **redeploy**.

## Deploy Convex schema

From the project root:

```bash
npx convex dev
# or for production
npx convex deploy
```

## Security

- Do **not** put real passwords in source code or chat.
- Prefer a **strong unique password**; change it if it was ever shared.
- `/blogs/mangment` is hidden from search engines via `robots` metadata; it is **not** a substitute for a full auth system—keep the URL private and use strong secrets.
