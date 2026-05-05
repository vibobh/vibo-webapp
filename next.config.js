/** Same resolution as `getConvexDeploymentUrl` in src/lib/convexServer.ts (browser + API routes). */
function resolvedConvexUrl() {
  return (
    process.env.NEXT_PUBLIC_CONVEX_URL?.trim() ||
    process.env.EXPO_PUBLIC_CONVEX_URL?.trim() ||
    process.env.CONVEX_URL?.trim() ||
    process.env.SOURCE_CONVEX_URL?.trim() ||
    ""
  );
}

function convexImageHostname() {
  const raw = resolvedConvexUrl();
  if (!raw) return null;
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
}

const convexHost = convexImageHostname();

/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Disk pack cache on Windows can throw ENOENT on rename under `.next/cache/webpack`.
   * Memory cache avoids flaky PackFileCacheStrategy errors in dev (slightly slower cold compile).
   */
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = { type: "memory" };
    }
    return config;
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  // Prefer NEXT_PUBLIC_CONVEX_URL (Next.js web); else EXPO_PUBLIC_* if you pasted a mobile .env; else CONVEX_URL / SOURCE_*.
  // First defined wins. Restart `npm run dev` after changing .env.local.
  env: {
    NEXT_PUBLIC_CONVEX_URL: resolvedConvexUrl(),
  },
  async rewrites() {
    return [
      { source: "/.well-known/openid-configuration", destination: "/api/auth/oidc" },
      { source: "/.well-known/jwks.json", destination: "/api/auth/jwks" },
    ];
  },
  async redirects() {
    return [
      {
        source: "/blogs/management",
        destination: "/mangment",
        permanent: false,
      },
      {
        source: "/blogs/mangment",
        destination: "/mangment",
        permanent: false,
      },
    ];
  },
  images: {
    remotePatterns: [
      ...(convexHost ? [{ protocol: "https", hostname: convexHost }] : []),
      { protocol: "https", hostname: "joinvibo.com" },
      { protocol: "https", hostname: "www.joinvibo.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "images.pexels.com" },
      // News article thumbnails (NewsAPI) use <img> in newsroom; these help if you switch to next/image.
      { protocol: "https", hostname: "cdn.cnn.com" },
      { protocol: "https", hostname: "static01.nyt.com" },
      { protocol: "https", hostname: "image.cnbcfm.com" },
      { protocol: "https", hostname: "assets.bwbx.io" },
    ],
  },
};

module.exports = nextConfig;
