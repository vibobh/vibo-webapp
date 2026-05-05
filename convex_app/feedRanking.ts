import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { normalizeModerationStatus, postClearedForDistribution } from "./postModeration";
import type { ViewerFeedExclusions } from "./viewerContentFilters";
import {
  loadViewerFeedExclusions,
  viewerPostContentHidden,
} from "./viewerContentFilters";
import { postDistributionUserIds } from "./postDistribution";

function followGraphRankingSignals(
  post: Doc<"posts">,
  followingIds: Set<string>,
): { followingAuthor: boolean; collaboratorPathBoost: number } {
  const dist = postDistributionUserIds(post).map(String);
  const creator = String(post.userId);
  const followsSomeone = dist.some((id) => followingIds.has(id));
  const followsCreator = followingIds.has(creator);
  const followsCollabNotCreator =
    followsSomeone &&
    !followsCreator &&
    dist.some((id) => id !== creator && followingIds.has(id));
  return {
    followingAuthor: followsSomeone,
    collaboratorPathBoost: followsCollabNotCreator ? 0.12 : 0,
  };
}

export type FeedRankReason =
  | "interest"
  | "trending"
  | "fresh"
  | "social"
  | "test_phase";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function normFreshness(createdAt: number, now: number): number {
  const hours = Math.max(0, (now - createdAt) / 3600_000);
  return Math.exp(-hours / 36);
}

function logEngagement(like: number, comment: number, shares: number): number {
  /** Shares weighted strongly (growth / distribution signal). */
  return Math.min(
    1,
    Math.log1p(like + comment * 2 + shares * 10) / Math.log1p(220),
  );
}

