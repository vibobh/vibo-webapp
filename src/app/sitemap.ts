import type { MetadataRoute } from "next";
import { api, getConvexClient } from "@/lib/convexServer";

const SITE_URL = "https://joinvibo.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/blogs`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/newsroom`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/businesses`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: "https://help.joinvibo.com/",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];

  const convex = getConvexClient();
  if (!convex) return base;

  try {
    const posts = await convex.query(api.blogs.listPublished, {});
    const postUrls: MetadataRoute.Sitemap = posts.map((post) => ({
      url: `${SITE_URL}/blogs/${post.slug}`,
      lastModified: new Date(post.updatedAt),
      changeFrequency: "weekly",
      priority: 0.8,
    }));
    return [...base, ...postUrls];
  } catch {
    return base;
  }
}

