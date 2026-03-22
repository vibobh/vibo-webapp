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

### “503” on `POST /api/blog/login` (production)

That means **Vercel does not have** one or more of: `BLOG_ADMIN_EMAIL`, `BLOG_ADMIN_PASSWORD`, `BLOG_SESSION_SECRET`.

- **`.env.local` is only on your PC** — it is **not** sent to GitHub or Vercel. You must add the same values in the **Vercel dashboard**.
- **Do not** store the admin password in a database or in Git — use **Vercel → Environment Variables** (encrypted at rest).

**Steps (Vercel):**

1. Open **[Vercel](https://vercel.com)** → your **vibo-webapp** project → **Settings** → **Environment Variables**.
2. Add these for **Production** (and **Preview** if you use preview deploys):

   | Name | Value |
   |------|--------|
   | `BLOG_ADMIN_EMAIL` | Same as local (e.g. `joinvibo@gmail.com`) |
   | `BLOG_ADMIN_PASSWORD` | Same strong password you use locally |
   | `BLOG_SESSION_SECRET` | Long random string (generate new; **not** the literal words “some-long-random-string”) |
   | `BLOG_ADMIN_SECRET` | Another long random string — **must match** Convex production (below) |
   | `NEXT_PUBLIC_CONVEX_URL` | Your **production** Convex URL (`https://….convex.cloud`) |

3. In **[Convex dashboard](https://dashboard.convex.dev)** → your deployment → **Settings** → **Environment Variables** → set **`BLOG_ADMIN_SECRET`** to the **exact same** value as on Vercel (needed to save posts / uploads).

4. **Redeploy** on Vercel: **Deployments** → **⋯** on latest → **Redeploy** (env vars are applied at build/runtime for server routes).

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
