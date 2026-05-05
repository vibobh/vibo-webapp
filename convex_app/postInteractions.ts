import { v } from "convex/values";
import { api } from "./_generated/api";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { assertUserCanMutate } from "./accountModeration";
import { insertPostCounterDelta } from "./postCounterDeltas";
import { insertLikePostProductEvent } from "./productAnalytics";
import { usersBlockedEitherWay } from "./viewerContentFilters";

type UserVote = "none" | "up" | "down";

function currentPostVote(row: Doc<"likes"> | null | undefined): UserVote {
  if (!row || row.targetType !== "post") return "none";
  return row.reaction === "down" ? "down" : "up";
}

/**
 * Posts use heart-only likes (no dislike in the product).
 * Toggle: up ↔ none; from down → up (clears legacy dislike and adds like).
 */
async function togglePostLike(
  ctx: MutationCtx,
  postId: Id<"posts">,
  userId: Id<"users">,
): Promise<{
  liked: boolean;
  likeCount: number;
  dislikeCount: number;
}> {
  await assertUserCanMutate(ctx, userId);
  const post = await ctx.db.get(postId);
  if (!post) throw new Error("Post not found");
  if (post.status !== "published") throw new Error("Post not available");

  if (String(post.userId) !== String(userId)) {
    if (await usersBlockedEitherWay(ctx, userId, post.userId)) {
      throw new Error("Interaction not allowed");
    }
  }

  const existing = await ctx.db
    .query("likes")
    .withIndex("by_user_target", (q) =>
      q.eq("userId", userId).eq("targetType", "post").eq("targetId", postId),
    )
    .first();

  const current = currentPostVote(existing ?? null);

  let next: UserVote;
  if (current === "up") {
    next = "none";
  } else {
    next = "up";
  }

  let likeDelta = 0;
  let dislikeDelta = 0;
  if (current === "up" && next === "none") likeDelta = -1;
  else if (current === "down" && next === "up") {
    dislikeDelta = -1;
    likeDelta = 1;
  } else if (current === "none" && next === "up") likeDelta = 1;

  if (next === "none") {
    if (existing) await ctx.db.delete(existing._id);
  } else if (existing) {
    await ctx.db.patch(existing._id, { reaction: undefined });
  } else {
    await ctx.db.insert("likes", {
      userId,
      targetType: "post",
      targetId: postId,
      createdAt: Date.now(),
    });
  }

  const newLikeCount = Math.max(0, (post.likeCount || 0) + likeDelta);
  const newDislikeCount = Math.max(0, (post.dislikeCount || 0) + dislikeDelta);

  // Schedule counter patches via the delta log instead of patching the hot
  // `posts` row directly.  This eliminates OCC retries when many users like
  // the same post concurrently (viral posts).  The client's optimistic update
  // keeps the UI instant; the rollup cron applies the real patch within 2 min.
  if (likeDelta !== 0) {
    await insertPostCounterDelta(ctx, postId, "likeCount", likeDelta);
  }
  if (dislikeDelta !== 0) {
    await insertPostCounterDelta(ctx, postId, "dislikeCount", dislikeDelta);
  }

  if (current !== "up" && next === "up") {
    try {
      await insertLikePostProductEvent(ctx, userId, postId);
    } catch {
      /* non-fatal product analytics */
    }
  }

  if (post.userId !== userId) {
    if (current !== "up" && next === "up") {
      await ctx.scheduler.runAfter(
        0,
        (api.notifications as any).internalAddLikeToGroup,
        {
          receiverId: post.userId,
          type: "like_post",
          targetType: "post",
          targetId: postId,
          senderId: userId,
        },
      );
    } else if (current === "up" && next === "none") {
      await ctx.scheduler.runAfter(
        0,
        (api.notifications as any).internalRemoveLikeFromGroup,
        {
          receiverId: post.userId,
          type: "like_post",
          targetId: postId,
          senderId: userId,
          targetType: "post" as const,
        },
      );
    }
  }

  return {
    liked: next === "up",
    likeCount: newLikeCount,
    dislikeCount: newDislikeCount,
  };
}

// ============================================
// LIKES - Posts (heart only; legacy dislike rows still affect counts when toggling)
// ============================================

/**
 * Toggle heart like on a post (no per-post dislike in the app).
 */
