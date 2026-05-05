/**
 * Internal queries and mutations for the content moderation pipeline.
 * Runs in the Convex runtime (not Node.js) — pure DB operations.
 */

import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

// ---------------------------------------------------------------------------
// Internal Queries
// ---------------------------------------------------------------------------

export const getPost = internalQuery({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.postId);
  },
});

export const getPostMedia = internalQuery({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("postMedia")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();
  },
});

export const findHashByUser = internalQuery({
  args: {
    userId: v.id("users"),
    hash: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contentHashes")
      .withIndex("by_user_hash", (q) =>
        q.eq("userId", args.userId).eq("hash", args.hash),
      )
      .collect();
  },
});

export const getUserPostRate = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("userPostRateLimit")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!row) return { count: 0, timestamps: [] as number[] };
    const cutoff = Date.now() - 3600_000;
    const recent = row.recentTimestamps.filter((t) => t > cutoff);
    return { count: recent.length, timestamps: recent };
  },
});

export const getRecentCaptions = internalQuery({
  args: {
    userId: v.id("users"),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_user_created", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(args.limit);
    return posts
      .filter((p) => p.caption?.trim())
      .map((p) => p.caption as string);
  },
});

/** Count open (pending/under_review) reports on a target. */
export const countOpenReports = internalQuery({
  args: {
    targetType: v.union(
      v.literal("post"),
      v.literal("user"),
      v.literal("comment"),
    ),
    targetId: v.string(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("reports")
      .withIndex("by_target", (q) =>
        q.eq("targetType", args.targetType).eq("targetId", args.targetId),
      )
      .collect();
    return rows.filter(
      (r) => r.status === "pending" || r.status === "under_review",
    ).length;
  },
});

/** Load moderation config (or return defaults). */
export const getModerationConfig = internalQuery({
  args: { key: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const k = args.key ?? "default";
    const row = await ctx.db
      .query("moderationConfig")
      .withIndex("by_key", (q) => q.eq("key", k))
      .first();
    if (row) {
      return {
        nudityBlock: row.nudityBlock,
        violenceSensitive: row.violenceSensitive,
        hateBlock: row.hateBlock,
        spamFlag: row.spamFlag,
        ratePostsPerHour: row.ratePostsPerHour,
        preModThrottle: row.preModThrottle,
      };
    }
    return {
      nudityBlock: 0.9,
      violenceSensitive: 0.8,
      hateBlock: 0.9,
      spamFlag: 0.85,
      ratePostsPerHour: 10,
      preModThrottle: 0.2,
    };
  },
});

/**
 * Cross-user hash lookup: how many distinct users posted this hash recently?
 * Used for coordinated spam detection.
 */
export const countGlobalHashUploads = internalQuery({
  args: { hash: v.string() },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - 24 * 3600_000;
    const rows = await ctx.db
      .query("globalContentHashes")
      .withIndex("by_hash", (q) => q.eq("hash", args.hash).gte("createdAt", cutoff))
      .take(50);
    const uniqueUsers = new Set(rows.map((r) => String(r.userId)));
    return { count: rows.length, uniqueUsers: uniqueUsers.size };
  },
});

/**
 * Burst detection: count posts by user in last N minutes.
 */
export const getUserBurstRate = internalQuery({
  args: { userId: v.id("users"), windowMinutes: v.number() },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - args.windowMinutes * 60_000;
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_user_created", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(50);
    const recent = posts.filter((p) => p.createdAt > cutoff);
    return { count: recent.length };
  },
});

/**
 * Get reporter trust info for weighted report scoring.
 */
export const getReporterInfo = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return { trusted: false, accountAgeDays: 0, strikeCount: 0 };
    const ageDays = (Date.now() - user.createdAt) / (24 * 3600_000);
    const isStaff = user.staffRole === "admin" || user.staffRole === "moderator";
    const followerCount = user.followerCount ?? 0;
    return {
      trusted: isStaff || (ageDays > 30 && followerCount > 10),
      accountAgeDays: ageDays,
      strikeCount: user.strikeCount ?? 0,
      isRecent: ageDays < 7,
    };
  },
});

/**
 * User-level moderation profile used by video sampling.
 * New or previously struck users get stricter sampling; established low-risk
 * users can use lighter sampling while still staying fail-closed.
 */
export const getUserModerationTrust = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return { tier: "strict" as const, accountAgeDays: 0, strikeCount: 0 };
    const accountAgeDays = (Date.now() - user.createdAt) / (24 * 3600_000);
    const strikeCount = user.strikeCount ?? 0;
    const isStaff = user.staffRole === "admin" || user.staffRole === "moderator";
    if (strikeCount > 0 || user.accountModerationStatus === "suspended") {
      return { tier: "aggressive" as const, accountAgeDays, strikeCount };
    }
    if (accountAgeDays < 7) {
      return { tier: "strict" as const, accountAgeDays, strikeCount };
    }
    if (isStaff || (accountAgeDays > 45 && (user.followerCount ?? 0) > 25)) {
      return { tier: "trusted" as const, accountAgeDays, strikeCount };
    }
    return { tier: "standard" as const, accountAgeDays, strikeCount };
  },
});