function interestBonusFromPost(
  post: Doc<"posts">,
  prefs: Doc<"userContentPreferences"> | null,
): number {
  if (!prefs?.categoryWeights) return 0;
  const cw = prefs.categoryWeights as Record<string, number>;
  const tags = post.hashtags ?? [];
  let b = 0;
  for (const h of tags) {
    const k = h.toLowerCase().replace(/^#/, "");
    b += (cw[k] ?? 0) * 0.12;
  }
  return clamp(b, 0, 0.4);
}

function creatorAffinity(
  authorId: Id<"users">,
  prefs: Doc<"userContentPreferences"> | null,
): number {
  if (!prefs?.creatorWeights) return 0;
  const m = prefs.creatorWeights as Record<string, number>;
  const w = m[String(authorId)] ?? 0;
  return clamp(w * 0.25, 0, 0.35);
}

function contentTypeAffinity(
  kind: "video" | "post",
  prefs: Doc<"userContentPreferences"> | null,
): number {
  if (!prefs?.contentTypeWeights) return 0;
  const m = prefs.contentTypeWeights as Record<string, number>;
  const w = m[kind] ?? 0;
  return clamp(w * 0.15, 0, 0.2);
}

function recentCategoryOverlap(
  post: Doc<"posts">,
  recentCategories: string[],
): number {
  if (recentCategories.length === 0) return 0;
  const set = new Set(recentCategories.map((s) => s.toLowerCase()));
  const tags = post.hashtags ?? [];
  let n = 0;
  for (const h of tags) {
    const k = h.toLowerCase().replace(/^#/, "");
    if (set.has(k)) n++;
  }
  return n;
}

export function scorePostUnified(input: {
  post: Doc<"posts">;
  stats: Doc<"postFeedStats"> | null;
  prefs: Doc<"userContentPreferences"> | null;
  session: Doc<"sessionFeedState"> | null;
  /** Viewer follows the creator or an accepted collaborator in distribution graph. */
  followingAuthor: boolean;
  /** Extra relevance when viewer follows a collaborator but not the primary author. */
  collaboratorPathBoost: number;
  trust: number;
  now: number;
  viewerContentHidden: boolean;
}): {
  score: number;
  reason: FeedRankReason;
  breakdown: Record<string, unknown>;
  modDetail: {
    postId: string;
    modStatus: string;
    modVis: string;
    preModScore: number;
    finalScore: number;
    multiplier: number;
  };
} {
  const {
    post,
    stats,
    prefs,
    session,
    followingAuthor,
    collaboratorPathBoost,
    trust,
    now,
    viewerContentHidden,
  } = input;
  const kind = stats?.contentKind ?? "post";
  const im = stats?.impressions ?? 0;
  const avgViewMs = im > 0 ? (stats?.sumViewDurationMs ?? 0) / im : 0;
  const avgWatchMs =
    (stats?.watchSamples ?? 0) > 0
      ? (stats?.sumWatchMs ?? 0) / (stats?.watchSamples ?? 1)
      : 0;
  const avgPct =
    (stats?.watchSamples ?? 0) > 0
      ? (stats?.sumWatchPct ?? 0) / (stats?.watchSamples ?? 1)
      : 0;

  const watchNorm = clamp(avgWatchMs / 12_000, 0, 1);
  const viewNorm = clamp(avgViewMs / 8000, 0, 1);
  let completion = clamp(avgPct, 0, 1);
  const engagement = logEngagement(
    post.likeCount ?? 0,
    post.commentCount ?? 0,
    post.sharesCount ?? 0,
  );
  let freshness = normFreshness(post.createdAt, now);
  const dist = stats?.distributionMultiplier ?? 1;
  let interest = interestBonusFromPost(post, prefs);
  let creatorAff = creatorAffinity(post.userId, prefs);
  const typeAff = contentTypeAffinity(kind, prefs);

  const ageMs = now - post.createdAt;
  const testPhase = ageMs < 72 * 3600_000 && im < 200;

  const skipRate = stats?.skipRate ?? 0;
  /** Strong negative signal — reacts faster than positive interest bumps. */
  const skipPenaltyMult = clamp(1 - skipRate * 0.85, 0.35, 1);
  const explicitFastRatio =
    im > 0
      ? ((stats?.veryFastSkipCount ?? 0) * 1.4 +
          (stats?.fastSkipCount ?? 0) * 0.35) /
        im
      : 0;
  const skipPenaltyMult2 = clamp(1 - explicitFastRatio * 0.55, 0.45, 1);

  let recentRepeatPenalty = 0;
  if (
    session &&
    session.fastSkipsInRow >= 3 &&
    session.recentCategories.length
  ) {
    const overlap = recentCategoryOverlap(post, session.recentCategories);
    recentRepeatPenalty = Math.min(0.28, overlap * 0.09);
  }

  let diversityBoost = 0;
  if (session?.boredomLevel === "high") {
    freshness = clamp(freshness * 1.22, 0, 1);
    const recentAuthors = new Set(session.recentCreators.map(String));
    if (!recentAuthors.has(String(post.userId))) {
      diversityBoost = 0.09;
    }
  }

  if (session && session.avgRecentWatchPercentage > 0.55) {
    interest *= 1.14;
    creatorAff *= 1.08;
  }

  if (session && session.fastSkipsInRow >= 3) {
    const recentAuthors = new Set(session.recentCreators.map(String));
    if (recentAuthors.has(String(post.userId))) {
      creatorAff *= 0.55;
    }
    interest *= 0.62;
  }

  const stage = stats?.distributionStage;
  const stageTweak =
    stage === "accelerate" ? 1.04 : stage === "dead" ? 0.88 : 1;

  let score = 0;
  if (kind === "video") {
    score =
      watchNorm * 0.4 + completion * 0.3 + engagement * 0.2 + freshness * 0.1;
  } else {
    const depth = clamp(
      Math.log1p(post.commentCount ?? 0) / Math.log1p(24),
      0,
      1,
    );
    score = viewNorm * 0.35 + engagement * 0.35 + depth * 0.2 + freshness * 0.1;
  }

  score *= clamp(trust, 0.55, 1.05);
  score *= clamp(dist, 0.2, 1.8);
  score *= skipPenaltyMult * skipPenaltyMult2 * stageTweak;
  if (viewerContentHidden) score *= 0.22;

  score += interest * 0.22 + creatorAff * 0.18 + typeAff * 0.1;
  score += diversityBoost;
  score -= recentRepeatPenalty;
  if (followingAuthor) score += 0.45;
  if (collaboratorPathBoost > 0) score += collaboratorPathBoost;
  if (testPhase) score += 0.12;

  const preModScore = score;

  // Hard moderation gate: non-active posts are NEVER distributed via ranking.
  // Moderation is a safety gate, not a ranking signal.
  const modStatus = normalizeModerationStatus(post.moderationStatus);
  const modVis = post.moderationVisibilityStatus ?? "public";

  if (!postClearedForDistribution(post)) {
    return {
      score: 0,
      reason: "fresh" as FeedRankReason,
      breakdown: { moderationGate: "blocked", modStatus, modVis },
      modDetail: {
        postId: String(post._id),
        modStatus,
        modVis,
        preModScore: +preModScore.toFixed(4),
        finalScore: 0,
        multiplier: 0,
      },
    };
  }

  const finalScore = preModScore;

  let reason: FeedRankReason = "fresh";
  if (followingAuthor) reason = "social";
  else if (testPhase) reason = "test_phase";
  else if (interest >= 0.08 || creatorAff >= 0.06) reason = "interest";
  else if (
    im >= 40 &&
    (avgWatchMs > 5000 || avgViewMs > 4000 || completion > 0.45)
  ) {
    reason = "trending";
  }

  const modDetail = {
    postId: String(post._id),
    modStatus,
    modVis,
    preModScore: +preModScore.toFixed(4),
    finalScore: +finalScore.toFixed(4),
    multiplier: 1,
  };

  return {
    score: finalScore,
    reason,
    breakdown: {
      skipRate,
      skipPenaltyMult,
      skipPenaltyMult2,
      distributionStage: stage ?? "unknown",
      distributionMultiplier: dist,
      recentRepeatPenalty,
      diversityBoost,
      fastSkipsInRow: session?.fastSkipsInRow ?? 0,
      boredomLevel: session?.boredomLevel ?? "low",
      modStatus,
      preModScore: +preModScore.toFixed(4),
    },
    modDetail,
  };
}

export function passesQualityGate(
  post: Doc<"posts">,
  stats: Doc<"postFeedStats"> | null,
  followingAuthor: boolean,
): boolean {
  if (followingAuthor) return true;
  const im = stats?.impressions ?? 0;
  if (im < 7) return true;
  const fastRatio = (stats?.fastSkips ?? 0) / Math.max(im, 1);
  if (im >= 26 && fastRatio > 0.74) return false;
  if (stats?.contentKind === "video" && im >= 22) {
    const avgView = (stats.sumViewDurationMs ?? 0) / im;
    const avgWatch =
      (stats.sumWatchMs ?? 0) / Math.max(stats.watchSamples ?? 0, 1);
    if (avgView < 650 && avgWatch < 900) return false;
  }
  return true;
}

export function allowDespiteLowLikes(
  post: Doc<"posts">,
  stats: Doc<"postFeedStats"> | null,
  followingAuthor: boolean,
  testPhase: boolean,
  interest: number,
): boolean {
  if (followingAuthor) return true;
  if (testPhase) return true;
  if (interest >= 0.06) return true;
  const likes = post.likeCount ?? 0;
  const im = stats?.impressions ?? 0;
  if (likes > 0) return true;
  if (im <= 35) return true;
  const avgWatch =
    (stats?.sumWatchMs ?? 0) / Math.max(stats?.watchSamples ?? 0, 1);
  const avgView = im > 0 ? (stats?.sumViewDurationMs ?? 0) / im : 0;
  if (avgWatch >= 2000 || avgView >= 2500) return true;
  return false;
}

function interleaveVideoPost<T extends { kind: "video" | "post" }>(
  items: T[],
  videoShare: number,
): T[] {
  const videos = items.filter((i) => i.kind === "video");
  const posts = items.filter((i) => i.kind === "post");
  const out: T[] = [];
  const vEvery = Math.max(1, Math.round(1 / Math.max(0.15, videoShare)));
  let vi = 0;
  let pi = 0;
  while (vi < videos.length || pi < posts.length) {
    for (let k = 0; k < vEvery - 1 && vi < videos.length; k++) {
      out.push(videos[vi++]);
    }
    if (vi < videos.length) out.push(videos[vi++]);
    if (pi < posts.length) out.push(posts[pi++]);
  }
  while (vi < videos.length) out.push(videos[vi++]);
  while (pi < posts.length) out.push(posts[pi++]);
  return out;
}

function diversifyAuthors<T extends { post: Doc<"posts"> }>(scored: T[]): T[] {
  const pool = [...scored];
  const out: T[] = [];
  while (pool.length) {
    const last2 = out.slice(-2).map((x) => String(x.post.userId));
    let pick = 0;
    if (last2.length === 2 && last2[0] === last2[1]) {
      const blocked = last2[0];
      const idx = pool.findIndex((p) => String(p.post.userId) !== blocked);
      pick = idx === -1 ? 0 : idx;
    }
    out.push(pool.splice(pick, 1)[0]);
  }
  return out;
}

export async function rankPostsUnified(
  ctx: QueryCtx,
  args: {
    posts: Doc<"posts">[];
    viewerId: Id<"users">;
    followingIds: Set<string>;
    now: number;
    feedEx: ViewerFeedExclusions;
  },
): Promise<{
  ranked: Doc<"posts">[];
  meta: Array<{ post_id: string; score: number; reason: FeedRankReason }>;
}> {
  const { posts, viewerId, followingIds, now, feedEx } = args;
  if (posts.length === 0) return { ranked: [], meta: [] };

  const [prefs, session] = await Promise.all([
    ctx.db
      .query("userContentPreferences")
      .withIndex("by_user", (q) => q.eq("userId", viewerId))
      .first(),
    ctx.db
      .query("sessionFeedState")
      .withIndex("by_user", (q) => q.eq("userId", viewerId))
      .first(),
  ]);

  let videoShare = 0.76;
  if (session) {
    if ((session.consecutiveVideoSkips ?? 0) >= 3) {
      videoShare = 0.38;
    } else if ((session.consecutivePostSkips ?? 0) >= 3) {
      videoShare = 0.9;
    }
    if (session.boredomLevel === "high") {
      videoShare = clamp(videoShare + 0.06, 0.32, 0.9);
    }
  }

  const statsList = await Promise.all(
    posts.map((p) =>
      ctx.db
        .query("postFeedStats")
        .withIndex("by_post", (q) => q.eq("postId", p._id))
        .first(),
    ),
  );

  const trustCache = new Map<string, number>();
  async function trustFor(authorId: Id<"users">): Promise<number> {
    const key = String(authorId);
    if (trustCache.has(key)) return trustCache.get(key)!;
    const row = await ctx.db
      .query("creatorTrust")
      .withIndex("by_user", (q) => q.eq("userId", authorId))
      .first();
    const user = await ctx.db.get(authorId);
    const strikes = user?.strikeCount ?? 0;
    let t = row?.trust ?? clamp(1 - strikes * 0.04, 0.55, 1);
    t = clamp(t, 0.55, 1);
    trustCache.set(key, t);
    return t;
  }

  type ScoredEntry = {
    post: Doc<"posts">;
    score: number;
    reason: FeedRankReason;
    kind: "video" | "post";
    modDetail: ReturnType<typeof scorePostUnified>["modDetail"];
  };
  const scored: ScoredEntry[] = [];

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const stats = statsList[i];

    // HARD GATE: only posts that passed moderation enter ranking.
    if (!postClearedForDistribution(post)) continue;

    const { followingAuthor, collaboratorPathBoost } =
      followGraphRankingSignals(post, followingIds);
    const interest = interestBonusFromPost(post, prefs);
    const im = stats?.impressions ?? 0;
    const testPhase = now - post.createdAt < 72 * 3600_000 && im < 200;

    if (!passesQualityGate(post, stats, followingAuthor)) continue;
    if (
      !allowDespiteLowLikes(post, stats, followingAuthor, testPhase, interest)
    ) {
      continue;
    }

    const trust = await trustFor(post.userId);
    const hidden = viewerPostContentHidden(post, viewerId, feedEx);
    const result = scorePostUnified({
      post,
      stats,
      prefs,
      session,
      followingAuthor,
      collaboratorPathBoost,
      trust,
      now,
      viewerContentHidden: hidden,
    });

    if (!result.modDetail) {
      throw new Error(
        `MOD_DETAIL_MISSING: post=${String(post._id)} status=${post.moderationStatus}`,
      );
    }

    const kind = stats?.contentKind ?? "post";
    scored.push({ post, score: result.score, reason: result.reason, kind, modDetail: result.modDetail });
  }

  scored.sort((a, b) => b.score - a.score);
  const interleaved = interleaveVideoPost(scored, videoShare);
  const diversified = diversifyAuthors(interleaved);

  const ranked = diversified.map((s) => s.post);
  const meta: Array<{ post_id: string; score: number; reason: FeedRankReason }> = [];

  // Build meta in a single pass.
  for (const s of diversified) {
    meta.push({
      post_id: String(s.post._id),
      score: s.score,
      reason: s.reason,
    });
  }

  const modImpacts = scored
    .filter((s) => s.modDetail.multiplier !== 1);

  if (modImpacts.length > 0) {
    console.log("[MOD_SUMMARY]", {
      affected: modImpacts.length,
      posts: modImpacts.map((m) => ({
        id: String(m.post._id).slice(-6),
        fullId: String(m.post._id),
        status: m.modDetail.modStatus,
        before: m.modDetail.preModScore,
        after: m.modDetail.finalScore,
        mult: m.modDetail.multiplier,
        rankScore: +m.score.toFixed(4),
        match: +m.score.toFixed(4) === m.modDetail.finalScore,
      })),
    });
  }

  const top5 = meta.slice(0, 5).map((m) => ({
    id: m.post_id.slice(-6),
    fullId: m.post_id,
    score: +m.score.toFixed(4),
    reason: m.reason,
  }));
  // Verbose rank log disabled — uncomment for debugging:
  // console.log("[RANK_SUMMARY]", { candidates: posts.length, scored: scored.length, ranked: ranked.length, modAffected: modImpacts.length, top5 });

  return { ranked, meta };
}

/**
 * Candidate pool for ranking / debugging (not full post payloads).
 */
export const getCandidatePosts = query({
  args: {
    userId: v.optional(v.id("users")),
    max: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      post_id: v.id("posts"),
      type: v.union(v.literal("video"), v.literal("post")),
      reason: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const viewerId =
      args.userId ?? ((ctx as any).userId as Id<"users"> | undefined);
    if (!viewerId) return [];

    const cap = clamp(args.max ?? 320, 50, 500);
    const pools = [
      "trending_videos",
      "trending_posts",
      "fresh_content",
      "underexposed_high_quality",
      "following_content",
    ] as const;
    const perPool = Math.max(24, Math.ceil(cap / pools.length));

    const seen = new Set<string>();
    const out: Array<{
      post_id: Id<"posts">;
      type: "video" | "post";
      reason: string;
    }> = [];

    for (const pool of pools) {
      const poolRows = await ctx.db
        .query("feedCandidatePool")
        .withIndex("by_pool_updated", (q) => q.eq("pool", pool))
        .order("desc")
        .take(perPool);
      for (const pr of poolRows) {
        const sid = String(pr.postId);
        if (seen.has(sid)) continue;
        const post = await ctx.db.get(pr.postId);
        if (!post || !postClearedForDistribution(post)) continue;
        seen.add(sid);
        const stats = await ctx.db
          .query("postFeedStats")
          .withIndex("by_post", (q) => q.eq("postId", post._id))
          .first();
        const kind = stats?.contentKind ?? "post";
        out.push({ post_id: post._id, type: kind, reason: pool });
        if (out.length >= cap) break;
      }
      if (out.length >= cap) break;
    }

    if (out.length < Math.min(48, cap)) {
      const rows = await ctx.db
        .query("posts")
        .withIndex("by_status_created", (q) => q.eq("status", "published"))
        .order("desc")
        .take(cap - out.length + 20);
      for (const post of rows) {
        const sid = String(post._id);
        if (seen.has(sid)) continue;
        if (!postClearedForDistribution(post)) continue;
        seen.add(sid);
        const stats = await ctx.db
          .query("postFeedStats")
          .withIndex("by_post", (q) => q.eq("postId", post._id))
          .first();
        const kind = stats?.contentKind ?? "post";
        const im = stats?.impressions ?? 0;
        const age = Date.now() - post.createdAt;
        let reason = "fresh_chronological";
        if (age < 72 * 3600_000 && im < 200) reason = "test_phase";
        else if (im > 50 && (stats?.sumWatchMs ?? 0) / Math.max(im, 1) > 4000) {
          reason = "trending_fallback";
        }
        out.push({ post_id: post._id, type: kind, reason });
        if (out.length >= cap) break;
      }
    }

    return out;
  },
});

/** Staff / dev: session row + optional per-post score breakdown. */
export const getFeedRankingDebug = query({
  args: {
    userId: v.optional(v.id("users")),
    postId: v.optional(v.id("posts")),
  },
  returns: v.object({
    session: v.optional(v.any()),
    scoreBreakdown: v.optional(v.any()),
  }),
  handler: async (ctx, args) => {
    const uid = args.userId ?? ((ctx as any).userId as Id<"users"> | undefined);
    if (!uid) {
      return {};
    }
    const session = await ctx.db
      .query("sessionFeedState")
      .withIndex("by_user", (q) => q.eq("userId", uid))
      .first();

    let scoreBreakdown: unknown;
    const debugPostId = args.postId;
    if (debugPostId) {
      const post = await ctx.db.get(debugPostId);
      if (post) {
        const stats = await ctx.db
          .query("postFeedStats")
          .withIndex("by_post", (q) => q.eq("postId", debugPostId))
          .first();
        const prefs = await ctx.db
          .query("userContentPreferences")
          .withIndex("by_user", (q) => q.eq("userId", uid))
          .first();
        const feedEx = await loadViewerFeedExclusions(ctx, uid);
        const follows = await ctx.db
          .query("follows")
          .withIndex("by_follower_status", (q) =>
            q.eq("followerId", uid).eq("status", "active"),
          )
          .collect();
        const followingIds = new Set([
          String(uid),
          ...follows.map((f) => String(f.followingId)),
        ]);
        const { followingAuthor, collaboratorPathBoost } =
          followGraphRankingSignals(post, followingIds);
        const trustRow = await ctx.db
          .query("creatorTrust")
          .withIndex("by_user", (q) => q.eq("userId", post.userId))
          .first();
        const author = await ctx.db.get(post.userId);
        const strikes = author?.strikeCount ?? 0;
        const trust = clamp(trustRow?.trust ?? 1 - strikes * 0.04, 0.55, 1);
        const ranked = scorePostUnified({
          post,
          stats,
          prefs,
          session,
          followingAuthor,
          collaboratorPathBoost,
          trust,
          now: Date.now(),
          viewerContentHidden: viewerPostContentHidden(post, uid, feedEx),
        });
        scoreBreakdown = {
          ...ranked.breakdown,
          finalScore: ranked.score,
          reason: ranked.reason,
        };
      }
    }

    return { session: session ?? undefined, scoreBreakdown };
  },
});

export const scorePost = query({
  args: {
    userId: v.optional(v.id("users")),
    postId: v.id("posts"),
  },
  returns: v.object({
    score: v.number(),
    reason: v.string(),
    breakdown: v.any(),
  }),
  handler: async (ctx, args) => {
    const viewerId =
      args.userId ?? ((ctx as any).userId as Id<"users"> | undefined);
    const post = await ctx.db.get(args.postId);
    if (!post) {
      return { score: 0, reason: "none", breakdown: {} };
    }
    const stats = await ctx.db
      .query("postFeedStats")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .first();
    const prefs = viewerId
      ? await ctx.db
          .query("userContentPreferences")
          .withIndex("by_user", (q) => q.eq("userId", viewerId))
          .first()
      : null;
    const feedEx = viewerId
      ? await loadViewerFeedExclusions(ctx, viewerId)
      : null;
    let followingIds = new Set<string>();
    if (viewerId) {
      const follows = await ctx.db
        .query("follows")
        .withIndex("by_follower_status", (q) =>
          q.eq("followerId", viewerId).eq("status", "active"),
        )
        .collect();
      followingIds = new Set([
        String(viewerId),
        ...follows.map((f) => String(f.followingId)),
      ]);
    }
    const { followingAuthor, collaboratorPathBoost } = viewerId
      ? followGraphRankingSignals(post, followingIds)
      : { followingAuthor: false, collaboratorPathBoost: 0 };
    const trustRow = await ctx.db
      .query("creatorTrust")
      .withIndex("by_user", (q) => q.eq("userId", post.userId))
      .first();
    const author = await ctx.db.get(post.userId);
    const strikes = author?.strikeCount ?? 0;
    const trust = clamp(trustRow?.trust ?? 1 - strikes * 0.04, 0.55, 1);
    const now = Date.now();
    const session = viewerId
      ? await ctx.db
          .query("sessionFeedState")
          .withIndex("by_user", (q) => q.eq("userId", viewerId))
          .first()
      : null;
    const { score, reason, breakdown } = scorePostUnified({
      post,
      stats,
      prefs,
      session,
      followingAuthor,
      collaboratorPathBoost,
      trust,
      now,
      viewerContentHidden:
        viewerId && feedEx
          ? viewerPostContentHidden(post, viewerId, feedEx)
          : false,
    });
    return {
      score,
      reason,
      breakdown: {
        ...breakdown,
        impressions: stats?.impressions ?? 0,
        avgViewMs:
          stats && stats.impressions > 0
            ? stats.sumViewDurationMs / stats.impressions
            : 0,
        avgWatchMs:
          stats && stats.watchSamples > 0
            ? stats.sumWatchMs / stats.watchSamples
            : 0,
        distributionMultiplier: stats?.distributionMultiplier ?? 1,
        trust,
        followingAuthor,
        skipCount: stats?.skipCount ?? 0,
        fastSkipCount: stats?.fastSkipCount ?? 0,
        veryFastSkipCount: stats?.veryFastSkipCount ?? 0,
      },
    };
  },
});

export const updateUserPreferences = mutation({
  args: {
    userId: v.optional(v.id("users")),
    categoryWeights: v.optional(v.any()),
    creatorWeights: v.optional(v.any()),
    contentTypeWeights: v.optional(v.any()),
    /** Replace entire maps when true; otherwise deep-merge numeric values */
    replace: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const uid = args.userId ?? ((ctx as any).userId as Id<"users"> | undefined);
    if (!uid) throw new Error("Unauthorized");

    const now = Date.now();
    const existing = await ctx.db
      .query("userContentPreferences")
      .withIndex("by_user", (q) => q.eq("userId", uid))
      .first();

    const mergeMap = (
      base: Record<string, number>,
      patch: Record<string, number> | undefined,
      replace: boolean,
    ) => {
      if (!patch) return base;
      if (replace) return { ...patch };
      const next = { ...base };
      for (const [k, v] of Object.entries(patch)) {
        next[k] = (next[k] ?? 0) + (typeof v === "number" ? v : 0);
      }
      return next;
    };

    const replace = args.replace ?? false;
    const cat0 =
      (existing?.categoryWeights as Record<string, number> | undefined) ?? {};
    const cr0 =
      (existing?.creatorWeights as Record<string, number> | undefined) ?? {};
    const ct0 =
      (existing?.contentTypeWeights as Record<string, number> | undefined) ??
      {};

    const categoryWeights = mergeMap(
      cat0,
      args.categoryWeights as Record<string, number> | undefined,
      replace,
    );
    const creatorWeights = mergeMap(
      cr0,
      args.creatorWeights as Record<string, number> | undefined,
      replace,
    );
    const contentTypeWeights = mergeMap(
      ct0,
      args.contentTypeWeights as Record<string, number> | undefined,
      replace,
    );

    if (existing) {
      await ctx.db.patch(existing._id, {
        categoryWeights,
        creatorWeights,
        contentTypeWeights,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("userContentPreferences", {
        userId: uid,
        categoryWeights,
        creatorWeights,
        contentTypeWeights,
        updatedAt: now,
      });
    }
    return null;
  },
});
