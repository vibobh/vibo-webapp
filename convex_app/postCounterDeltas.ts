/**
 * Append-only delta log for post counters.
 *
 * Instead of patching the hot `posts` row directly inside interaction
 * mutations (which causes OCC retries under concurrency), callers insert a
 * lightweight delta row here and let `rollupPostCounterDeltas` coalesce them
 * into the `posts` document on a short schedule.
 *
 * Write path:  interaction mutation → insertPostCounterDelta (scheduled)
 * Read path:   posts.likeCount etc. (still the source of truth for reads)
 * Rollup:      cron every 2 minutes → rollupPostCounterDeltas
 *
 * Why scheduled even for insertPostCounterDelta?
 *   The insert itself is append-only and conflict-free; calling it inline is
 *   fine. We expose it as an internalMutation so callers can schedule it when
 *   they want to keep their own transaction slim (e.g. analytics ingest).
 *
 * Optimistic client state:
 *   The client already applies optimistic updates locally, so the 2-minute
 *   rollup lag is invisible to the interacting user. Other viewers see the
 *   eventual-consistent count, which is acceptable (same as every major feed).
 */

import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";

type CounterField =
  | "likeCount"
  | "dislikeCount"
  | "repostCount"
  | "commentCount"
  | "viewsCount"
  | "sharesCount"
  | "downloadCount";

/**
 * Insert a single delta row.  Call this from interaction mutations instead of
 * `ctx.db.patch(postId, { likeCount: newCount })`.
 *
 * Can also be scheduled via `ctx.scheduler.runAfter(0, ...)` to keep the
 * caller's OCC surface small.
 */
export async function insertPostCounterDelta(
  ctx: MutationCtx,
  postId: Id<"posts">,
  field: CounterField,
  delta: number,
): Promise<void> {
  await ctx.db.insert("postCounterDeltas", {
    postId,
    field,
    delta,
    createdAt: Date.now(),
    processedAt: undefined,
  });
}

/**
 * Internal mutation wrapper — used when callers want to schedule the insert
 * out-of-band to keep their own mutation's OCC surface to a minimum.
 */
export const schedulePostCounterDelta = internalMutation({
  args: {
    postId: v.id("posts"),
    field: v.union(
      v.literal("likeCount"),
      v.literal("dislikeCount"),
      v.literal("repostCount"),
      v.literal("commentCount"),
      v.literal("viewsCount"),
      v.literal("sharesCount"),
      v.literal("downloadCount"),
    ),
    delta: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await insertPostCounterDelta(ctx, args.postId, args.field, args.delta);
    return null;
  },
});

/**
 * Rollup unprocessed deltas into the `posts` document.
 *
 * Called by cron every 2 minutes.  Processes up to `batchSize` unprocessed
 * deltas per run, grouped by postId so each post gets one patch.
 *
 * Concurrency safety:
 *   • Deltas are marked processed (processedAt = now) before the posts patch.
 *   • If the mutation retries after the mark but before the patch, the deltas
 *     are already marked — a rerun skips them and the net effect is correct.
 *   • Two concurrent cron invocations would both scan the same unprocessed
 *     rows but Convex serialises mutations on the same document, so the second
 *     scan sees processedAt already set and skips.  Safe.
 */
export const rollupPostCounterDeltas = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const BATCH = 500;
    const now = Date.now();

    // Collect unprocessed deltas (processedAt is undefined)
    const unprocessed = await ctx.db
      .query("postCounterDeltas")
      .withIndex("by_processed_created", (q) => q.eq("processedAt", undefined))
      .order("asc")
      .take(BATCH);

    if (unprocessed.length === 0) return null;

    // Group by postId
    const byPost = new Map<
      string,
      { id: Id<"postCounterDeltas">; field: CounterField; delta: number }[]
    >();
    for (const row of unprocessed) {
      const key = String(row.postId);
      if (!byPost.has(key)) byPost.set(key, []);
      byPost.get(key)!.push({ id: row._id, field: row.field as CounterField, delta: row.delta });
    }

    for (const [postIdStr, rows] of byPost) {
      const postId = postIdStr as Id<"posts">;
      const post = await ctx.db.get(postId);

      // Mark all rows for this post processed regardless of whether the post
      // still exists — prevents them from piling up forever.
      for (const row of rows) {
        await ctx.db.patch(row.id, { processedAt: now });
      }

      if (!post) continue;

      // Aggregate net deltas per field
      const net: Partial<Record<CounterField, number>> = {};
      for (const row of rows) {
        net[row.field] = (net[row.field] ?? 0) + row.delta;
      }

      // Build patch — clamp each counter to ≥ 0
      const patch: Partial<Record<string, number>> = {};
      for (const [field, delta] of Object.entries(net) as [CounterField, number][]) {
        const current = (post[field] as number | undefined) ?? 0;
        patch[field] = Math.max(0, current + delta);
      }

      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(postId, patch);
      }
    }

    return null;
  },
});

/**
 * Purge processed delta rows older than 7 days to keep the table lean.
 * Called by the same cron that runs rollup (or a separate housekeeping cron).
 */
export const purgeProcessedDeltas = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const WEEK_MS = 7 * 24 * 3600_000;
    const cutoff = Date.now() - WEEK_MS;
    const BATCH = 200;

    const old = await ctx.db
      .query("postCounterDeltas")
      .withIndex("by_processed_created", (q) =>
        q.gt("processedAt", 0).lt("processedAt", cutoff),
      )
      .take(BATCH);

    for (const row of old) {
      await ctx.db.delete(row._id);
    }

    return null;
  },
});
