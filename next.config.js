/** @type {import('next').NextConfig} */
const nextConfig = {
  // Convex CLI often writes CONVEX_URL; the app expects NEXT_PUBLIC_* for the browser.
  // Mirror so the React client and API routes hit the same deployment.
  env: {
    NEXT_PUBLIC_CONVEX_URL:
      process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL || "",
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
