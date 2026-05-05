/**
 * Precomputed feed candidate pools — refreshed on a cron (few-minute cadence).
 * Ranking merges pools in `getCandidatePosts` for scalable discovery.
 */

import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export const refreshFeedPools = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const take = 280;
    const published = await ctx.db
      .query("posts")
      .withIndex("by_status_created", (q) => q.eq("status", "published"))
      .order("desc")
      .take(take);

    async function clearPool(pool: string) {
      const rows = await ctx.db
        .query("feedCandidatePool")
        .withIndex("by_pool_updated", (q) => q.eq("pool", pool))
        .collect();
      for (const r of rows) {
        await ctx.db.delete(r._id);
      }
    }

    async function fillPool(pool: string, postIds: Id<"posts">[]) {
      await clearPool(pool);
      for (let i = 0; i < postIds.length; i++) {
        await ctx.db.insert("feedCandidatePool", {
          pool,
          postId: postIds[i],
          lastUpdatedAt: now + i,
        });
      }
    }

    const enriched: Array<{
      post: Doc<"posts">;
      stats: Doc<"postFeedStats"> | null;
      trendScore: number;
    }> = [];

    for (const post of published) {
      const stats = await ctx.db
        .query("postFeedStats")
        .withIndex("by_post", (q) => q.eq("postId", post._id))
        .first();
      const kind = stats?.contentKind ?? "post";
      const im = Math.max(stats?.impressions ?? 0, 1);
      const avgWatch =
        (stats?.sumWatchMs ?? 0) / Math.max(stats?.watchSamples ?? 0, 1);
      const avgView = (stats?.sumViewDurationMs ?? 0) / im;
      const trendScore =
        kind === "video"
          ? clamp((avgWatch / 9000) * Math.log1p(im), 0, 12)
          : clamp((avgView / 3500) * Math.log1p(im), 0, 12);
      enriched.push({ post, stats, trendScore });
    }

    const trendingVideos = enriched
      .filter((e) => e.stats?.contentKind === "video")
      .sort((a, b) => b.trendScore - a.trendScore)
      .slice(0, 72)
      .map((e) => e.post._id);

    const trendingPosts = enriched
      .filter((e) => e.stats?.contentKind !== "video")
      .sort((a, b) => b.trendScore - a.trendScore)
      .slice(0, 72)
      .map((e) => e.post._id);

    const freshContent = [...published]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 100)
      .map((p) => p._id);

    const underexposed = enriched
      .filter((e) => {
        const im = e.stats?.impressions ?? 0;
        const st = e.stats?.distributionStage;
        return (
          im < 200 &&
          (st === "test" || st === "expand" || st === undefined)
        );
      })
      .sort((a, b) => b.trendScore - a.trendScore)
      .slice(0, 56)
      .map((e) => e.post._id);

    await fillPool("trending_videos", trendingVideos);
    await fillPool("trending_posts", trendingPosts);
    await fillPool("fresh_content", freshContent);
    await fillPool("underexposed_high_quality", underexposed);
    await fillPool("following_content", freshContent.slice(0, 48));

    return null;
  },
});
