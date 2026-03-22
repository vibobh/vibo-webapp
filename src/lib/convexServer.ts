import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";

export { api };

export function getConvexDeploymentUrl(): string | null {
  const url =
    process.env.NEXT_PUBLIC_CONVEX_URL?.trim() ||
    process.env.CONVEX_URL?.trim() ||
    "";
  return url || null;
}

export function getConvexClient(): ConvexHttpClient | null {
  const url = getConvexDeploymentUrl();
  if (!url) return null;
  return new ConvexHttpClient(url);
}
