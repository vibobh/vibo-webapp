import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";

export type PostDistributionStage =
  | "test"
  | "expand"
  | "accelerate"
  | "throttle"
  | "dead";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

async function ensurePostFeedStats(
  ctx: MutationCtx,
  postId: Id<"posts">,
): Promise<Doc<"postFeedStats">> {
  const existing = await ctx.db
    .query("postFeedStats")
    .withIndex("by_post", (q) => q.eq("postId", postId))
    .first();
  if (existing) return existing;

  const post = await ctx.db.get(postId);
  if (!post) {
    throw new Error("Post not found");
  }
  const firstMedia = await ctx.db
    .query("postMedia")
    .withIndex("by_post_position", (q) => q.eq("postId", postId))
    .first();
  const contentKind = firstMedia?.type === "video" ? "video" : "post";
  const now = Date.now();
  const id = await ctx.db.insert("postFeedStats", {
    postId,
    authorId: post.userId,
    contentKind,
    impressions: 0,
    sumViewDurationMs: 0,
    sumWatchMs: 0,
    watchSamples: 0,
    sumWatchPct: 0,
    fastSkips: 0,
    skipCount: 0,
    fastSkipCount: 0,
    veryFastSkipCount: 0,
    testImpressions: 0,
    distributionStage: "test",
    distributionMultiplier: 1,
    lastUpdated: now,
  });
  const row = await ctx.db.get(id);
  if (!row) throw new Error("postFeedStats insert failed");
  return row;
}

/**
 * Explicit lifecycle stages — drives distributionMultiplier (production feed).
 */
export function computePostDistributionStage(
  stats: Doc<"postFeedStats">,
  post: Doc<"posts">,
): PostDistributionStage {
  const im = stats.impressions;
  const sc = stats.skipCount ?? 0;
  const vf = stats.veryFastSkipCount ?? 0;
  const explicitSkipRate = sc / Math.max(im, 1);
  const avgPct =
    stats.watchSamples > 0
      ? clamp(stats.sumWatchPct / stats.watchSamples, 0, 1)
      : 0;
  const avgView = im > 0 ? stats.sumViewDurationMs / im : 0;
  const likes = post.likeCount ?? 0;
  const comments = post.commentCount ?? 0;
  const engSignal = Math.log1p(likes + comments * 2) / Math.log1p(64);

  if (im < 50) return "test";

  if (im < 200) {
    if (explicitSkipRate > 0.52 || vf > Math.max(8, im * 0.22)) return "dead";
    if (avgPct > 0.4 && explicitSkipRate < 0.34) return "expand";
    return "test";
  }

  if (explicitSkipRate > 0.55 || (avgPct < 0.12 && im > 100)) return "dead";
  if (
    avgPct > 0.46 &&
    explicitSkipRate < 0.3 &&
    engSignal > 0.32 &&
    im >= 220
  ) {
    return "accelerate";
  }
  if (avgPct > 0.36 && explicitSkipRate < 0.4) return "expand";
  if (explicitSkipRate > 0.36 && avgPct > 0.18 && avgPct < 0.46) {
    return "throttle";
  }
  if (explicitSkipRate > 0.48) return "throttle";
  return "expand";
}

export function multiplierForStage(stage: PostDistributionStage): number {
  switch (stage) {
    case "test":
      return 1;
    case "expand":
      return 1.14;
    case "accelerate":
      return 1.42;
    case "throttle":
      return 0.7;
    case "dead":
      return 0.2;
    default:
      return 1;
  }
}

/**
 * Recompute denormalized metrics + stage + multiplier after any stats touch.
 */
export async function recomputeAndPatchPostFeedStats(
  ctx: MutationCtx,
  postId: Id<"posts">,
): Promise<void> {
  const stats = await ctx.db
    .query("postFeedStats")
    .withIndex("by_post", (q) => q.eq("postId", postId))
    .first();
  if (!stats) return;
  const post = await ctx.db.get(postId);
  if (!post || post.status !== "published") return;

  const im = stats.impressions;
  const avgView = im > 0 ? stats.sumViewDurationMs / im : 0;
  const avgPct =
    stats.watchSamples > 0
      ? clamp(stats.sumWatchPct / stats.watchSamples, 0, 1)
      : 0;
  const sc = stats.skipCount ?? 0;
  const skipRate = im > 0 ? clamp((sc + stats.fastSkips * 0.45) / im, 0, 1) : 0;
  const completionRate = avgPct;
  const likes = post.likeCount ?? 0;
  const comments = post.commentCount ?? 0;
  const engagementRate = clamp(
    Math.log1p(likes + comments * 2) / Math.log1p(80),
    0,
    1,
  );

  const stage = computePostDistributionStage(stats, post);
  let mult = multiplierForStage(stage);
  if (stats.contentKind === "video") {
    if (avgPct > 0.55) mult *= 1.05;
    if (skipRate > 0.48) mult *= 0.9;
    if (avgView > 5200) mult *= 1.03;
  } else {
    if (avgView > 3800) mult *= 1.04;
    if (skipRate > 0.5) mult *= 0.91;
  }
  mult = clamp(mult, 0.15, 1.8);

  await ctx.db.patch(stats._id, {
    distributionStage: stage,
    distributionMultiplier: mult,
    avgWatchPct: avgPct,
    avgViewDurationMs: avgView,
    completionRate,
    skipRate,
    engagementRate,
    lastUpdated: Date.now(),
  });
}

