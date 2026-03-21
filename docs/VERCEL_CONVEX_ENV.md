# Fix Vercel: `CONVEX_DEPLOY_KEY` / `NEXT_PUBLIC_CONVEX_URL`

If the build fails with:

> Vercel build environment detected but no Convex deployment configuration found.

add these in **Vercel** → **Project** → **Settings** → **Environment Variables**.

## 1. `CONVEX_DEPLOY_KEY` (required for `npx convex deploy` on Vercel)

1. Open [Convex Dashboard](https://dashboard.convex.dev) and select the **same project** this repo uses.
2. **Settings** (gear) → **Deploy keys** (or **URL & deploy key**).
3. **Generate** / **Create deploy key** for the **Production** deployment (not only dev).
4. Copy the key (starts with something like `prod:` or similar — treat as secret).
5. In Vercel, add:
   - **Name:** `CONVEX_DEPLOY_KEY`
   - **Value:** paste the key
   - **Environments:** at least **Production**; add **Preview** too if you want branch previews to run Convex deploy.

## 2. `NEXT_PUBLIC_CONVEX_URL` (required for the browser)

1. Same Convex project → **Settings** → find the **Production** deployment **URL** (e.g. `https://happy-animal-123.convex.cloud`).
2. In Vercel, add:
   - **Name:** `NEXT_PUBLIC_CONVEX_URL`
   - **Value:** that URL (no trailing slash)
   - **Environments:** Production, Preview, Development (match how you use the app).

## 3. Redeploy

**Deployments** → latest failed deployment → **Redeploy**, or push a new commit.

---

## Convex MCP in Cursor (`user-convex`)

Tools like **`status`** need you to be logged in from the project folder:

```bash
cd path/to/vibo_webapp
npx convex login
npx convex dev
```

After that, the MCP can list deployments and URLs. Until login succeeds locally, you’ll see **Not Authorized**.
