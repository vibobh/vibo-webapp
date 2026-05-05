import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Bump this when the matching algorithm changes significantly. */
export const CURRENT_MATCHING_VERSION = 1;

/** Minimum confidence score to store a candidate (inclusive). */
export const CONFIDENCE_MIN_STORE = 0.85;

/** Minimum confidence score for "candidate" status (vs "needs_review"). */
export const CONFIDENCE_MIN_CANDIDATE = 0.95;

// ---------------------------------------------------------------------------
// Internal queries
// ---------------------------------------------------------------------------

export const getCompletedJobs = internalQuery({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contentIntelligence")
      .withIndex("by_processingStatus", (q) =>
        q.eq("processingStatus", "completed"),
      )
      .order("desc")
      .take(args.limit ?? 200);
  },
});

export const getJobById = internalQuery({
  args: { jobId: v.id("contentIntelligence") },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});

export const findExistingCandidate = internalQuery({
  args: {
    sourceContentId: v.id("contentIntelligence"),
    targetContentId: v.id("contentIntelligence"),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contextCardCandidates")
      .withIndex("by_sourceContentId", (q) =>
        q.eq("sourceContentId", args.sourceContentId),
      )
      .filter((q) =>
        q.eq(q.field("targetContentId"), args.targetContentId),
      )
      .first();
  },
});

export const getCandidatesNeedingMatch = internalQuery({
  args: { limit: v.optional(v.number()) },
  returns: v.any(),
  handler: async (ctx, args) => {
    // Returns recently completed intelligence records that may not yet have
    // had context matching triggered (e.g. worker missed the in-line trigger).
    // Used by the cron safety-net.
    return await ctx.db
      .query("contentIntelligence")
      .withIndex("by_processingStatus", (q) =>
        q.eq("processingStatus", "completed"),
      )
      .order("desc")
      .take(args.limit ?? 20);
  },
});

// ---------------------------------------------------------------------------
// Internal mutations
// ---------------------------------------------------------------------------

