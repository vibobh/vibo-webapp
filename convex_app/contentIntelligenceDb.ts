import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CURRENT_PROCESSING_VERSION = "context_engine_v1";

const CONFIDENCE_THRESHOLD = 0.3;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const getPendingJobs = internalQuery({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contentIntelligence")
      .withIndex("by_processingStatus", (q) =>
        q.eq("processingStatus", "pending"),
      )
      .order("asc")
      .take(args.limit ?? 10);
  },
});

export const getByContentId = internalQuery({
  args: { contentId: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contentIntelligence")
      .withIndex("by_contentId", (q) => q.eq("contentId", args.contentId))
      .first();
  },
});

export const getBySourcePostId = internalQuery({
  args: { sourcePostId: v.id("posts") },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contentIntelligence")
      .withIndex("by_sourcePostId", (q) =>
        q.eq("sourcePostId", args.sourcePostId),
      )
      .first();
  },
});

export const getJobById = internalQuery({
  args: { jobId: v.id("contentIntelligence") },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});

export const getFailedJobs = internalQuery({
  args: { limit: v.optional(v.number()) },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contentIntelligence")
      .withIndex("by_processingStatus", (q) =>
        q.eq("processingStatus", "failed"),
      )
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const getCompletedByContentId = internalQuery({
  args: { contentId: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("contentIntelligence")
      .withIndex("by_contentId", (q) => q.eq("contentId", args.contentId))
      .first();
    if (!record || record.processingStatus !== "completed") return null;
    return record;
  },
});

export const getPost = internalQuery({
  args: { postId: v.id("posts") },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.postId);
  },
});

export const getPostMedia = internalQuery({
  args: { postId: v.id("posts") },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("postMedia")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();
  },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export const createPendingJob = internalMutation({
  args: {
    contentId: v.string(),
    contentType: v.union(
      v.literal("video"),
      v.literal("image"),
      v.literal("carousel"),
      v.literal("post"),
    ),
    ownerUserId: v.id("users"),
    sourcePostId: v.id("posts"),
    mediaId: v.optional(v.id("postMedia")),
    processingVersion: v.string(),
  },
  returns: v.id("contentIntelligence"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("contentIntelligence")
      .withIndex("by_sourcePostId", (q) =>
        q.eq("sourcePostId", args.sourcePostId),
      )
      .first();

    if (existing) {
      if (
        existing.processingStatus === "completed" &&
        existing.processingVersion === args.processingVersion
      ) {
        return existing._id;
      }
      const now = Date.now();
      await ctx.db.patch(existing._id, {
        processingStatus: "pending",
        processingVersion: args.processingVersion,
        mediaId: args.mediaId,
        errorMessage: undefined,
        retryCount: (existing.retryCount ?? 0) + 1,
        updatedAt: now,
      });
      return existing._id;
    }

    const now = Date.now();
    return await ctx.db.insert("contentIntelligence", {
      contentId: args.contentId,
      contentType: args.contentType,
      ownerUserId: args.ownerUserId,
      sourcePostId: args.sourcePostId,
      mediaId: args.mediaId,
      processingStatus: "pending",
      processingVersion: args.processingVersion,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const markProcessing = internalMutation({
  args: { jobId: v.id("contentIntelligence") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.processingStatus !== "pending") return false;
    await ctx.db.patch(args.jobId, {
      processingStatus: "processing",
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const markCompleted = internalMutation({
  args: {
    jobId: v.id("contentIntelligence"),
    detectedLanguage: v.optional(v.string()),
    transcriptText: v.optional(v.string()),
    transcriptSegments: v.optional(
      v.array(
        v.object({
          startMs: v.number(),
          endMs: v.number(),
          text: v.string(),
          confidence: v.number(),
        }),
      ),
    ),
    aiSummary: v.optional(v.string()),
    visualSummary: v.optional(v.string()),
    topics: v.optional(
      v.array(
        v.object({
          label: v.string(),
          confidence: v.number(),
        }),
      ),
    ),
    entities: v.optional(
      v.array(
        v.object({
          type: v.union(
            v.literal("person"),
            v.literal("place"),
            v.literal("organization"),
            v.literal("brand"),
            v.literal("product"),
            v.literal("event"),
            v.literal("object"),
            v.literal("date"),
            v.literal("other"),
          ),
          label: v.string(),
          normalizedLabel: v.string(),
          confidence: v.number(),
          source: v.union(
            v.literal("transcript"),
            v.literal("visual"),
            v.literal("caption"),
            v.literal("hashtags"),
            v.literal("combined"),
          ),
        }),
      ),
    ),
    referencedItems: v.optional(
      v.array(
        v.object({
          label: v.string(),
          normalizedLabel: v.string(),
          type: v.string(),
          reason: v.string(),
          confidence: v.number(),
          evidenceText: v.string(),
          startMs: v.optional(v.number()),
          endMs: v.optional(v.number()),
        }),
      ),
    ),
    embeddingText: v.optional(v.string()),
    embeddingModel: v.optional(v.string()),
    embeddingVectorId: v.optional(v.string()),
    confidenceOverall: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { jobId, ...data } = args;
    const now = Date.now();

    const status: "completed" | "needs_review" =
      data.confidenceOverall < CONFIDENCE_THRESHOLD
        ? "needs_review"
        : "completed";

    await ctx.db.patch(jobId, {
      ...data,
      processingStatus: status,
      processedAt: now,
      updatedAt: now,
    });

    // Trigger Phase 2 context matching asynchronously, but only when the job
    // actually reached "completed" (not "needs_review" due to low confidence).
    if (status === "completed") {
      await ctx.scheduler.runAfter(
        0,
        internal.contextMatching.runContextMatching,
        { sourceJobId: jobId },
      );
    }

    return null;
  },
});

export const markFailed = internalMutation({
  args: {
    jobId: v.id("contentIntelligence"),
    errorMessage: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      processingStatus: "failed",
      errorMessage: args.errorMessage,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const markNeedsReview = internalMutation({
  args: {
    jobId: v.id("contentIntelligence"),
    errorMessage: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      processingStatus: "needs_review",
      ...(args.errorMessage ? { errorMessage: args.errorMessage } : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});
