import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";

export { api };

/**
 * Single source of truth for which Convex deployment the Next.js app talks to.
 * Must match the project you open in the Convex dashboard (see CONVEX_DEPLOYMENT in .env.local).
 */
export function getConvexDeploymentUrl(): string | null {
  // Use only NEXT_PUBLIC_CONVEX_URL so API routes match the browser and .env.local.
  // Do not fall back to CONVEX_URL (Convex CLI / shell may point at another deployment).
  const url = process.env.NEXT_PUBLIC_CONVEX_URL?.trim() || "";
  return url || null;
}

/** Warn in dev if URL hostname does not match CONVEX_DEPLOYMENT (e.g. wrong dashboard project). */
export function warnConvexDeploymentMismatch(convexUrl: string): void {
  const dep = process.env.CONVEX_DEPLOYMENT?.trim();
  if (!dep || process.env.NODE_ENV !== "development") return;
  const slug = dep.replace(/^(dev|prod):/, "");
  try {
    const host = new URL(convexUrl).hostname;
    if (!host.startsWith(`${slug}.`)) {
      // eslint-disable-next-line no-console
      console.warn(
        `[vibo] Convex URL "${convexUrl}" does not match CONVEX_DEPLOYMENT "${dep}". ` +
          `Sign up / sign in write to the URL above — open that deployment in the dashboard to see users.`,
      );
    }
  } catch {
    /* ignore invalid URL */
  }
}

export function createConvexHttpClient(): ConvexHttpClient {
  const url = getConvexDeploymentUrl();
  if (!url) {
    throw new Error(
      "Convex is not configured: set NEXT_PUBLIC_CONVEX_URL in .env.local to your deployment URL " +
        "(e.g. https://YOUR_DEPLOYMENT.convex.cloud) and restart `npm run dev`. " +
        "It must match CONVEX_DEPLOYMENT from `npx convex dev`.",
    );
  }
  warnConvexDeploymentMismatch(url);
  return new ConvexHttpClient(url);
}

export function getConvexClient(): ConvexHttpClient | null {
  const url = getConvexDeploymentUrl();
  if (!url) return null;
  return new ConvexHttpClient(url);
}
