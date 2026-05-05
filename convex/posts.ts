import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

const SHORT_ID_ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function makeShortId(): string {
  const len = 11;
  const chars: string[] = [];
  for (let i = 0; i < len; i++) {
    const idx = Math.floor(Math.random() * SHORT_ID_ALPHA.length);
    chars.push(SHORT_ID_ALPHA[idx] ?? "A");
  }
  if (!/[A-Z]/.test(chars.join(""))) chars[0] = "V";
  if (!/[0-9]/.test(chars.join(""))) chars[1] = "9";
  return chars.join("");
}

function postTargetId(postId: Id<"posts">): string {
  return postId as unknown as string;
}

function publicShortId(post: Doc<"posts">): string {
  if (post.shortId && post.shortId.length > 0) return post.shortId;
  return post._id as unknown as string;
}

function isPublishedFeedPost(p: Doc<"posts">): boolean {
  if (p.status !== "published") return false;
  if (p.deletedAt !== undefined) return false;
  const vis = p.moderationVisibilityStatus;
  if (vis === "hidden" || vis === "shadow_hidden") return false;
  return true;
}

interface AuthorLite {
  id: Id<"users">;
  username?: string;
  fullName?: string;
  profilePictureUrl?: string;
  verificationTier?: "blue" | "gold" | "gray";
}

export interface FeedPostDTO {
  id: Id<"posts">;
  shortId: string;
  type: "image" | "video" | "text";
  caption?: string;
  captionAr?: string;
  mediaUrl?: string;
  thumbUrl?: string;
  location?: string;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  shareCount: number;
  createdAt: number;
  author: AuthorLite;
  likedByMe: boolean;
}

export interface FeedCommentDTO {
  id: Id<"comments">;
  username: string;
  text: string;
  createdAt: number;
  likeCount: number;
}

export interface PostDetailDTO extends FeedPostDTO {
  comments: FeedCommentDTO[];
}

async function getViewerId(ctx: QueryCtx): Promise<Id<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return identity.subject as Id<"users">;
}

function authorLite(u: Doc<"users"> | null): AuthorLite {
  if (!u) {
    return { id: "" as Id<"users"> };
  }
  return {
    id: u._id,
    username: u.username,
    fullName: u.fullName,
    profilePictureUrl: u.profilePictureUrl,
    verificationTier: u.verificationTier,
  };
}

async function firstMedia(
  ctx: QueryCtx,
  postId: Id<"posts">,
): Promise<Doc<"postMedia"> | null> {
  return await ctx.db
    .query("postMedia")
    .withIndex("by_post_position", (q) => q.eq("postId", postId).eq("position", 0))
    .first();
}

async function isLikedByViewer(
  ctx: QueryCtx,
  postId: Id<"posts">,
  viewer: Id<"users"> | null,
): Promise<boolean> {
  if (!viewer) return false;
  const row = await ctx.db
    .query("likes")
    .withIndex("by_user_target", (q) =>
      q.eq("userId", viewer).eq("targetType", "post").eq("targetId", postTargetId(postId)),
    )
    .first();
  return row !== null && row.reaction === undefined;
}

async function toFeedPost(
  ctx: QueryCtx,
  post: Doc<"posts">,
  viewer: Id<"users"> | null,
): Promise<FeedPostDTO> {
  const author = await ctx.db.get(post.userId);
  const media = post.mediaCount > 0 ? await firstMedia(ctx, post._id) : null;
  const type: "image" | "video" | "text" =
    !media ? "text" : media.type === "video" ? "video" : "image";
  const likedByMe = await isLikedByViewer(ctx, post._id, viewer);
  return {
    id: post._id,
    shortId: publicShortId(post),
    type,
    caption: post.caption,
    captionAr: undefined,
    mediaUrl: media?.displayUrl,
    thumbUrl: media?.thumbnailUrl ?? undefined,
    location: post.locationName,
    likeCount: post.likeCount ?? 0,
    commentCount: post.commentCount ?? 0,
    repostCount: post.repostCount ?? 0,
    shareCount: post.sharesCount ?? 0,
    createdAt: post.createdAt,
    author: authorLite(author),
    likedByMe,
  };
}

export const listHomeFeed = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const viewer = await getViewerId(ctx);
    const max = Math.max(1, Math.min(100, limit ?? 30));
    const rows = await ctx.db
      .query("posts")
      .withIndex("by_status_created", (q) => q.eq("status", "published"))
      .order("desc")
      .take(max * 2);
    const visible = rows.filter(isPublishedFeedPost).slice(0, max);
    return Promise.all(visible.map((p) => toFeedPost(ctx, p, viewer)));
  },
});

export const listByUserId = query({
  args: {
    userId: v.id("users"),
    type: v.optional(
      v.union(v.literal("image"), v.literal("video"), v.literal("text"), v.literal("all")),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { userId, type, limit }) => {
    const viewer = await getViewerId(ctx);
    const max = Math.max(1, Math.min(100, limit ?? 60));
    const rows = await ctx.db
      .query("posts")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "published"))
      .order("desc")
      .take(max * 2);
    const visible = rows.filter(isPublishedFeedPost);
    const posts: Doc<"posts">[] = [];
    for (const p of visible) {
      if (posts.length >= max) break;
      const dto = await toFeedPost(ctx, p, viewer);
      if (type && type !== "all" && dto.type !== type) continue;
      posts.push(p);
    }
    return Promise.all(posts.map((p) => toFeedPost(ctx, p, viewer)));
  },
});

