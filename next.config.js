/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
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
