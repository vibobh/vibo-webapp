import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const blogCategory = v.union(
  v.literal("article"),
  v.literal("case_study"),
  v.literal("featured"),
  v.literal("guide"),
);

const newsTag = v.union(
  v.literal("all"),
  v.literal("community"),
  v.literal("company"),
  v.literal("news"),
  v.literal("product"),
  v.literal("safety"),
);

const newsStatus = v.union(
  v.literal("draft"),
  v.literal("approved"),
);

export default defineSchema({
  blogs: defineTable({
    slug: v.string(),
    title: v.string(),
    excerpt: v.string(),
    category: blogCategory,
    authorName: v.string(),
    authorImageId: v.optional(v.id("_storage")),
    coverImageId: v.optional(v.id("_storage")),
    bodyHtml: v.string(),
    published: v.boolean(),
    publishedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_published", ["published", "publishedAt"]),

  // Editor-approved news items that appear on `/newsroom`.
  // Drafts exist only for the moderation UI at `/mangment` and are deleted on reject.
  newsItems: defineTable({
    tag: newsTag,
    status: newsStatus,
    title: v.string(),
    description: v.string(),
    content: v.optional(v.string()),

    url: v.string(),
    urlToImage: v.optional(v.string()),

    publishedAt: v.string(),
    publishedAtMs: v.number(),
    sourceName: v.string(),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status_tag", ["status", "tag"])
    // Dedupe across refreshes for the same tag.
    .index("by_url_tag", ["url", "tag"]),
});