export const listByUsername = query({
  args: {
    username: v.string(),
    type: v.optional(
      v.union(v.literal("image"), v.literal("video"), v.literal("text"), v.literal("all")),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { username, type, limit }) => {
    const handle = username.trim().toLowerCase();
    const all = await ctx.db.query("users").collect();
    const author = all.find((x) => (x.username ?? "").toLowerCase() === handle);
    if (!author) return [];
    const viewer = await getViewerId(ctx);
    const max = Math.max(1, Math.min(100, limit ?? 60));
    const rows = await ctx.db
      .query("posts")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", author._id).eq("status", "published"),
      )
      .order("desc")
      .take(max * 2);
    const visible = rows.filter(isPublishedFeedPost);
    const posts: Doc<"posts">[] = [];
    for (const p of visible) {
      if (posts.length >= max) break;
      const dto = await toFeedPost(ctx, p, viewer);
      if (type && type !== "all" && dto.type !== type) continue;
      posts.push(p);
    }
    return Promise.all(posts.map((p) => toFeedPost(ctx, p, viewer)));
  },
});

export const getByShortId = query({
  args: { shortId: v.string() },
  handler: async (ctx, { shortId }) => {
    let post: Doc<"posts"> | null = await ctx.db
      .query("posts")
      .withIndex("by_short_id", (q) => q.eq("shortId", shortId))
      .first();
    if (!post && shortId.length >= 20) {
      try {
        post = await ctx.db.get(shortId as Id<"posts">);
      } catch {
        post = null;
      }
    }
    if (!post || !isPublishedFeedPost(post)) return null;
    const viewer = await getViewerId(ctx);
    const base = await toFeedPost(ctx, post, viewer);
    const commentRows = await ctx.db
      .query("comments")
      .withIndex("by_post", (q) => q.eq("postId", post._id))
      .order("desc")
      .take(50);
    const comments: FeedCommentDTO[] = [];
    for (const c of commentRows) {
      if (c.isDeleted) continue;
      if (c.parentCommentId) continue;
      const a = await ctx.db.get(c.authorId);
      comments.push({
        id: c._id,
        username: a?.username ?? "vibo",
        text: c.text,
        createdAt: c.createdAt,
        likeCount: c.likeCount ?? 0,
      });
    }
    const detail: PostDetailDTO = { ...base, comments };
    return detail;
  },
});

export const createPost = mutation({
  args: {
    type: v.union(v.literal("image"), v.literal("video"), v.literal("text")),
    caption: v.optional(v.string()),
    captionAr: v.optional(v.string()),
    mediaUrl: v.optional(v.string()),
    thumbUrl: v.optional(v.string()),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    void args.captionAr;
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const authorId = identity.subject as Id<"users">;
    const author = await ctx.db.get(authorId);
    if (!author) throw new Error("User not found");

    let shortId = makeShortId();
    for (let i = 0; i < 4; i++) {
      const clash = await ctx.db
        .query("posts")
        .withIndex("by_short_id", (q) => q.eq("shortId", shortId))
        .first();
      if (!clash) break;
      shortId = makeShortId();
    }

    const now = Date.now();
    const hasMedia = args.type !== "text" && !!args.mediaUrl?.trim();
    const mediaCount = hasMedia ? 1 : 0;

    const id = await ctx.db.insert("posts", {
      userId: authorId,
      caption: args.caption,
      locationName: args.location,
      visibility: "public",
      mediaCount,
      status: "published",
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
      likeCount: 0,
      commentCount: 0,
      repostCount: 0,
      sharesCount: 0,
      shortId,
    });

    if (hasMedia && args.mediaUrl) {
      await ctx.db.insert("postMedia", {
        postId: id,
        type: args.type === "video" ? "video" : "image",
        position: 0,
        displayUrl: args.mediaUrl,
        thumbnailUrl: args.thumbUrl,
        processingStatus: "completed",
        createdAt: now,
      });
    }

    return { postId: id, shortId };
  },
});

export const toggleLike = mutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, { postId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const userId = identity.subject as Id<"users">;
    const post = await ctx.db.get(postId);
    if (!post) throw new Error("Post not found");
    const tid = postTargetId(postId);

    const existing = await ctx.db
      .query("likes")
      .withIndex("by_user_target", (q) =>
        q.eq("userId", userId).eq("targetType", "post").eq("targetId", tid),
      )
      .first();

    if (existing && existing.reaction === undefined) {
      await ctx.db.delete(existing._id);
      await ctx.db.patch(postId, {
        likeCount: Math.max(0, (post.likeCount ?? 0) - 1),
        updatedAt: Date.now(),
      });
      return { liked: false };
    }
    if (existing && existing.reaction === "down") {
      throw new Error("Use unlike flow for dislikes");
    }

    await ctx.db.insert("likes", {
      userId,
      targetType: "post",
      targetId: tid,
      createdAt: Date.now(),
    });
    await ctx.db.patch(postId, {
      likeCount: (post.likeCount ?? 0) + 1,
      updatedAt: Date.now(),
    });
    return { liked: true };
  },
});

export const addComment = mutation({
  args: { postId: v.id("posts"), text: v.string() },
  handler: async (ctx, { postId, text }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const trimmed = text.trim();
    if (!trimmed) throw new Error("Comment cannot be empty");
    if (trimmed.length > 2000) throw new Error("Comment too long");
    const authorId = identity.subject as Id<"users">;
    const post = await ctx.db.get(postId);
    if (!post) throw new Error("Post not found");

    const now = Date.now();
    const id = await ctx.db.insert("comments", {
      postId,
      authorId,
      text: trimmed,
      createdAt: now,
      likeCount: 0,
    });
    await ctx.db.patch(postId, {
      commentCount: (post.commentCount ?? 0) + 1,
      updatedAt: now,
    });
    return { commentId: id };
  },
});
