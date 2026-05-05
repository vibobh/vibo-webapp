import { v } from "convex/values";
import { query } from "./_generated/server";
import {
  postHiddenFromNonOwner,
  postShouldOmitFromAllSurfaces,
} from "./postModeration";
import type { Id } from "./_generated/dataModel";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Minimum confidenceScore to return a "candidate"-status card.
 * "approved" cards are always returned regardless of score.
 */
const CANDIDATE_MIN_CONFIDENCE = 0.97;

// ---------------------------------------------------------------------------
// Public query
// ---------------------------------------------------------------------------

/**
 * Fetch one context card for the active Vibes video.
 *
 * Rules:
 * - Only returns status="approved" OR status="candidate" with score >= 0.97.
 * - Returns at most 1 card (highest confidence, approved first).
 * - Target post must be published and accessible to the viewer.
 * - Target media must exist.
 * - Cannot point to the same post.
 * - Fully index-backed — no scans, no AI, no matching logic.
 */
export const getContextCardForPost = query({
  args: {
    sourcePostId: v.id("posts"),
    sourceMediaId: v.optional(v.id("postMedia")),
    viewerUserId: v.optional(v.id("users")),
  },
  returns: v.union(
    v.object({
      candidateId: v.id("contextCardCandidates"),
      targetPostId: v.id("posts"),
      targetMediaId: v.optional(v.id("postMedia")),
      title: v.string(),
      subtitle: v.optional(v.string()),
      matchType: v.string(),
      confidenceScore: v.number(),
      triggerStartMs: v.optional(v.number()),
      triggerEndMs: v.optional(v.number()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const viewerUserId = (args.viewerUserId ?? null) as Id<"users"> | null;

    // Fetch approved candidates for this source post (desc by confidenceScore).
    const approvedCandidates = await ctx.db
      .query("contextCardCandidates")
      .withIndex("by_sourcePostId", (q) =>
        q.eq("sourcePostId", args.sourcePostId),
      )
      .filter((q) => q.eq(q.field("status"), "approved"))
      .order("desc")
      .take(10);

    // Fetch high-confidence "candidate" status cards.
    const candidateCards = await ctx.db
      .query("contextCardCandidates")
      .withIndex("by_sourcePostId", (q) =>
        q.eq("sourcePostId", args.sourcePostId),
      )
      .filter((q) => q.eq(q.field("status"), "candidate"))
      .order("desc")
      .take(10);

    // Merge: approved first, then high-confidence candidates, sorted by score desc.
    const pool = [
      ...approvedCandidates,
      ...candidateCards.filter(
        (c) => c.confidenceScore >= CANDIDATE_MIN_CONFIDENCE,
      ),
    ].sort((a, b) => {
      // Approved always ranks above candidate.
      if (a.status === "approved" && b.status !== "approved") return -1;
      if (b.status === "approved" && a.status !== "approved") return 1;
      return b.confidenceScore - a.confidenceScore;
    });

    for (const candidate of pool) {
      // Exclude same-post candidates (shouldn't exist, but guard anyway).
      if (String(candidate.targetPostId) === String(args.sourcePostId)) continue;

      // Validate target post exists and is accessible.
      const targetPost = await ctx.db.get(candidate.targetPostId);
      if (!targetPost) continue;
      if (targetPost.status === "deleted") continue;
      if (targetPost.status === "draft" || targetPost.status === "uploading") continue;
      if (targetPost.status !== "published") continue;
      if (postShouldOmitFromAllSurfaces(targetPost)) continue;
      if (postHiddenFromNonOwner(targetPost, viewerUserId)) continue;

      // Basic block check: do not show cards to users who are blocked by or
      // have blocked the target post's author.
      if (viewerUserId) {
        const targetUserId = targetPost.userId;
        if (String(viewerUserId) !== String(targetUserId)) {
          const block = await ctx.db
            .query("userBlocks")
            .withIndex("by_blocker_blocked", (q) =>
              q.eq("blockerId", viewerUserId).eq("blockedId", targetUserId),
            )
            .first();
          if (block) continue;

          const reverseBlock = await ctx.db
            .query("userBlocks")
            .withIndex("by_blocker_blocked", (q) =>
              q.eq("blockerId", targetUserId).eq("blockedId", viewerUserId),
            )
            .first();
          if (reverseBlock) continue;
        }
      }

      // Validate target media exists if mediaId is specified.
      if (candidate.targetMediaId) {
        const targetMedia = await ctx.db.get(candidate.targetMediaId);
        if (!targetMedia) continue;
        if (targetMedia.postId !== candidate.targetPostId) continue;
      } else {
        // Verify the target post has at least one video media.
        const anyMedia = await ctx.db
          .query("postMedia")
          .withIndex("by_post", (q) => q.eq("postId", candidate.targetPostId))
          .filter((q) => q.eq(q.field("type"), "video"))
          .first();
        if (!anyMedia) continue;
      }

      // Valid card found.
      return {
        candidateId: candidate._id,
        targetPostId: candidate.targetPostId,
        targetMediaId: candidate.targetMediaId,
        title: candidate.title,
        subtitle: candidate.subtitle,
        matchType: candidate.matchType,
        confidenceScore: candidate.confidenceScore,
        triggerStartMs: candidate.triggerStartMs,
        triggerEndMs: candidate.triggerEndMs,
      };
    }

    return null;
  },
});