/**
 * Updates `postFeedStats` from client analytics (same transaction as user_events).
 */
export async function touchPostFeedStatsFromAnalytics(
  ctx: MutationCtx,
  eventName: string,
  properties: Record<string, unknown>,
): Promise<void> {
  const postIdRaw = properties.post_id;
  if (typeof postIdRaw !== "string") return;
  const postId = postIdRaw as Id<"posts">;
  const post = await ctx.db.get(postId);
  if (!post || post.status !== "published") return;

  const stats = await ensurePostFeedStats(ctx, postId);
  const now = Date.now();

  if (
    eventName === "post_impression" &&
    properties.phase === "exit" &&
    typeof properties.visible_duration_ms === "number"
  ) {
    const vd = clamp(properties.visible_duration_ms, 0, 180_000);
    const nextImpressions = stats.impressions + 1;
    const isFastSkip =
      stats.contentKind === "video" ? vd < 1500 && vd >= 0 : vd < 900;
    const nextFast = stats.fastSkips + (isFastSkip ? 1 : 0);
    const nextSumView = stats.sumViewDurationMs + vd;
    const ageMs = now - post.createdAt;
    const inTestPool = ageMs < 72 * 3600_000 && nextImpressions <= 220;
    await ctx.db.patch(stats._id, {
      impressions: nextImpressions,
      sumViewDurationMs: nextSumView,
      fastSkips: nextFast,
      testImpressions: inTestPool
        ? stats.testImpressions + 1
        : stats.testImpressions,
      lastUpdated: now,
    });
    await recomputeAndPatchPostFeedStats(ctx, postId);
    return;
  }

  if (eventName === "video_watch") {
    const wt =
      typeof properties.watch_time_ms === "number"
        ? clamp(properties.watch_time_ms, 0, 600_000)
        : 0;
    const len =
      typeof properties.video_length_ms === "number"
        ? clamp(properties.video_length_ms, 1, 3_600_000)
        : 0;
    let pct =
      typeof properties.watch_percentage === "number"
        ? clamp(properties.watch_percentage, 0, 1)
        : 0;
    if (len > 0 && wt >= 0) {
      pct = clamp(wt / len, 0, 1);
    }
    await ctx.db.patch(stats._id, {
      sumWatchMs: stats.sumWatchMs + wt,
      watchSamples: stats.watchSamples + 1,
      sumWatchPct: stats.sumWatchPct + pct,
      lastUpdated: now,
    });
    await recomputeAndPatchPostFeedStats(ctx, postId);
    return;
  }

  if (eventName === "video_complete") {
    const len =
      typeof properties.video_length_ms === "number"
        ? clamp(properties.video_length_ms, 0, 600_000)
        : 0;
    await ctx.db.patch(stats._id, {
      sumWatchMs: stats.sumWatchMs + len,
      watchSamples: stats.watchSamples + 1,
      sumWatchPct: stats.sumWatchPct + 1,
      lastUpdated: now,
    });
    await recomputeAndPatchPostFeedStats(ctx, postId);
    return;
  }

  if (eventName === "skip_post") {
    const t =
      typeof properties.time_to_skip_ms === "number"
        ? properties.time_to_skip_ms
        : 999_999;
    const skipCount = (stats.skipCount ?? 0) + 1;
    let fastSkipCount = stats.fastSkipCount ?? 0;
    let veryFastSkipCount = stats.veryFastSkipCount ?? 0;
    if (t < 1500) fastSkipCount += 1;
    if (t < 500) veryFastSkipCount += 1;
    let nextFast = stats.fastSkips;
    if (t < 1500) nextFast += 1;

    await ctx.db.patch(stats._id, {
      skipCount,
      fastSkipCount,
      veryFastSkipCount,
      fastSkips: nextFast,
      lastUpdated: now,
    });
    await recomputeAndPatchPostFeedStats(ctx, postId);
  }
}

/**
 * Internal mutation target for `ctx.scheduler.runAfter(0, ...)`.
 *
 * Why scheduled instead of inline?
 *   `postFeedStats` is a *per-post* row touched by every viewer of that post.
 *   Calling `touchPostFeedStatsFromAnalytics` inline inside the analytics
 *   ingest mutation meant a single popular video could fan ~50 viewers'
 *   trackEvent batches into 50 concurrent patches on one row, with
 *   the *outer* analytics mutation (which also writes per-user docs +
 *   userEvents inserts) inheriting the OCC retries. Each retry replayed
 *   *all* of the analytics work, not just the contended patch.
 *
 *   Scheduling gives each per-post patch its own tiny mutation. OCC retries
 *   are isolated to the small post-stats patch (~2 reads + 2 writes), the
 *   analytics ingest mutation always commits cleanly on first try, and per-
 *   batch latency drops because the batched writes don't fight the hot row.
 *
 *   **If** `applyPostFeedStatsTouch` retries stay high for viral posts, the
 *   next step is append-only `postFeedStatsDelta` + cron rollup (1–2 min)
 *   into this row so analytics never patches the hot document directly.
 */
export const applyPostFeedStatsTouch = internalMutation({
  args: {
    postId: v.id("posts"),
    eventName: v.string(),
    properties: v.any(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      await touchPostFeedStatsFromAnalytics(
        ctx,
        args.eventName,
        args.properties as Record<string, unknown>,
      );
    } catch {
      /* invalid post_id / race / deleted post — non-fatal */
    }
    return null;
  },
});
