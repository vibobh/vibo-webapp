import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const newsTag = v.union(
  v.literal("all"),
  v.literal("community"),
  v.literal("company"),
  v.literal("news"),
  v.literal("product"),
  v.literal("safety"),
);

const newsStatus = v.union(v.literal("draft"), v.literal("approved"));

function requireAdmin(secret: string | undefined) {
  const expected = process.env.BLOG_ADMIN_SECRET;
  if (!expected || secret !== expected) {
    throw new Error("Unauthorized");
  }
}

export const listDrafts = query({
  args: { secret: v.string(), tag: newsTag },
  handler: async (ctx, { secret, tag }) => {
    requireAdmin(secret);
    const rows = await ctx.db
      .query("newsItems")
      .withIndex("by_status_tag", (q) =>
        q.eq("status", "draft").eq("tag", tag),
      )
      .collect();

    rows.sort((a, b) => b.publishedAtMs - a.publishedAtMs);
    return rows.map((n) => ({
      _id: n._id,
      tag: n.tag,
      status: n.status,
      title: n.title,
      description: n.description,
      content: n.content ?? null,
      url: n.url,
      urlToImage: n.urlToImage ?? null,
      publishedAt: n.publishedAt,
      publishedAtMs: n.publishedAtMs,
      sourceName: n.sourceName,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    }));
  },
});

export const listApproved = query({
  args: { tag: newsTag },
  handler: async (ctx, { tag }) => {
    const rows = await ctx.db
      .query("newsItems")
      .withIndex("by_status_tag", (q) =>
        q.eq("status", "approved").eq("tag", tag),
      )
      .collect();

    rows.sort((a, b) => b.publishedAtMs - a.publishedAtMs);
    return rows.map((n) => ({
      _id: n._id,
      tag: n.tag,
      status: n.status,
      title: n.title,
      description: n.description,
      content: n.content ?? null,
      url: n.url,
      urlToImage: n.urlToImage ?? null,
      publishedAt: n.publishedAt,
      publishedAtMs: n.publishedAtMs,
      sourceName: n.sourceName,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    }));
  },
});

export const upsertDrafts = mutation({
  args: {
    secret: v.string(),
    tag: newsTag,
    items: v.array(
      v.object({
        title: v.string(),
        description: v.string(),
        content: v.optional(v.string()),
        url: v.string(),
        urlToImage: v.optional(v.string()),
        publishedAt: v.string(),
        publishedAtMs: v.number(),
        sourceName: v.string(),
      }),
    ),
  },
  handler: async (ctx, { secret, tag, items }) => {
    requireAdmin(secret);

    const now = Date.now();
    for (const item of items) {
      const existing = await ctx.db
        .query("newsItems")
        .withIndex("by_url_tag", (q) =>
          q.eq("url", item.url).eq("tag", tag),
        )
        .unique();

      if (!existing) {
        await ctx.db.insert("newsItems", {
          tag,
          status: "draft",
          title: item.title,
          description: item.description,
          content: item.content,
          url: item.url,
          urlToImage: item.urlToImage,
          publishedAt: item.publishedAt,
          publishedAtMs: item.publishedAtMs,
          sourceName: item.sourceName,
          createdAt: now,
          updatedAt: now,
        });
        continue;
      }

      // If already approved, keep it approved.
      if (existing.status === "approved") continue;

      await ctx.db.patch(existing._id, {
        title: item.title,
        description: item.description,
        content: item.content,
        url: item.url,
        urlToImage: item.urlToImage,
        publishedAt: item.publishedAt,
        publishedAtMs: item.publishedAtMs,
        sourceName: item.sourceName,
        updatedAt: now,
      });
    }
  },
});

export const approve = mutation({
  args: { secret: v.string(), id: v.id("newsItems") },
  handler: async (ctx, { secret, id }) => {
    requireAdmin(secret);
    await ctx.db.patch(id, { status: "approved", updatedAt: Date.now() });
  },
});

export const rejectDelete = mutation({
  args: { secret: v.string(), id: v.id("newsItems") },
  handler: async (ctx, { secret, id }) => {
    requireAdmin(secret);
    await ctx.db.delete(id);
  },
});