export const voteOnPost = mutation({
  args: {
    postId: v.id("posts"),
    userId: v.optional(v.id("users")),
  },
  returns: v.object({
    liked: v.boolean(),
    likeCount: v.number(),
    dislikeCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const userId =
      args.userId ?? ((ctx as any).userId as Id<"users"> | undefined);
    if (!userId) throw new Error("Unauthorized");
    return togglePostLike(ctx, args.postId, userId);
  },
});

/**
 * Like / unlike a post (same as `voteOnPost`).
 */
export const likePost = mutation({
  args: {
    postId: v.id("posts"),
    userId: v.optional(v.id("users")),
  },
  returns: v.object({
    liked: v.boolean(),
    disliked: v.boolean(),
    likeCount: v.number(),
    dislikeCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const userId =
      args.userId ?? ((ctx as any).userId as Id<"users"> | undefined);
    if (!userId) throw new Error("Unauthorized");
    const r = await togglePostLike(ctx, args.postId, userId);
    return {
      liked: r.liked,
      disliked: false,
      likeCount: r.likeCount,
      dislikeCount: r.dislikeCount,
    };
  },
});

/**
 * Check if user has liked a post (up-vote).
 */
export const isPostLiked = query({
  args: {
    postId: v.id("posts"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const userId = (ctx as any).userId as Id<"users"> | undefined;
    if (!userId) return false;

    const like = await ctx.db
      .query("likes")
      .withIndex("by_user_target", (q) =>
        q
          .eq("userId", userId)
          .eq("targetType", "post")
          .eq("targetId", args.postId),
      )
      .first();

    return currentPostVote(like ?? null) === "up";
  },
});

/**
 * Get users who liked a post (up-votes only).
 */
export const getPostLikers = query({
  args: {
    postId: v.id("posts"),
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  returns: v.object({
    users: v.array(v.any()),
    nextCursor: v.optional(v.number()),
    totalCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const userId = (ctx as any).userId as Id<"users"> | undefined;
    const limit = args.limit ?? 20;

    const post = await ctx.db.get(args.postId);
    if (!post) {
      return { users: [], totalCount: 0 };
    }

    let q = ctx.db
      .query("likes")
      .withIndex("by_target", (q) =>
        q.eq("targetType", "post").eq("targetId", args.postId),
      );

    const cursor = args.cursor;
    if (cursor !== undefined) {
      q = q.filter((q) => q.lt(q.field("createdAt"), cursor));
    }

    const rawLikes = await q.order("desc").collect();
    const likes = rawLikes.filter((l) => l.reaction !== "down");

    const page = likes.slice(0, limit + 1);

    let nextCursor: number | undefined;
    let pageLikes = page;
    if (page.length > limit) {
      nextCursor = page[limit - 1].createdAt;
      pageLikes = page.slice(0, limit);
    }

    const users = await Promise.all(
      pageLikes.map(async (like) => {
        const user = await ctx.db.get(like.userId);
        if (!user) return null;

        let isFollowing = false;
        if (userId) {
          const follow = await ctx.db
            .query("follows")
            .withIndex("by_follower_following", (q) =>
              q.eq("followerId", userId).eq("followingId", like.userId),
            )
            .first();
          isFollowing = follow?.status === "active";
        }

        return {
          ...user,
          likedAt: like.createdAt,
          isFollowing,
        };
      }),
    );

    return {
      users: users.filter((u): u is NonNullable<typeof u> => u !== null),
      nextCursor,
      totalCount: post.likeCount || 0,
    };
  },
});

/**
 * Get multiple posts' vote status in one query.
 */
export const getBulkLikeStatus = query({
  args: {
    postIds: v.array(v.id("posts")),
  },
  returns: v.array(
    v.object({
      postId: v.id("posts"),
      isLiked: v.boolean(),
      isDisliked: v.boolean(),
      likeCount: v.number(),
      dislikeCount: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const userId = (ctx as any).userId as Id<"users"> | undefined;

    const results = await Promise.all(
      args.postIds.map(async (postId) => {
        const post = await ctx.db.get(postId);
        if (!post) {
          return {
            postId,
            isLiked: false,
            isDisliked: false,
            likeCount: 0,
            dislikeCount: 0,
          };
        }

        let vote: UserVote = "none";
        if (userId) {
          const like = await ctx.db
            .query("likes")
            .withIndex("by_user_target", (q) =>
              q
                .eq("userId", userId)
                .eq("targetType", "post")
                .eq("targetId", postId),
            )
            .first();
          vote = currentPostVote(like ?? null);
        }

        return {
          postId,
          isLiked: vote === "up",
          isDisliked: vote === "down",
          likeCount: post.likeCount || 0,
          dislikeCount: post.dislikeCount || 0,
        };
      }),
    );

    return results;
  },
});

// ============================================
// SAVES - Bookmarked posts
// ============================================

/**
 * Save or unsave a post
 * Toggles the saved state
 */
export const savePost = mutation({
  args: {
    postId: v.id("posts"),
    userId: v.optional(v.id("users")),
  },
  returns: v.object({
    saved: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const userId =
      args.userId ?? ((ctx as any).userId as Id<"users"> | undefined);
    if (!userId) throw new Error("Unauthorized");
    await assertUserCanMutate(ctx, userId);

    // Check post exists and is published
    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error("Post not found");
    if (post.status !== "published") throw new Error("Post not available");

    if (String(post.userId) !== String(userId)) {
      if (await usersBlockedEitherWay(ctx, userId, post.userId)) {
        throw new Error("Interaction not allowed");
      }
    }

    // Check if already saved
    const existing = await ctx.db
      .query("savedPosts")
      .withIndex("by_user_post", (q) =>
        q.eq("userId", userId).eq("postId", args.postId),
      )
      .first();

    if (existing) {
      // Unsave: Delete the saved record
      await ctx.db.delete(existing._id);
      return { saved: false };
    } else {
      // Save: Create new saved record
      await ctx.db.insert("savedPosts", {
        userId,
        postId: args.postId,
        createdAt: Date.now(),
      });
      return { saved: true };
    }
  },
});

/**
 * Check if user has saved a post
 */
export const isPostSaved = query({
  args: {
    postId: v.id("posts"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const userId = (ctx as any).userId as Id<"users"> | undefined;
    if (!userId) return false;

    const saved = await ctx.db
      .query("savedPosts")
      .withIndex("by_user_post", (q) =>
        q.eq("userId", userId).eq("postId", args.postId),
      )
      .first();

    return !!saved;
  },
});

/**
 * Get multiple posts' save status in one query
 */
export const getBulkSaveStatus = query({
  args: {
    postIds: v.array(v.id("posts")),
  },
  returns: v.array(
    v.object({
      postId: v.id("posts"),
      isSaved: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const userId = (ctx as any).userId as Id<"users"> | undefined;

    const results = await Promise.all(
      args.postIds.map(async (postId) => {
        if (!userId) {
          return { postId, isSaved: false };
        }

        const saved = await ctx.db
          .query("savedPosts")
          .withIndex("by_user_post", (q) =>
            q.eq("userId", userId).eq("postId", postId),
          )
          .first();

        return {
          postId,
          isSaved: !!saved,
        };
      }),
    );

    return results;
  },
});

// ============================================
// INTERNALS - Batch operations
// ============================================

/**
 * Internal: Recalculate post like / dislike counts from `likes` rows.
 */
export const recalculatePostLikeCount = internalMutation({
  args: {
    postId: v.id("posts"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const rows = await ctx.db
      .query("likes")
      .withIndex("by_target", (q) =>
        q.eq("targetType", "post").eq("targetId", args.postId),
      )
      .collect();

    const up = rows.filter((l) => l.reaction !== "down").length;
    const down = rows.filter((l) => l.reaction === "down").length;

    await ctx.db.patch(args.postId, {
      likeCount: up,
      dislikeCount: down,
    });

    return null;
  },
});

/**
 * Internal: Recalculate post comment count
 * Use this if counts get out of sync
 */
export const recalculatePostCommentCount = internalMutation({
  args: {
    postId: v.id("posts"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();

    await ctx.db.patch(args.postId, {
      commentCount: comments.length,
    });

    return null;
  },
});

/**
 * Internal: Delete all likes for a post
 * Used when post is deleted
 */
export const deleteAllPostLikes = internalMutation({
  args: {
    postId: v.id("posts"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const likes = await ctx.db
      .query("likes")
      .withIndex("by_target", (q) =>
        q.eq("targetType", "post").eq("targetId", args.postId),
      )
      .collect();

    for (const like of likes) {
      await ctx.db.delete(like._id);
    }

    return null;
  },
});

/**
 * Internal: Delete all saves for a post
 * Used when post is deleted
 */
export const deleteAllPostSaves = internalMutation({
  args: {
    postId: v.id("posts"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const saves = await ctx.db
      .query("savedPosts")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();

    for (const save of saves) {
      await ctx.db.delete(save._id);
    }

    return null;
  },
});

// ============================================
// REPOSTS
// ============================================

/**
 * Toggle repost on a post. Returns server-truth state.
 * One repost per user per post; optional caption on create.
 */
export const toggleRepost = mutation({
  args: {
    postId: v.id("posts"),
    userId: v.optional(v.id("users")),
    caption: v.optional(v.string()),
  },
  returns: v.object({
    reposted: v.boolean(),
    repostCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const userId =
      args.userId ?? ((ctx as any).userId as Id<"users"> | undefined);
    if (!userId) throw new Error("Unauthorized");
    await assertUserCanMutate(ctx, userId);

    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error("Post not found");
    if (post.status !== "published") throw new Error("Post not available");

    if (String(post.userId) === String(userId)) {
      throw new Error("Cannot repost your own post");
    }

    if (await usersBlockedEitherWay(ctx, userId, post.userId)) {
      throw new Error("Interaction not allowed");
    }

    const existing = await ctx.db
      .query("reposts")
      .withIndex("by_user_post", (q) =>
        q.eq("userId", userId).eq("postId", args.postId),
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      const newCount = Math.max(0, (post.repostCount || 0) - 1);
      // Schedule the counter decrement via delta log — avoids hot-row OCC.
      await insertPostCounterDelta(ctx, args.postId, "repostCount", -1);
      return { reposted: false, repostCount: newCount };
    } else {
      await ctx.db.insert("reposts", {
        userId,
        postId: args.postId,
        caption: args.caption,
        createdAt: Date.now(),
      });
      const newCount = (post.repostCount || 0) + 1;
      // Schedule the counter increment via delta log — avoids hot-row OCC.
      await insertPostCounterDelta(ctx, args.postId, "repostCount", 1);
      return { reposted: true, repostCount: newCount };
    }
  },
});

/**
 * Check if current user has reposted a post.
 */
export const isPostReposted = query({
  args: {
    postId: v.id("posts"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const userId = (ctx as any).userId as Id<"users"> | undefined;
    if (!userId) return false;

    const existing = await ctx.db
      .query("reposts")
      .withIndex("by_user_post", (q) =>
        q.eq("userId", userId).eq("postId", args.postId),
      )
      .first();

    return Boolean(existing);
  },
});

/**
 * Fetch reposts by a specific user (profile "Reposts" tab).
 * Returns enriched post data for each repost, newest first.
 */
export const getUserReposts = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      repostId: v.string(),
      repostCaption: v.optional(v.string()),
      repostCreatedAt: v.number(),
      postId: v.id("posts"),
      post: v.any(),
    }),
  ),
  handler: async (ctx, args) => {
    const pageSize = args.limit ?? 30;
    const reposts = await ctx.db
      .query("reposts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(pageSize);

    const results: Array<{
      repostId: string;
      repostCaption?: string;
      repostCreatedAt: number;
      postId: Id<"posts">;
      post: any;
    }> = [];

    for (const r of reposts) {
      const post = await ctx.db.get(r.postId);
      if (!post || post.status !== "published") continue;

      const author = await ctx.db.get(post.userId);
      const media = await ctx.db
        .query("postMedia")
        .withIndex("by_post_position", (q) => q.eq("postId", r.postId))
        .collect();

      results.push({
        repostId: r._id,
        repostCaption: r.caption,
        repostCreatedAt: r.createdAt,
        postId: r.postId,
        post: {
          ...post,
          author: author
            ? {
                _id: author._id,
                username: author.username,
                fullName: author.fullName,
                profilePictureUrl: author.profilePictureUrl,
                profilePictureKey: (author as any).profilePictureKey,
                isVerified: (author as any).isVerified,
              }
            : null,
          media,
        },
      });
    }

    return results;
  },
});

/**
 * Internal: Delete all reposts for a post (when post is deleted).
 */
export const deleteAllPostReposts = internalMutation({
  args: {
    postId: v.id("posts"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const reposts = await ctx.db
      .query("reposts")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();

    for (const repost of reposts) {
      await ctx.db.delete(repost._id);
    }

    return null;
  },
});
