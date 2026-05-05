import { getConvexDeploymentUrl } from "./convexServer";

/**
 * Origin for Convex HTTP router routes (e.g. `convex_app/http.ts` → `/music/search`).
 * Browser clients use `.convex.site`; the JS client URL is usually `.convex.cloud`.
 */
export function getConvexHttpOrigin(): string | null {
  const raw = getConvexDeploymentUrl();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.hostname.toLowerCase().endsWith(".convex.cloud")) {
      u.hostname = u.hostname.replace(/\.convex\.cloud$/i, ".convex.site");
    }
    return u.origin;
  } catch {
    return null;
  }
}
