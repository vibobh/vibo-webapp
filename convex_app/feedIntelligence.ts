/**
 * Real-time feed intelligence: turns analytics events into post performance,
 * user preference shifts, session fatigue, and feed signal summaries.
 * Invoked from `analytics.insertOne` — does not replace tracking.ts / trackEvent.
 */

import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation, query } from "./_generated/server";
import { computePostDistributionStage } from "./feedSignals";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function normalizedWatchPct(p: Record<string, unknown>): number {
  const wt = Number(p.watch_time_ms);
  const len = Number(p.video_length_ms);
  if (Number.isFinite(len) && len > 0 && Number.isFinite(wt)) {
    return clamp(wt / len, 0, 1);
  }
  const raw = Number(p.watch_percentage);
  return Number.isFinite(raw) ? clamp(raw, 0, 1) : 0;
}

function normalizeCategoryMap(m: Record<string, number>): Record<string, number> {
  const keys = Object.keys(m);
  if (keys.length === 0) return {};
  const vals = keys.map((k) => m[k] ?? 0);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const span = maxV - minV;
  if (span < 1e-9) {
    if (keys.length === 1) return { [keys[0]]: 1 };
    const u = 1 / keys.length;
    const out: Record<string, number> = {};
    for (const k of keys) out[k] = u;
    return out;
  }
  const out: Record<string, number> = {};
  for (const k of keys) {
    out[k] = clamp((m[k]! - minV) / span, 0, 1);
  }
  return out;
}

async function getOrCreatePrefs(ctx: MutationCtx, userId: Id<"users">) {
  const existing = await ctx.db
    .query("userContentPreferences")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (existing) return existing;
  const now = Date.now();
  const id = await ctx.db.insert("userContentPreferences", {
    userId,
    categoryWeights: {},
    updatedAt: now,
  });
  const row = await ctx.db.get(id);
  if (!row) throw new Error("prefs insert failed");
  return row;
}

async function patchPrefsCategoryWeights(
  ctx: MutationCtx,
  userId: Id<"users">,
  mutator: (prev: Record<string, number>) => Record<string, number>,
) {
  const row = await getOrCreatePrefs(ctx, userId);
  const prev =
    (row.categoryWeights as Record<string, number> | undefined) ?? {};
  const next = normalizeCategoryMap(mutator({ ...prev }));
  await ctx.db.patch(row._id, {
    categoryWeights: next,
    updatedAt: Date.now(),
  });
}

