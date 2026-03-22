import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const blogCategory = v.union(
  v.literal("article"),
  v.literal("case_study"),
  v.literal("featured"),
  v.literal("guide"),
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
});
