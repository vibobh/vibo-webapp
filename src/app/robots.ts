import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/mangment", "/blogs/mangment", "/api/"],
      },
    ],
    sitemap: "https://joinvibo.com/sitemap.xml",
    host: "https://joinvibo.com",
  };
}