async function adjustCategoriesFromPostHashtags(
  ctx: MutationCtx,
  postId: Id<"posts">,
  userId: Id<"users">,
  deltaPerTag: number,
) {
  const post = await ctx.db.get(postId);
  const tags = post?.hashtags ?? [];
  if (tags.length === 0) return;
  await patchPrefsCategoryWeights(ctx, userId, (prev) => {
    const next = { ...prev };
    for (const h of tags) {
      const k = h.toLowerCase().replace(/^#/, "").slice(0, 64);
      if (!k) continue;
      next[k] = clamp((next[k] ?? 0.5) + deltaPerTag, 0, 1);
    }
    return next;
  });
}

async function patchPrefsCreatorWeights(
  ctx: MutationCtx,
  userId: Id<"users">,
  mutator: (prev: Record<string, number>) => Record<string, number>,
) {
  const row = await getOrCreatePrefs(ctx, userId);
  const prev =
    (row.creatorWeights as Record<string, number> | undefined) ?? {};
  const next = normalizeCategoryMap(mutator({ ...prev }));
  await ctx.db.patch(row._id, {
    creatorWeights: next,
    updatedAt: Date.now(),
  });
}

async function patchPrefsContentTypeWeights(
  ctx: MutationCtx,
  userId: Id<"users">,
  mutator: (prev: Record<string, number>) => Record<string, number>,
) {
  const row = await getOrCreatePrefs(ctx, userId);
  const prev =
    (row.contentTypeWeights as Record<string, number> | undefined) ?? {};
  const next = normalizeCategoryMap(mutator({ ...prev }));
  await ctx.db.patch(row._id, {
    contentTypeWeights: next,
    updatedAt: Date.now(),
  });
}

async function patchSessionSignals(
  ctx: MutationCtx,
  userId: Id<"users">,
  mutator: (prev: Record<string, unknown>) => Record<string, unknown>,
) {
  const row = await getOrCreatePrefs(ctx, userId);
  const prev =
    (row.feedSessionSignals as Record<string, unknown> | undefined) ?? {};
  const next = mutator({ ...prev });
  await ctx.db.patch(row._id, {
    feedSessionSignals: next,
    updatedAt: Date.now(),
  });
}

const RECENT_RING = 10;

function ema(prev: number, next: number, alpha: number): number {
  if (!Number.isFinite(prev) || prev <= 0) return next;
  return prev * (1 - alpha) + next * alpha;
}

function pushRecentRing(arr: string[], value: string, max = RECENT_RING): string[] {
  const v = value.trim().slice(0, 64);
  if (!v) return arr;
  return [...arr, v].slice(-max);
}

async function ensureSessionFeedState(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"sessionFeedState">> {
  const existing = await ctx.db
    .query("sessionFeedState")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (existing) return existing;
  const now = Date.now();
  const id = await ctx.db.insert("sessionFeedState", {
    userId,
    startedAt: now,
    fastSkipsInRow: 0,
    totalSkips: 0,
    videosWatched: 0,
    postsViewed: 0,
    avgRecentWatchPercentage: 0,
    avgRecentViewDurationMs: 0,
    recentCategories: [],
    recentCreators: [],
    recentContentTypes: [],
    consecutiveVideoSkips: 0,
    consecutivePostSkips: 0,
    boredomLevel: "low",
    lastUpdatedAt: now,
  });
  const row = await ctx.db.get(id);
  if (!row) throw new Error("sessionFeedState insert failed");
  return row;
}

/** Real-time session row for ranking — updated from impression / watch / skip. */
export async function applySessionFeedStateFromEvent(
  ctx: MutationCtx,
  userId: Id<"users">,
  eventName: string,
  properties: Record<string, unknown>,
): Promise<void> {
  const postIdRaw = properties.post_id;
  const postId =
    typeof postIdRaw === "string" ? (postIdRaw as Id<"posts">) : null;

  const row = await ensureSessionFeedState(ctx, userId);
  const now = Date.now();

  if (
    eventName === "post_impression" &&
    properties.phase === "exit" &&
    postId
  ) {
    const post = await ctx.db.get(postId);
    if (!post || post.status !== "published") return;
    const stats = await ctx.db
      .query("postFeedStats")
      .withIndex("by_post", (q) => q.eq("postId", postId))
      .first();
    const kind = stats?.contentKind ?? "post";
    const vd = Number(properties.visible_duration_ms);
    const duration =
      Number.isFinite(vd) && vd >= 0 ? clamp(vd, 0, 180_000) : 0;
    const firstTag =
      post.hashtags?.[0]
        ?.toLowerCase()
        .replace(/^#/, "")
        .slice(0, 64) ?? "";
    await ctx.db.patch(row._id, {
      postsViewed: row.postsViewed + 1,
      avgRecentViewDurationMs: ema(row.avgRecentViewDurationMs, duration, 0.18),
      recentContentTypes: pushRecentRing(row.recentContentTypes, kind),
      recentCreators: pushRecentRing(row.recentCreators, String(post.userId)),
      recentCategories: firstTag
        ? pushRecentRing(row.recentCategories, firstTag)
        : row.recentCategories,
      lastUpdatedAt: now,
    });
    return;
  }

  if (eventName === "video_watch" && postId) {
    const pct = normalizedWatchPct(properties);
    await ctx.db.patch(row._id, {
      videosWatched: row.videosWatched + 1,
      avgRecentWatchPercentage: ema(
        row.avgRecentWatchPercentage,
        pct,
        0.28,
      ),
      lastUpdatedAt: now,
    });
    return;
  }

  if (eventName === "skip_post" && postId) {
    const post = await ctx.db.get(postId);
    if (!post || post.status !== "published") return;
    const stats = await ctx.db
      .query("postFeedStats")
      .withIndex("by_post", (q) => q.eq("postId", postId))
      .first();
    const kind =
      typeof properties.content_kind === "string" &&
      (properties.content_kind === "video" || properties.content_kind === "post")
        ? properties.content_kind
        : stats?.contentKind ?? "post";
    const t = Number(properties.time_to_skip_ms);
    const fast = Number.isFinite(t) && t < 1500;
    const fastSkipsInRow = fast ? row.fastSkipsInRow + 1 : 0;
    let boredom: "low" | "medium" | "high" = "low";
    if (fastSkipsInRow >= 4) boredom = "high";
    else if (fastSkipsInRow >= 3) boredom = "high";
    else if (fastSkipsInRow >= 2) boredom = "medium";
    let cv = row.consecutiveVideoSkips ?? 0;
    let cp = row.consecutivePostSkips ?? 0;
    if (fast) {
      if (kind === "video") {
        cv += 1;
        cp = 0;
      } else {
        cp += 1;
        cv = 0;
      }
    } else {
      cv = 0;
      cp = 0;
    }
    const firstTag =
      post.hashtags?.[0]
        ?.toLowerCase()
        .replace(/^#/, "")
        .slice(0, 64) ?? "";
    await ctx.db.patch(row._id, {
      totalSkips: row.totalSkips + 1,
      fastSkipsInRow,
      boredomLevel: boredom,
      consecutiveVideoSkips: cv,
      consecutivePostSkips: cp,
      recentContentTypes: pushRecentRing(row.recentContentTypes, kind),
      recentCreators: pushRecentRing(row.recentCreators, String(post.userId)),
      recentCategories: firstTag
        ? pushRecentRing(row.recentCategories, firstTag)
        : row.recentCategories,
      lastUpdatedAt: now,
    });
  }
}

async function ensurePostPerformance(
  ctx: MutationCtx,
  postId: Id<"posts">,
): Promise<Doc<"postPerformance">> {
  const existing = await ctx.db
    .query("postPerformance")
    .withIndex("by_post", (q) => q.eq("postId", postId))
    .first();
  if (existing) return existing;
  const post = await ctx.db.get(postId);
  if (!post) throw new Error("post not found");
  const now = Date.now();
  const id = await ctx.db.insert("postPerformance", {
    postId,
    authorId: post.userId,
    avgWatchPercentage: 0,
    avgViewDurationMs: 0,
    engagementRate: 0,
    skipRate: 0,
    totalViews: 0,
    explicitSkipCount: 0,
    completeCount: 0,
    distributionStage: "test",
    lastUpdatedAt: now,
  });
  const row = await ctx.db.get(id);
  if (!row) throw new Error("postPerformance insert failed");
  return row;
}

/**
 * Recompute derived fields from `postFeedStats` + local counters.
 */
export async function recomputePostPerformanceSnapshot(
  ctx: MutationCtx,
  postId: Id<"posts">,
): Promise<void> {
  const post = await ctx.db.get(postId);
  if (!post || post.status !== "published") return;

  const stats = await ctx.db
    .query("postFeedStats")
    .withIndex("by_post", (q) => q.eq("postId", postId))
    .first();
  const perf = await ensurePostPerformance(ctx, postId);

  const impressions = stats?.impressions ?? 0;
  const totalViews = impressions;
  const avgViewDurationMs =
    impressions > 0 ? (stats?.sumViewDurationMs ?? 0) / impressions : 0;
  const avgWatchPercentage =
    (stats?.watchSamples ?? 0) > 0
      ? clamp(
          (stats?.sumWatchPct ?? 0) / (stats?.watchSamples ?? 1),
          0,
          1,
        )
      : 0;

  const likes = post.likeCount ?? 0;
  const comments = post.commentCount ?? 0;
  const engagementRate = clamp(
    Math.log1p(likes + comments * 2) / Math.log1p(48),
    0,
    1,
  );

  const fast = stats?.fastSkips ?? 0;
  const explicitSkips = stats?.skipCount ?? 0;
  const skipRate =
    totalViews > 0
      ? clamp((explicitSkips + perf.explicitSkipCount * 0.5 + fast * 0.45) / totalViews, 0, 1)
      : 0;

  const distributionStage =
    stats && post
      ? computePostDistributionStage(stats, post)
      : "test";

  await ctx.db.patch(perf._id, {
    totalViews,
    avgViewDurationMs,
    avgWatchPercentage,
    engagementRate,
    skipRate,
    distributionStage,
    lastUpdatedAt: Date.now(),
  });
}

export async function touchPostPerformanceFromEvent(
  ctx: MutationCtx,
  eventName: string,
  properties: Record<string, unknown>,
  postId: Id<"posts">,
): Promise<void> {
  const post = await ctx.db.get(postId);
  if (!post || post.status !== "published") return;

  const perf = await ensurePostPerformance(ctx, postId);
  const now = Date.now();

  if (eventName === "skip_post") {
    await ctx.db.patch(perf._id, {
      explicitSkipCount: perf.explicitSkipCount + 1,
      lastUpdatedAt: now,
    });
    return;
  }

  if (eventName === "video_complete") {
    await ctx.db.patch(perf._id, {
      completeCount: perf.completeCount + 1,
      lastUpdatedAt: now,
    });
  }
}

/**
 * User-level preference + session updates (real-time).
 */
export async function applyUserFeedIntelligence(
  ctx: MutationCtx,
  userId: Id<"users">,
  eventName: string,
  properties: Record<string, unknown>,
): Promise<void> {
  const postIdRaw = properties.post_id;
  const postId =
    typeof postIdRaw === "string" ? (postIdRaw as Id<"posts">) : null;

  if (eventName === "video_watch") {
    const pct = normalizedWatchPct(properties);
    const cat =
      typeof properties.content_category === "string"
        ? properties.content_category.slice(0, 64)
        : "";
    if (pct > 0.6) {
      if (cat) {
        await patchPrefsCategoryWeights(ctx, userId, (prev) => {
          const next = { ...prev };
          next[cat] = clamp((next[cat] ?? 0.5) + 0.08 * (pct - 0.6), 0, 1);
          return next;
        });
      }
      if (postId) {
        await adjustCategoriesFromPostHashtags(ctx, postId, userId, 0.06);
      }
    }
  }

  if (eventName === "skip_post" && postId) {
    const post = await ctx.db.get(postId);
    const stats = await ctx.db
      .query("postFeedStats")
      .withIndex("by_post", (q) => q.eq("postId", postId))
      .first();
    const contentKind =
      typeof properties.content_kind === "string" &&
      (properties.content_kind === "video" || properties.content_kind === "post")
        ? properties.content_kind
        : stats?.contentKind ?? "post";

    const t = Number(properties.time_to_skip_ms);
    const strong = Number.isFinite(t) && t < 1500;
    const veryStrong = Number.isFinite(t) && t < 500;
    if (strong) {
      const delta = veryStrong ? -0.2 : -0.1;
      await adjustCategoriesFromPostHashtags(ctx, postId, userId, delta);
    }
    if (strong) {
      const creatorKey =
        typeof properties.creator_id === "string"
          ? properties.creator_id.slice(0, 40)
          : post
            ? String(post.userId)
            : "";
      if (creatorKey) {
        const pen = veryStrong ? -0.28 : -0.16;
        await patchPrefsCreatorWeights(ctx, userId, (prev) => {
          const next = { ...prev };
          next[creatorKey] = clamp((next[creatorKey] ?? 0.5) + pen, 0, 1);
          return next;
        });
      }
      await patchPrefsContentTypeWeights(ctx, userId, (prev) => {
        const next = { ...prev };
        const pen = veryStrong ? -0.22 : -0.12;
        next[contentKind] = clamp((next[contentKind] ?? 0.5) + pen, 0, 1);
        return next;
      });
    }
    if (strong) {
      await patchSessionSignals(ctx, userId, (prev) => {
        const streak = Number(prev.consecutiveFastSkips) || 0;
        const nextStreak = streak + 1;
        const boredUntil =
          nextStreak >= 3 ? Date.now() + 12 * 60_000 : Number(prev.boredUntil) || 0;
        return {
          ...prev,
          consecutiveFastSkips: nextStreak,
          boredUntil,
          sessionFatigue:
            nextStreak >= 3 ? "high" : nextStreak >= 1 ? "medium" : "low",
        };
      });
    } else {
      await patchSessionSignals(ctx, userId, (prev) => ({
        ...prev,
        consecutiveFastSkips: 0,
      }));
    }
  }

  if (
    eventName === "post_impression" &&
    properties.phase === "exit" &&
    typeof properties.visible_duration_ms === "number"
  ) {
    const vd = Number(properties.visible_duration_ms);
    if (Number.isFinite(vd) && vd >= 1500) {
      await patchSessionSignals(ctx, userId, (prev) => ({
        ...prev,
        consecutiveFastSkips: 0,
      }));
    }
  }

  if (eventName === "session_metrics_update") {
    const vw = Number(properties.videos_watched);
    const ap = Number(properties.avg_watch_percentage);
    const fs = Number(properties.fast_skips_count);
    await patchSessionSignals(ctx, userId, (prev) => ({
      ...prev,
      lastVideosWatched: Number.isFinite(vw) ? vw : prev.lastVideosWatched,
      lastAvgWatchPct: Number.isFinite(ap) ? ap : prev.lastAvgWatchPct,
      lastFastSkips: Number.isFinite(fs) ? fs : prev.lastFastSkips,
      ...(Number.isFinite(fs) && fs === 0 ? { consecutiveFastSkips: 0 } : {}),
    }));
  }

  if (eventName === "video_complete" && postId) {
    await adjustCategoriesFromPostHashtags(ctx, postId, userId, 0.07);
  }
}

/**
 * Internal mutation target for the per-post side of the intelligence pipeline.
 *
 * Per-post writes (`postPerformance`) are contended across all viewers of a
 * popular post. Running them inside the analytics ingest mutation forced the
 * whole batch to retry under contention. Scheduling moves the contention into
 * a tiny per-post mutation: 2 reads + 1 patch + recompute. Retries are scoped
 * and cheap; the outer analytics ingest commits on first try.
 *
 * If retries stay hot on viral posts, buffer deltas and roll up on a cron
 * instead of patching `postPerformance` directly from analytics (same pattern
 * as `postFeedStats` — see `applyPostFeedStatsTouch` in `feedSignals.ts`).
 */
export const applyPostPerformanceTouch = internalMutation({
  args: {
    postId: v.id("posts"),
    eventName: v.string(),
    properties: v.any(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const props = args.properties as Record<string, unknown>;
    try {
      if (
        args.eventName === "skip_post" ||
        args.eventName === "video_complete"
      ) {
        await touchPostPerformanceFromEvent(
          ctx,
          args.eventName,
          props,
          args.postId,
        );
      }
      const recomputeEvents = new Set([
        "post_impression",
        "video_watch",
        "video_complete",
        "skip_post",
      ]);
      if (recomputeEvents.has(args.eventName)) {
        await recomputePostPerformanceSnapshot(ctx, args.postId);
      }
    } catch {
      /* deleted post / race — non-fatal */
    }
    return null;
  },
});

/**
 * Called from analytics pipeline after user_events insert.
 *
 * Per-user writes (`sessionFeedState`, `userContentPreferences`) run inline —
 * each user only contends with their own client batches, which the batched
 * `trackEvents` handler coalesces in memory before this function is called.
 *
 * Per-post writes (`postPerformance`) are scheduled via
 * `internal.feedIntelligence.applyPostPerformanceTouch` so contention from
 * many viewers of the same post does not retry the analytics ingest mutation.
 */
export async function runFeedIntelligencePipeline(
  ctx: MutationCtx,
  eventName: string,
  properties: Record<string, unknown>,
  userId: Id<"users"> | undefined,
): Promise<void> {
  if (userId) {
    await applySessionFeedStateFromEvent(ctx, userId, eventName, properties);
    await applyUserFeedIntelligence(ctx, userId, eventName, properties);
  }
}

export const getFeedSignals = query({
  args: { userId: v.optional(v.id("users")) },
  returns: v.object({
    topCategories: v.array(v.string()),
    dislikedCategories: v.array(v.string()),
    preferredCreators: v.array(v.string()),
    preferredContentType: v.optional(
      v.union(v.literal("video"), v.literal("post")),
    ),
    sessionFatigue: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
    ),
    /** Canonical boredom from `sessionFeedState` (ranking). */
    boredomLevel: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
    ),
    boredUntil: v.optional(v.number()),
    distributionHints: v.optional(v.any()),
  }),
  handler: async (ctx, args) => {
    const uid =
      args.userId ?? ((ctx as any).userId as Id<"users"> | undefined);
    if (!uid) {
      return {
        topCategories: [],
        dislikedCategories: [],
        preferredCreators: [],
        sessionFatigue: "low" as const,
        boredomLevel: "low" as const,
      };
    }

    const prefs = await ctx.db
      .query("userContentPreferences")
      .withIndex("by_user", (q) => q.eq("userId", uid))
      .first();

    const sessionRow = await ctx.db
      .query("sessionFeedState")
      .withIndex("by_user", (q) => q.eq("userId", uid))
      .first();

    const cw = (prefs?.categoryWeights ?? {}) as Record<string, number>;
    const sorted = Object.entries(cw).sort((a, b) => b[1] - a[1]);
    const topCategories = sorted.slice(0, 8).map(([k]) => k);
    const dislikedCategories = sorted
      .filter(([, val]) => val < 0.22)
      .slice(0, 8)
      .map(([k]) => k);

    const cr = (prefs?.creatorWeights ?? {}) as Record<string, number>;
    const preferredCreators = Object.entries(cr)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([k]) => k);

    const ct = (prefs?.contentTypeWeights ?? {}) as Record<string, number>;
    const ctSorted = Object.entries(ct).sort((a, b) => b[1] - a[1]);
    const topCt = ctSorted[0]?.[0];
    let preferredContentType: "video" | "post" | undefined;
    if (topCt === "video" || topCt === "post") {
      preferredContentType = topCt;
    }

    const sess = (prefs?.feedSessionSignals ?? {}) as Record<string, unknown>;
    const fatigueRaw = sess.sessionFatigue;
    let sessionFatigue: "low" | "medium" | "high" = "low";
    if (
      fatigueRaw === "high" ||
      fatigueRaw === "medium" ||
      fatigueRaw === "low"
    ) {
      sessionFatigue = fatigueRaw;
    } else if (Number(sess.consecutiveFastSkips) >= 3) {
      sessionFatigue = "high";
    } else if (Number(sess.consecutiveFastSkips) >= 1) {
      sessionFatigue = "medium";
    }
    const boredUntil =
      typeof sess.boredUntil === "number" ? sess.boredUntil : undefined;

    const boredomLevel = sessionRow?.boredomLevel ?? sessionFatigue;

    return {
      topCategories,
      dislikedCategories,
      preferredCreators,
      preferredContentType,
      sessionFatigue,
      boredomLevel,
      boredUntil,
      distributionHints: {
        exploreBoost: boredomLevel === "high",
        suggestFreshCategories: boredomLevel === "high",
        injectDiversity: boredomLevel === "high",
        recentCategories: sessionRow?.recentCategories ?? [],
        recentCreators: sessionRow?.recentCreators ?? [],
      },
    };
  },
});