export const upsertCandidate = internalMutation({
  args: {
    sourceContentId: v.id("contentIntelligence"),
    sourcePostId: v.id("posts"),
    sourceMediaId: v.optional(v.id("postMedia")),
    targetContentId: v.id("contentIntelligence"),
    targetPostId: v.id("posts"),
    targetMediaId: v.optional(v.id("postMedia")),
    title: v.string(),
    subtitle: v.optional(v.string()),
    reason: v.string(),
    matchType: v.union(
      v.literal("referenced_item"),
      v.literal("entity"),
      v.literal("topic"),
      v.literal("semantic"),
      v.literal("combined"),
    ),
    confidenceScore: v.number(),
    evidence: v.array(
      v.object({
        sourceField: v.string(),
        sourceText: v.string(),
        targetField: v.string(),
        targetText: v.string(),
        confidence: v.number(),
      }),
    ),
    triggerStartMs: v.optional(v.number()),
    triggerEndMs: v.optional(v.number()),
    status: v.union(
      v.literal("candidate"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("needs_review"),
    ),
    processingVersion: v.number(),
  },
  returns: v.union(v.id("contextCardCandidates"), v.null()),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("contextCardCandidates")
      .withIndex("by_sourceContentId", (q) =>
        q.eq("sourceContentId", args.sourceContentId),
      )
      .filter((q) =>
        q.eq(q.field("targetContentId"), args.targetContentId),
      )
      .first();

    if (existing) {
      // Only update if new confidence is strictly higher.
      if (args.confidenceScore <= existing.confidenceScore) return null;
      await ctx.db.patch(existing._id, {
        title: args.title,
        subtitle: args.subtitle,
        reason: args.reason,
        matchType: args.matchType,
        confidenceScore: args.confidenceScore,
        evidence: args.evidence,
        triggerStartMs: args.triggerStartMs,
        triggerEndMs: args.triggerEndMs,
        status: args.status,
        processingVersion: args.processingVersion,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("contextCardCandidates", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// ---------------------------------------------------------------------------
// Admin / debug: public queries (read-only, internal-only in production)
// ---------------------------------------------------------------------------

export const listBySourcePostId = internalQuery({
  args: {
    sourcePostId: v.id("posts"),
    limit: v.optional(v.number()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contextCardCandidates")
      .withIndex("by_sourcePostId", (q) =>
        q.eq("sourcePostId", args.sourcePostId),
      )
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const listByTargetPostId = internalQuery({
  args: {
    targetPostId: v.id("posts"),
    limit: v.optional(v.number()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contextCardCandidates")
      .withIndex("by_targetPostId", (q) =>
        q.eq("targetPostId", args.targetPostId),
      )
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const listByStatus = internalQuery({
  args: {
    status: v.union(
      v.literal("candidate"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("needs_review"),
    ),
    limit: v.optional(v.number()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contextCardCandidates")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .order("desc")
      .take(args.limit ?? 100);
  },
});

// ---------------------------------------------------------------------------
// Admin / debug: mutations (intended for use via Convex dashboard / admin CLI)
// ---------------------------------------------------------------------------

export const approveCandidate = internalMutation({
  args: { candidateId: v.id("contextCardCandidates") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const candidate = await ctx.db.get(args.candidateId);
    if (!candidate) throw new Error("Candidate not found");
    await ctx.db.patch(args.candidateId, {
      status: "approved",
      rejectionReason: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const rejectCandidate = internalMutation({
  args: {
    candidateId: v.id("contextCardCandidates"),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const candidate = await ctx.db.get(args.candidateId);
    if (!candidate) throw new Error("Candidate not found");
    await ctx.db.patch(args.candidateId, {
      status: "rejected",
      rejectionReason: args.reason.trim().slice(0, 500),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const markNeedsReview = internalMutation({
  args: { candidateId: v.id("contextCardCandidates") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const candidate = await ctx.db.get(args.candidateId);
    if (!candidate) throw new Error("Candidate not found");
    await ctx.db.patch(args.candidateId, {
      status: "needs_review",
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const deleteCandidate = internalMutation({
  args: { candidateId: v.id("contextCardCandidates") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.delete(args.candidateId);
    return null;
  },
});

// ---------------------------------------------------------------------------
// Public-facing debug queries (for admin tooling only — not exposed to clients)
// These use `query` so they can be called from external admin tools via Convex
// dashboard. In production, restrict these at the routing/auth layer.
// ---------------------------------------------------------------------------

export const adminListBySourcePost = query({
  args: {
    sourcePostId: v.id("posts"),
    limit: v.optional(v.number()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contextCardCandidates")
      .withIndex("by_sourcePostId", (q) =>
        q.eq("sourcePostId", args.sourcePostId),
      )
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const adminListByTargetPost = query({
  args: {
    targetPostId: v.id("posts"),
    limit: v.optional(v.number()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contextCardCandidates")
      .withIndex("by_targetPostId", (q) =>
        q.eq("targetPostId", args.targetPostId),
      )
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const adminListByStatus = query({
  args: {
    status: v.union(
      v.literal("candidate"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("needs_review"),
    ),
    limit: v.optional(v.number()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contextCardCandidates")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .order("desc")
      .take(args.limit ?? 100);
  },
});

export const adminApproveCandidate = mutation({
  args: { candidateId: v.id("contextCardCandidates") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const candidate = await ctx.db.get(args.candidateId);
    if (!candidate) throw new Error("Candidate not found");
    await ctx.db.patch(args.candidateId, {
      status: "approved",
      rejectionReason: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const adminRejectCandidate = mutation({
  args: {
    candidateId: v.id("contextCardCandidates"),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const candidate = await ctx.db.get(args.candidateId);
    if (!candidate) throw new Error("Candidate not found");
    await ctx.db.patch(args.candidateId, {
      status: "rejected",
      rejectionReason: args.reason.trim().slice(0, 500),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const adminMarkNeedsReview = mutation({
  args: { candidateId: v.id("contextCardCandidates") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const candidate = await ctx.db.get(args.candidateId);
    if (!candidate) throw new Error("Candidate not found");
    await ctx.db.patch(args.candidateId, {
      status: "needs_review",
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const adminDeleteCandidate = mutation({
  args: { candidateId: v.id("contextCardCandidates") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.delete(args.candidateId);
    return null;
  },
});