// ---------------------------------------------------------------------------
// Internal Mutations
// ---------------------------------------------------------------------------

export const storeModerationResult = internalMutation({
  args: {
    postId: v.id("posts"),
    provider: v.string(),
    nudity: v.number(),
    sexual: v.number(),
    suggestive: v.number(),
    violence: v.number(),
    hate: v.number(),
    spam: v.number(),
    safe: v.number(),
    decision: v.union(
      v.literal("allow"),
      v.literal("block"),
      v.literal("flag_sensitive"),
      v.literal("flag_spam"),
    ),
    reason: v.string(),
    durationMs: v.number(),
    trigger: v.union(v.literal("publish"), v.literal("report")),
    primaryCategory: v.optional(v.string()),
    evidenceJson: v.optional(v.string()),
    severity: v.optional(v.string()),
    confidence: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("postModerationScores", {
      postId: args.postId,
      provider: args.provider,
      nudity: args.nudity,
      sexual: args.sexual,
      suggestive: args.suggestive,
      violence: args.violence,
      hate: args.hate,
      spam: args.spam,
      safe: args.safe,
      decision: args.decision,
      reason: args.reason,
      durationMs: args.durationMs,
      trigger: args.trigger,
      createdAt: Date.now(),
      primaryCategory: args.primaryCategory,
      evidenceJson: args.evidenceJson,
      severity: args.severity,
      confidence: args.confidence,
    });
  },
});

export const applyModerationDecision = internalMutation({
  args: {
    postId: v.id("posts"),
    moderationStatus: v.union(
      v.literal("active"),
      v.literal("flagged"),
      v.literal("restricted"),
      v.literal("removed"),
    ),
    moderationVisibilityStatus: v.union(
      v.literal("public"),
      v.literal("hidden"),
      v.literal("shadow_hidden"),
    ),
    moderationReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post) return;
    await ctx.db.patch(args.postId, {
      moderationStatus: args.moderationStatus,
      moderationVisibilityStatus: args.moderationVisibilityStatus,
      moderationReason: args.moderationReason,
      moderationChecked: true,
      updatedAt: Date.now(),
    });
  },
});

export const storeContentHash = internalMutation({
  args: {
    userId: v.id("users"),
    postId: v.id("posts"),
    hash: v.string(),
    hashType: v.union(
      v.literal("media"),
      v.literal("caption"),
      v.literal("bundle"),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("contentHashes", {
      userId: args.userId,
      postId: args.postId,
      hash: args.hash,
      hashType: args.hashType,
      createdAt: Date.now(),
    });
    if (args.hashType !== "bundle") {
      await ctx.db.insert("globalContentHashes", {
        hash: args.hash,
        hashType: args.hashType,
        userId: args.userId,
        postId: args.postId,
        createdAt: Date.now(),
      });
    }
  },
});

/** Published posts by this user with the same full-post bundle fingerprint. */
export const countPublishedBundleDuplicatesForUser = internalQuery({
  args: {
    userId: v.id("users"),
    bundleHash: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("contentHashes")
      .withIndex("by_user_hash", (q) =>
        q.eq("userId", args.userId).eq("hash", args.bundleHash),
      )
      .collect();
    let n = 0;
    for (const row of rows) {
      if (row.hashType !== "bundle") continue;
      const post = await ctx.db.get(row.postId);
      if (!post) continue;
      if (post.userId !== args.userId) continue;
      if (post.status === "published") n++;
    }
    return n;
  },
});

export const updateUserPostRate = internalMutation({
  args: {
    userId: v.id("users"),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userPostRateLimit")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    const cutoff = Date.now() - 3600_000;
    if (existing) {
      const recent = existing.recentTimestamps.filter((t) => t > cutoff);
      recent.push(args.timestamp);
      await ctx.db.patch(existing._id, {
        recentTimestamps: recent,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userPostRateLimit", {
        userId: args.userId,
        recentTimestamps: [args.timestamp],
        updatedAt: Date.now(),
      });
    }
  },
});

/** Structured moderation audit event. */
export const logModerationEvent = internalMutation({
  args: {
    eventType: v.string(),
    postId: v.optional(v.id("posts")),
    userId: v.optional(v.id("users")),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("moderationEvents", {
      eventType: args.eventType,
      postId: args.postId,
      userId: args.userId,
      payload: args.payload,
      createdAt: Date.now(),
    });
  },
});

/** Upsert moderation config (admin tooling). */
export const upsertModerationConfig = internalMutation({
  args: {
    key: v.string(),
    nudityBlock: v.number(),
    violenceSensitive: v.number(),
    hateBlock: v.number(),
    spamFlag: v.number(),
    ratePostsPerHour: v.number(),
    preModThrottle: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("moderationConfig")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
    } else {
      await ctx.db.insert("moderationConfig", { ...args, updatedAt: now });
    }
  },
});
