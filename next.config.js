function convexImageHostname() {
  const raw = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
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
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  // Single source of truth: set NEXT_PUBLIC_CONVEX_URL in .env.local (same host as CONVEX_DEPLOYMENT).
  // Do NOT fall back to CONVEX_URL here — the CLI may set a different deployment than NEXT_PUBLIC_* and
  // would override the URL you intend (e.g. calculating-viper-482 vs fortunate-capybara-474).
  env: {
    NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL?.trim() || "",
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
