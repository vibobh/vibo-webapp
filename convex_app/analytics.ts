import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation } from "./_generated/server";
import { runFeedIntelligencePipeline } from "./feedIntelligence";

const MAX_BATCH = 25;
const MAX_EVENT_NAME_LEN = 80;
const MAX_PROPERTIES_JSON_CHARS = 12_000;

function resolveUserId(
  ctx: MutationCtx,
  explicit: Id<"users"> | undefined,
): Id<"users"> | undefined {
  if (explicit) return explicit;
  return (ctx as { userId?: Id<"users"> }).userId;
}

function jsonSize(value: unknown): number {
  try {
    return JSON.stringify(value ?? null).length;
  } catch {
    return MAX_PROPERTIES_JSON_CHARS + 1;
  }
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
    out[k] = Math.max(0, Math.min(1, ((m[k] ?? 0) - minV) / span));
  }
  return out;
}

async function upsertEngagement(
  ctx: MutationCtx,
  userId: Id<"users">,
  patch: {
    videoWatchMsDelta?: number;
    impressionDelta?: number;
    likesDelta?: number;
  },
) {
  const now = Date.now();
  const existing = await ctx.db
    .query("userEngagementScores")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();

  const videoWatchMsTotal =
    (existing?.videoWatchMsTotal ?? 0) + (patch.videoWatchMsDelta ?? 0);
  const postImpressions =
    (existing?.postImpressions ?? 0) + (patch.impressionDelta ?? 0);
  const likesGiven = Math.max(
    0,
    (existing?.likesGiven ?? 0) + (patch.likesDelta ?? 0),
  );

  if (existing) {
    await ctx.db.patch(existing._id, {
      videoWatchMsTotal,
      postImpressions,
      likesGiven,
      lastActiveAt: now,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("userEngagementScores", {
      userId,
      videoWatchMsTotal: patch.videoWatchMsDelta ? videoWatchMsTotal : 0,
      postImpressions: patch.impressionDelta ? postImpressions : 0,
      likesGiven: patch.likesDelta ? likesGiven : 0,
      lastActiveAt: now,
      updatedAt: now,
    });
  }
}

async function mergeCreatorWeights(
  ctx: MutationCtx,
  userId: Id<"users">,
  creatorId: string,
  weightDelta: number,
) {
  if (!creatorId || weightDelta === 0) return;
  const now = Date.now();
  const existing = await ctx.db
    .query("userContentPreferences")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();

  const prev =
    (existing?.creatorWeights as Record<string, number> | undefined) ?? {};
  const next = {
    ...prev,
    [creatorId]: Math.max(0, (prev[creatorId] ?? 0) + weightDelta),
  };

  if (existing) {
    await ctx.db.patch(existing._id, {
      creatorWeights: next,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("userContentPreferences", {
      userId,
      categoryWeights: {},
      creatorWeights: next,
      updatedAt: now,
    });
  }
}

async function mergeContentTypeWeights(
  ctx: MutationCtx,
  userId: Id<"users">,
  kind: "video" | "post",
  weightDelta: number,
) {
  if (weightDelta === 0) return;
  const now = Date.now();
  const existing = await ctx.db
    .query("userContentPreferences")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();

  const prev =
    (existing?.contentTypeWeights as Record<string, number> | undefined) ??
    {};
  const key = kind;
  const next = {
    ...prev,
    [key]: Math.max(0, (prev[key] ?? 0) + weightDelta),
  };

  if (existing) {
    await ctx.db.patch(existing._id, {
      contentTypeWeights: next,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("userContentPreferences", {
      userId,
      categoryWeights: {},
      contentTypeWeights: next,
      updatedAt: now,
    });
  }
}

async function mergeCategoryWeights(
  ctx: MutationCtx,
  userId: Id<"users">,
  category: string,
  weightDelta: number,
) {
  if (!category || weightDelta === 0) return;
  const now = Date.now();
  const existing = await ctx.db
    .query("userContentPreferences")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();

  const prev =
    (existing?.categoryWeights as Record<string, number> | undefined) ?? {};
  const merged = {
    ...prev,
    [category]: (prev[category] ?? 0) + weightDelta,
  };
  const next =
    Object.keys(prev).length === 0 && weightDelta < 0
      ? { [category]: 0.12 }
      : normalizeCategoryMap(merged);

  if (existing) {
    await ctx.db.patch(existing._id, {
      categoryWeights: next,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("userContentPreferences", {
      userId,
      categoryWeights: next,
      updatedAt: now,
    });
  }
}

/**
 * Cross-event aggregator for a single batch.
 *
 * Why: the per-batch `userEngagementScores` row was previously read+patched
 * once per event in the batch (up to 25 read+patch cycles on one row inside
 * one transaction — and worse, multiple concurrent batches from the same
 * client overlapped), which dominated OCC retry pressure on the analytics
 * mutation. The same applies to the three `userContentPreferences` map
 * fields (creator/category/contentType weights).
 *
 * The accumulator collects deltas in memory while iterating events, and the
 * batch handler flushes them with a single read + single patch per row.
 *
 * Note: per-event side effects that depend on the in-DB state at *that*
 * event time (EMA-style updates in `sessionFeedState` / `userContent-
 * Preferences.feedSessionSignals`, and the per-post `postFeedStats` /
 * `postPerformance` recomputes) are NOT coalesced here — they're either run
 * inline (per-user, no cross-user contention) or scheduled to a separate
 * tiny mutation (per-post, contended with other viewers).
 */
type BatchAggregator = {
  engagement: {
    videoWatchMsDelta: number;
    impressionDelta: number;
    likesDelta: number;
    touched: boolean;
  };
  creatorWeightDeltas: Map<string, number>;
  categoryWeightDeltas: Map<string, number>;
  contentTypeWeightDeltas: Map<string, number>;
};

function makeBatchAggregator(): BatchAggregator {
  return {
    engagement: {
      videoWatchMsDelta: 0,
      impressionDelta: 0,
      likesDelta: 0,
      touched: false,
    },
    creatorWeightDeltas: new Map(),
    categoryWeightDeltas: new Map(),
    contentTypeWeightDeltas: new Map(),
  };
}

function bumpMap(
  map: Map<string, number>,
  key: string | undefined,
  delta: number,
): void {
  if (!key || delta === 0) return;
  map.set(key, (map.get(key) ?? 0) + delta);
}

/**
 * Apply per-event signals into the in-memory accumulator. Does NOT touch the
 * DB. Returns whether the event meaningfully contributed (used to skip
 * empty-effect events from aggregator flush + scheduled work).
 */
function accumulateAggregates(
  agg: BatchAggregator,
  eventName: string,
  properties: unknown,
): void {
  const p = properties as Record<string, unknown> | null;

  switch (eventName) {
    case "post_impression": {
      const phase = typeof p?.phase === "string" ? p.phase : undefined;
      if (phase === "exit" || typeof p?.visible_duration_ms === "number") {
        agg.engagement.impressionDelta += 1;
        agg.engagement.touched = true;
      }
      break;
    }
    case "like_post": {
      agg.engagement.likesDelta += 1;
      agg.engagement.touched = true;
      const cr =
        typeof p?.creator_id === "string" ? p.creator_id.slice(0, 40) : "";
      bumpMap(agg.creatorWeightDeltas, cr, 2.8);
      break;
    }
    case "unlike_post": {
      agg.engagement.likesDelta -= 1;
      agg.engagement.touched = true;
      break;
    }
    case "video_watch": {
      const ms =
        typeof p?.watch_time_ms === "number" && Number.isFinite(p.watch_time_ms)
          ? Math.max(0, Math.min(p.watch_time_ms, 3_600_000))
          : 0;
      if (ms <= 0) break;
      agg.engagement.videoWatchMsDelta += ms;
      agg.engagement.touched = true;
      const len =
        typeof p?.video_length_ms === "number" &&
        Number.isFinite(p.video_length_ms) &&
        p.video_length_ms > 0
          ? Math.min(p.video_length_ms, 3_600_000)
          : 0;
      let pct =
        typeof p?.watch_percentage === "number" &&
        Number.isFinite(p.watch_percentage)
          ? Math.max(0, Math.min(1, p.watch_percentage))
          : 0;
      if (len > 0) pct = Math.max(0, Math.min(1, ms / len));
      const cat =
        typeof p?.content_category === "string"
          ? p.content_category.slice(0, 64)
          : "";
      bumpMap(agg.categoryWeightDeltas, cat, ms * (0.5 + pct));
      const cr =
        typeof p?.creator_id === "string" ? p.creator_id.slice(0, 40) : "";
      bumpMap(agg.creatorWeightDeltas, cr, ms * (0.35 + pct * 0.5));
      const ctype =
        typeof p?.content_kind === "string"
          ? p.content_kind
          : typeof p?.post_content_type === "string"
            ? p.post_content_type
            : "";
      if (ctype === "video" || ctype === "post") {
        bumpMap(agg.contentTypeWeightDeltas, ctype, ms);
      }
      break;
    }
    case "skip_post": {
      const tSkip =
        typeof p?.time_to_skip_ms === "number" &&
        Number.isFinite(p.time_to_skip_ms)
          ? p.time_to_skip_ms
          : 999_999;
      if (tSkip >= 1500) break;
      const veryFast = tSkip < 500;
      const basePen = veryFast ? 0.68 : 0.36;
      const cat =
        typeof p?.content_category === "string"
          ? p.content_category.slice(0, 64)
          : "";
      bumpMap(
        agg.categoryWeightDeltas,
        cat,
        -basePen * (veryFast ? 1.4 : 1),
      );
      const cr =
        typeof p?.creator_id === "string" ? p.creator_id.slice(0, 40) : "";
      bumpMap(agg.creatorWeightDeltas, cr, -basePen * 1.05);
      const ctype =
        typeof p?.content_kind === "string" &&
        (p.content_kind === "video" || p.content_kind === "post")
          ? p.content_kind
          : typeof p?.post_content_type === "string"
            ? p.post_content_type
            : "";
      if (ctype === "video" || ctype === "post") {
        bumpMap(agg.contentTypeWeightDeltas, ctype, -basePen * 0.82);
      }
      break;
    }
    /**
     * `app_open` / `session_start` / `session_end` / `feed_view` /
     * `video_complete` / `session_metrics_update` previously called
     * `upsertEngagement(ctx, userId, {})` purely to bump `lastActiveAt` /
     * `updatedAt`. That's pure write traffic with no analytical signal —
     * `lastActiveAt` is recoverable from the most recent `userEvents.timestamp`
     * for the user. Dropped to reduce contention on `userEngagementScores`.
     */
    default:
      break;
  }
}

/**
 * One read + one patch per row for the whole batch (vs. N reads + N patches
 * before). Only flushes rows that actually accumulated non-zero deltas.
 */
async function flushBatchAggregator(
  ctx: MutationCtx,
  userId: Id<"users">,
  agg: BatchAggregator,
): Promise<void> {
  const eng = agg.engagement;
  if (eng.touched) {
    await upsertEngagement(ctx, userId, {
      videoWatchMsDelta: eng.videoWatchMsDelta || undefined,
      impressionDelta: eng.impressionDelta || undefined,
      likesDelta: eng.likesDelta || undefined,
    });
  }
  for (const [creator, delta] of agg.creatorWeightDeltas) {
    if (delta === 0) continue;
    await mergeCreatorWeights(ctx, userId, creator, delta);
  }
  for (const [category, delta] of agg.categoryWeightDeltas) {
    if (delta === 0) continue;
    await mergeCategoryWeights(ctx, userId, category, delta);
  }
  for (const [ctype, delta] of agg.contentTypeWeightDeltas) {
    if (delta === 0) continue;
    await mergeContentTypeWeights(
      ctx,
      userId,
      ctype as "video" | "post",
      delta,
    );
  }
}

/**
 * Schedule the per-post side effects out of the analytics ingest mutation.
 *
 * Per-post `postFeedStats` and `postPerformance` rows are contended across
 * every viewer of a popular post. Running them inline meant the analytics
 * ingest mutation inherited that contention and retried the *whole* batch
 * (userEvents inserts + per-user aggregates + per-post writes) on conflict.
 * Scheduling isolates the contention to tiny per-post mutations.
 */
function schedulePostSideEffects(
  ctx: MutationCtx,
  eventName: string,
  properties: Record<string, unknown>,
): void {
  const postIdRaw = properties.post_id;
  if (typeof postIdRaw !== "string") return;
  const postId = postIdRaw as Id<"posts">;

  if (
    eventName === "post_impression" ||
    eventName === "video_watch" ||
    eventName === "video_complete" ||
    eventName === "skip_post"
  ) {
    void ctx.scheduler.runAfter(
      0,
      internal.feedSignals.applyPostFeedStatsTouch,
      { postId, eventName, properties },
    );
    void ctx.scheduler.runAfter(
      0,
      internal.feedIntelligence.applyPostPerformanceTouch,
      { postId, eventName, properties },
    );
  }
}

/**
 * Single analytics event (PostHog mirror + aggregates).
 * Kept for backwards compatibility with any callers that still hit the
 * unbatched mutation; the React client now uses `trackEvents`.
 */
export const trackEvent = mutation({
  args: {
    eventName: v.string(),
    properties: v.optional(v.any()),
    timestamp: v.optional(v.number()),
    userId: v.optional(v.id("users")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const name = args.eventName.slice(0, MAX_EVENT_NAME_LEN);
    const userId = resolveUserId(ctx, args.userId);
    const ts = args.timestamp ?? Date.now();
    const rawProps = args.properties ?? {};
    const oversized = jsonSize(rawProps) > MAX_PROPERTIES_JSON_CHARS;
    const props = oversized
      ? ({ _truncated: true } as Record<string, unknown>)
      : (rawProps as Record<string, unknown>);

    await ctx.db.insert("userEvents", {
      userId,
      eventName: name,
      properties: props,
      timestamp: ts,
    });

    if (userId) {
      const agg = makeBatchAggregator();
      accumulateAggregates(agg, name, props);
      await flushBatchAggregator(ctx, userId, agg);
    }

    schedulePostSideEffects(ctx, name, props);

    try {
      await runFeedIntelligencePipeline(ctx, name, props, userId);
    } catch {
      /* non-fatal intelligence */
    }
    return null;
  },
});

/**
 * Batch ingest (up to 25) — preferred client path.
 *
 * Inside ONE mutation:
 *   1. Append all `userEvents` rows (cheap, no contention — append only).
 *   2. Accumulate per-user aggregate deltas in memory.
 *   3. Flush the accumulator with one read+patch per (userId, table) row.
 *   4. Schedule per-post side effects (each runs in its own tiny mutation).
 *   5. Run per-user feed-intelligence inline (per-user rows; OCC contends
 *      only with the *same* user's other in-flight batches, which is rare
 *      since the client serializes flushes via its in-memory queue).
 */
export const trackEvents = mutation({
  args: {
    userId: v.optional(v.id("users")),
    events: v.array(
      v.object({
        eventName: v.string(),
        properties: v.optional(v.any()),
        timestamp: v.optional(v.number()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = resolveUserId(ctx, args.userId);
    const slice = args.events.slice(0, MAX_BATCH);
    const agg = makeBatchAggregator();

    type NormalizedEvent = {
      name: string;
      props: Record<string, unknown>;
      ts: number;
    };
    const normalized: NormalizedEvent[] = [];

    for (const ev of slice) {
      const name = ev.eventName.slice(0, MAX_EVENT_NAME_LEN);
      const ts = ev.timestamp ?? Date.now();
      const rawProps = ev.properties ?? {};
      const oversized = jsonSize(rawProps) > MAX_PROPERTIES_JSON_CHARS;
      const props = oversized
        ? ({ _truncated: true } as Record<string, unknown>)
        : (rawProps as Record<string, unknown>);

      await ctx.db.insert("userEvents", {
        userId,
        eventName: name,
        properties: props,
        timestamp: ts,
      });

      accumulateAggregates(agg, name, props);
      normalized.push({ name, props, ts });
    }

    if (userId) {
      await flushBatchAggregator(ctx, userId, agg);
    }

    let scheduledPostSideEffects = 0;
    for (const ev of normalized) {
      schedulePostSideEffects(ctx, ev.name, ev.props);
      if (
        typeof ev.props.post_id === "string" &&
        (ev.name === "post_impression" ||
          ev.name === "video_watch" ||
          ev.name === "video_complete" ||
          ev.name === "skip_post")
      ) {
        scheduledPostSideEffects += 2;
      }
      try {
        await runFeedIntelligencePipeline(ctx, ev.name, ev.props, userId);
      } catch {
        /* non-fatal intelligence */
      }
    }

    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[analytics] trackEvents batch: events=${normalized.length} ` +
          `aggregateRowsTouched=${
            (agg.engagement.touched ? 1 : 0) +
            agg.creatorWeightDeltas.size +
            agg.categoryWeightDeltas.size +
            agg.contentTypeWeightDeltas.size
          } ` +
          `scheduledPostSideEffects=${scheduledPostSideEffects}`,
      );
    }

    return null;
  },
});
