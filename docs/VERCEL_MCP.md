# Vercel + Cursor MCP

Your Cursor workspace has the **Vercel MCP** (`user-vercel`). Here’s how it fits deployment.

## What the MCP can do

| Tool | Use |
|------|-----|
| **`deploy_to_vercel`** | Tells you to run **`vercel deploy`** from the project root. It does **not** push code by itself—you need the [Vercel CLI](https://vercel.com/docs/cli) and a linked project (`.vercel/` folder). |
| **`list_teams` / `list_projects`** | See team/project IDs (e.g. after you create a project). |
| **`get_deployment` / `get_deployment_build_logs` / `get_runtime_logs`** | Debug a deployment once it exists. |
| **`search_vercel_documentation`** | Look up platform behavior (builds, env, domains). |

## One-time setup (CLI)

From **`vibo_webapp`**:

```bash
npx vercel login
npx vercel link
```

- Pick team **“vibo's projects”** (or your team).
- Create or link project **`vibo-webapp`** (match GitHub repo name if you use Git integration).

Then deploy:

```bash
npx vercel deploy --prod
```

Or use the npm script:

```bash
npm run vercel:prod
```

## GitHub → Vercel (recommended)

1. [Import the GitHub repo](https://vercel.com/new) in the Vercel dashboard.
2. Set **`NEXT_PUBLIC_VIDEO_BASE_URL`** for hero MP4s (hosted outside Git — see **`docs/VIDEOS_PRODUCTION.md`**). Git LFS is **not** used.
3. Set env vars: `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_DEPLOY_KEY`.
4. Pushes to `main` deploy automatically; `vercel.json` already sets the **Convex + Next** build command.

## Why `deploy_to_vercel` doesn’t “click deploy”

The MCP delegates to the **Vercel CLI** because deployments need your account context and (often) interactive linking. After **`vercel link`**, Cursor’s **`deploy_to_vercel`** reminder matches **`npx vercel deploy`**.
