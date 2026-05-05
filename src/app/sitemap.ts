import type { MetadataRoute } from "next";
import { getConvexClient } from "@/lib/convexServer";
import { api } from "@convex_app/_generated/api";
import { SITE_URL } from "@/lib/seo";

/**
 * When public profile routes exist (e.g. /u/[username]), return their canonical URLs here.
 * Do not emit URLs that 404 — wait until the route and data source are live.
 */
export function getProfileSitemapEntries(): MetadataRoute.Sitemap {
  return [];
}

/**
 * When public post permalinks exist (e.g. /post/[id]), return them here with lastModified from your API.
 */
export function getPostSitemapEntries(): MetadataRoute.Sitemap {
  return [];
}

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
      url: `${SITE_URL}/about`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.85,
    },
    {
      url: `${SITE_URL}/careers`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.75,
    },
    {
      url: `${SITE_URL}/login`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/signup`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
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
    const postUrls: MetadataRoute.Sitemap = posts.map((post: (typeof posts)[number]) => ({
      url: `${SITE_URL}/blogs/${post.slug}`,
      lastModified: new Date(post.updatedAt),
      changeFrequency: "weekly",
      priority: 0.8,
    }));
    return [
      ...base,
      ...postUrls,
      ...getProfileSitemapEntries(),
      ...getPostSitemapEntries(),
    ];
  } catch {
    return [...base, ...getProfileSitemapEntries(), ...getPostSitemapEntries()];
  }
}

