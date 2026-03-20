# Vibo — Marketing site

Next.js 14 · Tailwind · Framer Motion · **Convex** (backend) · deploy on **Vercel**.

**Live domain (target):** [joinvibo.com](https://joinvibo.com)

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) (or `npm run dev -- -p 3001` for port 3001).

## Convex

```bash
npx convex login
npm run convex:dev
```

See [`convex/README.md`](convex/README.md).

## Deploy (GitHub + Vercel + domain)

**→ Full guide: [`DEPLOYMENT.md`](DEPLOYMENT.md)** — GitHub user `vibobh`, Convex, Vercel env vars, **DNS for joinvibo.com**.

## Env

Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_CONVEX_URL` after `convex dev`.
