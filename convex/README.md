# Convex backend

1. Log in with the Google account that owns or has access to this Convex project:

   ```bash
   npx convex login
   ```

2. Start dev (creates deployment, `.env.local`, and `convex/_generated/`):

   ```bash
   npm run convex:dev
   ```

3. Add functions under `convex/` and run `npx convex codegen` when needed (often automatic in dev).

To add a health query later, create `convex/health.ts` and run codegen — see [Convex docs](https://docs.convex.dev).
