import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation } from "./_generated/server";
import { insertPostCounterDelta } from "./postCounterDeltas";

const VIEW_COOLDOWN_MS = 30 * 60 * 1000;

export type ProductEventType =
  | "view_post"
  | "view_video"
  | "like_post"
  | "comment_post"
  | "share_post"
  | "profile_view";

function resolveUserId(
  ctx: MutationCtx,
  explicit: Id<"users"> | undefined,
): Id<"users"> | undefined {
  return explicit ?? (ctx as { userId?: Id<"users"> }).userId;
}

async function postHasVideoMedia(
  ctx: MutationCtx,
  postId: Id<"posts">,
): Promise<boolean> {
  const media = await ctx.db
    .query("postMedia")
    .withIndex("by_post", (q) => q.eq("postId", postId))
    .collect();
  return media.some((m) => m.type === "video");
}

/**
 * Returns true if a new qualified view was counted (event + post.viewsCount + author totals).
 */
export async function commitPostViewIfAllowed(
  ctx: MutationCtx,
  viewerId: Id<"users">,
  postId: Id<"posts">,
  sessionId: string,
  eventType: "view_post" | "view_video",
  metadata?: Record<string, unknown>,
): Promise<boolean> {
  const post = await ctx.db.get(postId);
  if (!post || post.status !== "published") return false;
  if (String(post.userId) === String(viewerId)) return false;

  const dedupe = await ctx.db
    .query("productViewDedupe")
    .withIndex("by_viewer_post", (q) =>
      q.eq("viewerId", viewerId).eq("postId", postId),
    )
    .first();

  const now = Date.now();
  if (dedupe) {
    if (dedupe.sessionId === sessionId) return false;
    if (now - dedupe.lastCountedAt < VIEW_COOLDOWN_MS) return false;
    await ctx.db.patch(dedupe._id, { sessionId, lastCountedAt: now });
  } else {
    await ctx.db.insert("productViewDedupe", {
      viewerId,
      postId,
      sessionId,
      lastCountedAt: now,
    });
  }

  await ctx.db.insert("productEvents", {
    userId: viewerId,
    type: eventType,
    targetId: String(postId),
    metadata: metadata ?? undefined,
    createdAt: now,
  });

  // Route through delta log — avoids OCC on the hot `posts` row when many
  // viewers qualify simultaneously (viral posts).
  await insertPostCounterDelta(ctx, postId, "viewsCount", 1);

  const collabRows = await ctx.db
    .query("postCollaborators")
    .withIndex("by_post", (q) => q.eq("postId", postId))
    .collect();
  for (const row of collabRows) {
    if (row.status !== "accepted") continue;
    await ctx.db.patch(row._id, {
      attributedQualifiedViews: (row.attributedQualifiedViews ?? 0) + 1,
      updatedAt: now,
    });
  }

  const author = await ctx.db.get(post.userId);
  if (author) {
    if (eventType === "view_video") {
      await ctx.db.patch(post.userId, {
        totalVideoViews: (author.totalVideoViews ?? 0) + 1,
      });
    } else {
      await ctx.db.patch(post.userId, {
        totalPostViews: (author.totalPostViews ?? 0) + 1,
      });
    }
  }

  return true;
}

export async function insertLikePostProductEvent(
  ctx: MutationCtx,
  userId: Id<"users">,
  postId: Id<"posts">,
) {
  await ctx.db.insert("productEvents", {
    userId,
    type: "like_post",
    targetId: String(postId),
    createdAt: Date.now(),
  });
}

export async function insertCommentPostProductEvent(
  ctx: MutationCtx,
  userId: Id<"users">,
  postId: Id<"posts">,
  commentId: Id<"comments">,
) {
  await ctx.db.insert("productEvents", {
    userId,
    type: "comment_post",
    targetId: String(postId),
    metadata: { commentId: String(commentId) },
    createdAt: Date.now(),
  });
}

