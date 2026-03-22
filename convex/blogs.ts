import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const blogCategory = v.union(
  v.literal("article"),
  v.literal("case_study"),
  v.literal("featured"),
  v.literal("guide"),
);

function requireAdmin(secret: string | undefined) {
  const expected = process.env.BLOG_ADMIN_SECRET;
  if (!expected || secret !== expected) {
    throw new Error("Unauthorized");
  }
}

/** Public: published posts, newest first */
export const listPublished = query({
  args: {},
  handler: async (ctx) => {
    // Full scan + filter (small table) — avoids edge cases with compound-index + optional publishedAt
    const rows = (await ctx.db.query("blogs").collect()).filter((b) => !!b.published);
    rows.sort(
      (a, b) =>
        (b.publishedAt ?? b.updatedAt) - (a.publishedAt ?? a.updatedAt),
    );

    const withUrls = await Promise.all(
      rows.map(async (b) => {
        let authorImageUrl: string | null = null;
        let coverImageUrl: string | null = null;
        try {
          if (b.authorImageId) {
            authorImageUrl = await ctx.storage.getUrl(b.authorImageId);
          }
        } catch {
          authorImageUrl = null;
        }
        try {
          if (b.coverImageId) {
            coverImageUrl = await ctx.storage.getUrl(b.coverImageId);
          }
        } catch {
          coverImageUrl = null;
        }
        return {
          _id: b._id,
          slug: b.slug,
          title: b.title,
          excerpt: b.excerpt,
          category: b.category,
          authorName: b.authorName,
          authorImageUrl,
          coverImageUrl,
          publishedAt: b.publishedAt ?? b.updatedAt,
          updatedAt: b.updatedAt,
        };
      }),
    );

    return withUrls;
  },
});

/** Public: single post by slug */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const b = await ctx.db
      .query("blogs")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!b || !b.published) return null;
    return {
      _id: b._id,
      slug: b.slug,
      title: b.title,
      excerpt: b.excerpt,
      category: b.category,
      authorName: b.authorName,
      authorImageUrl: b.authorImageId
        ? await ctx.storage.getUrl(b.authorImageId)
        : null,
      coverImageUrl: b.coverImageId
        ? await ctx.storage.getUrl(b.coverImageId)
        : null,
      bodyHtml: b.bodyHtml,
      publishedAt: b.publishedAt ?? b.updatedAt,
      updatedAt: b.updatedAt,
    };
  },
});

/** Admin: all posts (includes body for editor) */
export const listAll = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    requireAdmin(secret);
    const rows = await ctx.db.query("blogs").collect();
    rows.sort((a, b) => b.updatedAt - a.updatedAt);
    return Promise.all(
      rows.map(async (b) => ({
        _id: b._id,
        slug: b.slug,
        title: b.title,
        excerpt: b.excerpt,
        category: b.category,
        authorName: b.authorName,
        authorImageId: b.authorImageId ?? null,
        coverImageId: b.coverImageId ?? null,
        authorImageUrl: b.authorImageId
          ? await ctx.storage.getUrl(b.authorImageId)
          : null,
        coverImageUrl: b.coverImageId
          ? await ctx.storage.getUrl(b.coverImageId)
          : null,
        bodyHtml: b.bodyHtml,
        published: b.published,
        publishedAt: b.publishedAt,
        updatedAt: b.updatedAt,
      })),
    );
  },
});

export const generateUploadUrl = mutation({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    requireAdmin(secret);
    return await ctx.storage.generateUploadUrl();
  },
});

export const createBlog = mutation({
  args: {
    secret: v.string(),
    slug: v.string(),
    title: v.string(),
    excerpt: v.string(),
    category: blogCategory,
    authorName: v.string(),
    authorImageId: v.optional(v.id("_storage")),
    coverImageId: v.optional(v.id("_storage")),
    bodyHtml: v.string(),
    published: v.boolean(),
  },
  handler: async (ctx, args) => {
    requireAdmin(args.secret);
    const existing = await ctx.db
      .query("blogs")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (existing) {
      throw new Error("Slug already exists");
    }
    const now = Date.now();
    return await ctx.db.insert("blogs", {
      slug: args.slug,
      title: args.title,
      excerpt: args.excerpt,
      category: args.category,
      authorName: args.authorName,
      authorImageId: args.authorImageId,
      coverImageId: args.coverImageId,
      bodyHtml: args.bodyHtml,
      published: args.published,
      publishedAt: args.published ? now : undefined,
      updatedAt: now,
    });
  },
});

export const updateBlog = mutation({
  args: {
    secret: v.string(),
    id: v.id("blogs"),
    slug: v.string(),
    title: v.string(),
    excerpt: v.string(),
    category: blogCategory,
    authorName: v.string(),
    authorImageId: v.optional(v.id("_storage")),
    coverImageId: v.optional(v.id("_storage")),
    bodyHtml: v.string(),
    published: v.boolean(),
  },
  handler: async (ctx, args) => {
    requireAdmin(args.secret);
    const current = await ctx.db.get(args.id);
    if (!current) throw new Error("Not found");
    if (current.slug !== args.slug) {
      const clash = await ctx.db
        .query("blogs")
        .withIndex("by_slug", (q) => q.eq("slug", args.slug))
        .unique();
      if (clash && clash._id !== args.id) {
        throw new Error("Slug already exists");
      }
    }
    const now = Date.now();
    let publishedAt = current.publishedAt;
    if (args.published && !current.published) {
      publishedAt = now;
    }
    if (!args.published) {
      publishedAt = undefined;
    }
    await ctx.db.patch(args.id, {
      slug: args.slug,
      title: args.title,
      excerpt: args.excerpt,
      category: args.category,
      authorName: args.authorName,
      authorImageId: args.authorImageId,
      coverImageId: args.coverImageId,
      bodyHtml: args.bodyHtml,
      published: args.published,
      publishedAt,
      updatedAt: now,
    });
  },
});

export const deleteBlog = mutation({
  args: { secret: v.string(), id: v.id("blogs") },
  handler: async (ctx, { secret, id }) => {
    requireAdmin(secret);
    await ctx.db.delete(id);
  },
});
