# Deploy Vibo — GitHub · Vercel · Convex · joinvibo.com

Use these accounts:

| Service | Email / user |
|--------|----------------|
| **GitHub** | `joinvibo@gmail.com` · username **`vibobh`** |
| **Convex** | `abdullahilal888@gmail.com` |
| **Vercel** | `joinvibo@gmail.com` |

---

## 1. GitHub — push this repo

From the project folder (`vibo_webapp`):

```bash
git init
git add .
git commit -m "Initial commit: Vibo landing + Convex + Vercel"
```

On [github.com/new](https://github.com/new):

- Repository name: e.g. `vibo-webapp` or `joinvibo`
- Owner: **`vibobh`**
- Private or Public — your choice

Then:

```bash
git branch -M main
git remote add origin https://github.com/vibobh/YOUR-REPO-NAME.git
git push -u origin main
```

(Use SSH if you prefer: `git@github.com:vibobh/YOUR-REPO-NAME.git`.)

---

## 2. Convex — database / backend

1. Go to [dashboard.convex.dev](https://dashboard.convex.dev) and sign in with **abdullahilal888@gmail.com** (or invite that email to your team).

2. **Local dev** (generates `convex/_generated` and `.env.local`):

   ```bash
   npx convex login
   npm run convex:dev
   ```

3. **Production deploy key** (for Vercel):

   - Convex Dashboard → your project → **Settings** → **Deploy keys**  
   - Create a deploy key and copy it — you will add it to Vercel as `CONVEX_DEPLOY_KEY`.

4. **Environment variable for the browser:**

   - Convex Dashboard → **Settings** → copy **Deployment URL** (looks like `https://something.convex.cloud`).
   - In Vercel, set:

     `NEXT_PUBLIC_CONVEX_URL` = that URL  

---

## 3. Vercel — deploy

This repo includes **`vercel.json`**: build runs **`npx convex deploy --cmd "npm run build"`** (Convex production + Next.js). Cursor’s **Vercel MCP** (`user-vercel`) can list teams/projects and remind you to run **`vercel deploy`**; see **`docs/VERCEL_MCP.md`** for the full MCP + CLI flow.

1. Sign in at [vercel.com](https://vercel.com) with **joinvibo@gmail.com**.

2. **Import** the GitHub repo (`vibobh/...`).

3. **Git LFS (videos in `public/videos/`)** — required so builds get the real MP4 files, not tiny pointer files:

   - **Locally / new clone:** `git lfs install` then `git lfs pull`.
   - **Vercel:** Uses Git to clone your repo. Ensure **Git LFS** is enabled for the project: **Project → Settings → Git** — turn on **Git LFS** if you see that option (Vercel’s build environment fetches LFS objects when enabled).  
   - If videos 404 in production, redeploy after confirming LFS is on and the latest push included the LFS upload (`git lfs ls-files` should list the five clips).

4. **Environment variables** (Project → Settings → Environment Variables):

   | Name | Value |
   |------|--------|
   | `NEXT_PUBLIC_CONVEX_URL` | Your Convex **production** deployment URL from the Convex dashboard |
   | `CONVEX_DEPLOY_KEY` | Deploy key from Convex (Production only is enough) |

5. **Build command** (Project → Settings → General → Build & Development):

   Use Convex’s recommended production build:

   ```bash
   npx convex deploy --cmd "npm run build"
   ```

   Or set **npm script** `build:production` in `package.json` and point Vercel’s build command to:

   ```bash
   npm run build:production
   ```

   (Both run Convex deploy + Next.js build.)

6. **Install** the official **Convex** integration for Vercel if you use it (optional; env vars above are enough for many setups).

7. Deploy. After the first successful deploy, assign the custom domain (next section).

---

## 4. Domain **joinvibo.com** — DNS

Your domain is registered elsewhere (GoDaddy, Namecheap, Cloudflare, etc.). Point it to Vercel:

### A. In Vercel

1. Project → **Settings** → **Domains**
2. Add **`joinvibo.com`** and **`www.joinvibo.com`**
3. Vercel will show the exact DNS records to add (copy from there — they can vary slightly).

### B. Typical records (verify in Vercel UI)

**Root domain `joinvibo.com` (apex):**

- **A** record  
  - Name: `@`  
  - Value: **`76.76.21.21`** (Vercel’s apex IP)

**OR** (if your DNS provider supports it) **ALIAS/ANAME** to Vercel’s target — see Vercel’s domain screen.

**`www` subdomain:**

- **CNAME**  
  - Name: `www`  
  - Value: **`cname.vercel-dns.com`**

### C. After DNS propagates (minutes–48h)

- Vercel will issue **SSL** automatically.
- Force **HTTPS** in Vercel (default on).

### D. Email on `joinvibo@gmail.com`

- Do **not** point the root MX to Vercel.  
- If you use Google Workspace / Gmail for `@joinvibo.com`, keep your **MX** records as Google’s docs say; only add the A/CNAME for the website.

---

## 5. Performance checklist (already done in code)

- Videos load/play only when near the viewport (`LazyVideo`).
- Gradient background uses CSS gradients (no heavy blur stacks).
- `prefers-reduced-motion` for marquee.
- Optional: compress MP4s for `public/videos/` and use 720p for hero.

---

## 6. Local port 3001

Vercel does **not** use 3001 — that’s only local (`next dev -p 3001`). Production uses `https://joinvibo.com` on Vercel’s edge.

---

## Troubleshooting

| Issue | Fix |
|--------|-----|
| Build fails on Convex | Ensure `CONVEX_DEPLOY_KEY` and build command include `convex deploy` |
| “No Convex deployment configuration” on Vercel | Set **`CONVEX_DEPLOY_KEY`** (Production deploy key) in Vercel — see **`docs/VERCEL_CONVEX_ENV.md`** |
| `NEXT_PUBLIC_CONVEX_URL` missing | Convex dashboard → copy **Production** deployment URL |
| Domain not verifying | Wait for DNS propagation; check A/CNAME match Vercel exactly |
| Videos missing / broken on live site | Enable **Git LFS** in Vercel Git settings; run `git lfs push --all origin` locally if LFS objects never uploaded |

---

If you want, paste your DNS provider (e.g. Cloudflare) and we can double-check records line-by-line.