/** Image / non-video posts: visible ≥50% for 500ms (client); server enforces video exclusion. */
export const recordQualifiedViewPost = mutation({
  args: {
    postId: v.id("posts"),
    sessionId: v.string(),
    userId: v.optional(v.id("users")),
    source: v.optional(v.string()),
  },
  returns: v.object({ recorded: v.boolean() }),
  handler: async (ctx, args) => {
    const userId = resolveUserId(ctx, args.userId);
    if (!userId) return { recorded: false };
    if (await postHasVideoMedia(ctx, args.postId)) {
      return { recorded: false };
    }
    const ok = await commitPostViewIfAllowed(
      ctx,
      userId,
      args.postId,
      args.sessionId,
      "view_post",
      args.source ? { source: args.source.slice(0, 64) } : undefined,
    );
    return { recorded: ok };
  },
});

/** Video: client must only call after ≥1s played OR ≥30% watched. */
export const recordQualifiedViewVideo = mutation({
  args: {
    postId: v.id("posts"),
    sessionId: v.string(),
    playedMs: v.number(),
    watchPct: v.number(),
    userId: v.optional(v.id("users")),
    source: v.optional(v.string()),
  },
  returns: v.object({ recorded: v.boolean() }),
  handler: async (ctx, args) => {
    const userId = resolveUserId(ctx, args.userId);
    if (!userId) return { recorded: false };
    const played = Math.max(0, args.playedMs);
    const pct = Math.max(0, Math.min(1, args.watchPct));
    if (played < 1000 && pct < 0.3) return { recorded: false };
    if (!(await postHasVideoMedia(ctx, args.postId))) {
      return { recorded: false };
    }
    const ok = await commitPostViewIfAllowed(
      ctx,
      userId,
      args.postId,
      args.sessionId,
      "view_video",
      {
        playedMs: Math.round(played),
        watchPct: pct,
        ...(args.source ? { source: args.source.slice(0, 64) } : {}),
      },
    );
    return { recorded: ok };
  },
});

const shareMethodValidator = v.union(
  v.literal("copy_link"),
  v.literal("whatsapp"),
  v.literal("dm"),
  v.literal("story"),
  v.literal("system"),
  v.literal("other"),
);

export const recordSharePost = mutation({
  args: {
    postId: v.id("posts"),
    sessionId: v.string(),
    method: shareMethodValidator,
    userId: v.optional(v.id("users")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = resolveUserId(ctx, args.userId);
    if (!userId) return null;
    const post = await ctx.db.get(args.postId);
    if (!post || post.status !== "published") return null;

    const now = Date.now();
    await ctx.db.insert("productEvents", {
      userId,
      type: "share_post",
      targetId: String(args.postId),
      metadata: {
        method: args.method,
        sessionId: args.sessionId.slice(0, 80),
      },
      createdAt: now,
    });
    // Route through delta log — avoids OCC on the hot `posts` row.
    await insertPostCounterDelta(ctx, args.postId, "sharesCount", 1);
    return null;
  },
});

export const recordProfileView = mutation({
  args: {
    profileUserId: v.id("users"),
    sessionId: v.string(),
    viewerUserId: v.optional(v.id("users")),
  },
  returns: v.object({ recorded: v.boolean() }),
  handler: async (ctx, args) => {
    const viewerId = resolveUserId(ctx, args.viewerUserId);
    if (!viewerId) return { recorded: false };
    if (String(viewerId) === String(args.profileUserId)) {
      return { recorded: false };
    }

    const profile = await ctx.db.get(args.profileUserId);
    if (!profile) return { recorded: false };

    const dedupe = await ctx.db
      .query("productProfileViewDedupe")
      .withIndex("by_viewer_profile", (q) =>
        q.eq("viewerId", viewerId).eq("profileUserId", args.profileUserId),
      )
      .first();

    const now = Date.now();
    if (dedupe) {
      if (dedupe.sessionId === args.sessionId) return { recorded: false };
      if (now - dedupe.lastCountedAt < VIEW_COOLDOWN_MS) return { recorded: false };
      await ctx.db.patch(dedupe._id, {
        sessionId: args.sessionId,
        lastCountedAt: now,
      });
    } else {
      await ctx.db.insert("productProfileViewDedupe", {
        viewerId,
        profileUserId: args.profileUserId,
        sessionId: args.sessionId,
        lastCountedAt: now,
      });
    }

    await ctx.db.insert("productEvents", {
      userId: viewerId,
      type: "profile_view",
      targetId: String(args.profileUserId),
      createdAt: now,
    });

    await ctx.db.patch(args.profileUserId, {
      profileViewsCount: (profile.profileViewsCount ?? 0) + 1,
    });

    return { recorded: true };
  },
});
