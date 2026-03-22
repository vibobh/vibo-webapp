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
| `BLOG_ADMIN_EMAIL` | Primary admin login email |
| `BLOG_ADMIN_PASSWORD` | Primary admin password — **never commit**; rotate if exposed |
| `BLOG_ADMIN_EMAIL_2` … `_10` | Optional — extra editors (each needs matching `BLOG_ADMIN_PASSWORD_2` … `_10`) |
| `BLOG_ADMIN_USERS` | Optional — single-line JSON: `[{"email":"…","password":"…"},…]` (merged with env pairs; useful if numbered vars are error-prone) |

Only emails/passwords listed in Vercel can sign in. If a teammate gets **“Invalid email or password”**:

1. Confirm their pair is saved for **Production** (and **Preview** if they test preview URLs), then **Redeploy**.
2. **Gmail**: `a.b@gmail.com` and `ab@gmail.com` are treated the same after normalization.
3. Re-type the password in Vercel (no accidental spaces/newlines when pasting).
4. Or set **`BLOG_ADMIN_USERS`** with both accounts in one JSON array and redeploy.

Check **Vercel → Logs** on failed login: you should see `configured accounts: N` — if `N` is `1`, the second account was not loaded (wrong var names or not redeployed).

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
   | `BLOG_ADMIN_EMAIL_2` (optional) | Second editor’s email |
   | `BLOG_ADMIN_PASSWORD_2` (optional) | Second editor’s password — must be set if `EMAIL_2` is set |

3. In **[Convex dashboard](https://dashboard.convex.dev)** → your deployment → **Settings** → **Environment Variables** → set **`BLOG_ADMIN_SECRET`** to the **exact same** value as on Vercel (needed to save posts / uploads).

4. **Redeploy** on Vercel: **Deployments** → **⋯** on latest → **Redeploy** (env vars are applied at build/runtime for server routes).

## Deploy Convex schema

From the project root:

```bash
npx convex dev
# or for production
npx convex deploy
```

### “Unexpected token &lt; … is not valid JSON” when publishing

The browser tried to parse **JSON** but the server answered with an **HTML page** (often a Vercel/Next error page). Typical causes:

1. **Missing env on Vercel** — `NEXT_PUBLIC_CONVEX_URL`, `BLOG_ADMIN_SECRET`, `BLOG_SESSION_SECRET`, or session/login vars.
2. **`BLOG_ADMIN_SECRET` mismatch** — must match Convex production **exactly** (mutations fail server-side).
3. **Redeploy** after changing env vars.

After fixing env, **Redeploy** on Vercel. The app now shows a clearer alert instead of the raw JSON parse error.

### `ERR_REQUIRE_ESM` / `encoding-lite.js` on `/api/blog/posts` (Vercel)

That comes from **`isomorphic-dompurify` → jsdom → html-encoding-sniffer** loading an ESM-only package via `require()`. Blog **API** sanitization uses **`sanitize-html`** instead (no jsdom), so this should not occur after the current code is deployed.

## Security

- Do **not** put real passwords in source code or chat.
- Prefer a **strong unique password**; change it if it was ever shared.
- `/blogs/mangment` is hidden from search engines via `robots` metadata; it is **not** a substitute for a full auth system—keep the URL private and use strong secrets.
