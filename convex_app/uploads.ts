import { v } from "convex/values";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { assertUserCanMutate } from "./accountModeration";
import { action, internalAction, mutation, query } from "./_generated/server";

// ============================================
// TYPES
// ============================================

export interface UploadUrlResponse {
  mediaId: Id<"postMedia">;
  uploadUrl: string;
  storageId: Id<"_storage">;
}

// ============================================
// UPLOAD URL GENERATION
// ============================================

/**
 * Generate upload URLs for post media
 * Called when user is ready to upload selected media
 */
export const generateUploadUrls = mutation({
  args: {
    postId: v.id("posts"),
    mediaItems: v.array(
      v.object({
        type: v.union(v.literal("image"), v.literal("video")),
        position: v.number(),
        fileName: v.string(),
        mimeType: v.string(),
        fileSize: v.number(),
        width: v.optional(v.number()),
        height: v.optional(v.number()),
        durationMs: v.optional(v.number()),
      }),
    ),
  },
  returns: v.array(
    v.object({
      mediaId: v.id("postMedia"),
      storageId: v.id("_storage"),
    }),
  ),
  handler: async (ctx, args) => {
    const userId = (ctx as any).userId as Id<"users"> | undefined;
    if (!userId) throw new Error("Unauthorized");
    await assertUserCanMutate(ctx, userId);

    // Verify post exists and belongs to user
    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error("Post not found");
    if (post.userId !== userId) throw new Error("Unauthorized");

    const now = Date.now();
    const results: { mediaId: Id<"postMedia">; storageId: Id<"_storage"> }[] =
      [];

    for (const item of args.mediaItems) {
      // Generate a storage ID placeholder
      // In production, this would generate presigned S3 URLs
      const storageId = await ctx.storage.generateUploadUrl();

      // Create media record
      const mediaId = await ctx.db.insert("postMedia", {
        postId: args.postId,
        type: item.type,
        position: item.position,
        originalStorageId: storageId as unknown as Id<"_storage">,
        displayUrl: "", // Will be populated after processing
        thumbnailUrl: undefined,
        width: item.width,
        height: item.height,
        durationMs: item.durationMs,
        processingStatus: "uploading",
        createdAt: now,
      });

      results.push({
        mediaId,
        storageId: storageId as unknown as Id<"_storage">,
      });
    }

    // Update post status to uploading
    await ctx.db.patch(args.postId, {
      status: "uploading",
      mediaCount: args.mediaItems.length,
      updatedAt: now,
    });

    // Create upload session for tracking
    await ctx.db.insert("uploadSessions", {
      userId,
      postId: args.postId,
      mediaCount: args.mediaItems.length,
      status: "active",
      expiresAt: now + 24 * 60 * 60 * 1000, // 24 hours
      createdAt: now,
    });

    return results;
  },
});

/**
 * Mark media upload as complete
 * Called after client finishes uploading to storage
 */
export const markUploadComplete = mutation({
  args: {
    mediaId: v.id("postMedia"),
    storageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const userId = (ctx as any).userId as Id<"users"> | undefined;
    if (!userId) throw new Error("Unauthorized");
    await assertUserCanMutate(ctx, userId);

    const media = await ctx.db.get(args.mediaId);
    if (!media) throw new Error("Media not found");

    // Verify ownership through post
    const post = await ctx.db.get(media.postId);
    if (!post || post.userId !== userId) throw new Error("Unauthorized");

    // Update media status to processing
    await ctx.db.patch(args.mediaId, {
      processingStatus: "processing",
      originalStorageId: args.storageId,
    });

    // Schedule media processing
    await ctx.scheduler.runAfter(0, api.uploads.processMedia, {
      userId,
      mediaId: args.mediaId,
      storageId: args.storageId,
    });

    return null;
  },
});

/**
 * Mark all media complete and transition to processing
 */
export const finalizeUpload = mutation({
  args: {
    postId: v.id("posts"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const userId = (ctx as any).userId as Id<"users"> | undefined;
    if (!userId) throw new Error("Unauthorized");
    await assertUserCanMutate(ctx, userId);

    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error("Post not found");
    if (post.userId !== userId) throw new Error("Unauthorized");

    // Check all media status
    const media = await ctx.db
      .query("postMedia")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();

    const allUploaded = media.every((m) =>
      ["processing", "completed"].includes(m.processingStatus),
    );

    if (allUploaded) {
      await ctx.db.patch(args.postId, {
        status: "processing",
        updatedAt: Date.now(),
      });

      // Check if already complete
      const allCompleted = media.every(
        (m) => m.processingStatus === "completed",
      );
      if (allCompleted) {
        await ctx.scheduler.runAfter(0, api.posts.publishPost, {
          userId,
          postId: args.postId,
        });
      }
    }

    return null;
  },
});

// ============================================
// ACTIONS - Media Processing
// ============================================

/**
 * Process uploaded media (images and videos)
 * Runs as an action for longer processing
 */
export const processMedia = action({
  args: {
    userId: v.id("users"),
    mediaId: v.id("postMedia"),
    storageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    // This would integrate with your media processing pipeline
    // For example, using AWS Lambda or a similar service

    // For now, simulate processing and mark as complete
    // In production, you would:
    // 1. Download from storage
    // 2. Generate thumbnails
    // 3. Compress/optimize
    // 4. Upload processed versions
    // 5. Update media record

    await ctx.runMutation(api.uploads.updateMediaAfterProcessing, {
      mediaId: args.mediaId,
      displayUrl: `https://cdn.joinvibo.com/media/${args.storageId}/display`,
      thumbnailUrl: `https://cdn.joinvibo.com/media/${args.storageId}/thumbnail`,
      processingStatus: "completed",
    });

    // Check if all media for this post is complete
    const postId = await ctx.runQuery(api.uploads.getMediaPostId, {
      mediaId: args.mediaId,
    });
    if (postId) {
      await ctx.runMutation(api.posts.publishPost, {
        userId: args.userId,
        postId,
      });
    }

    return null;
  },
});

// ============================================
// INTERNALS
// ============================================

/**
 * Internal: Update media after processing
 */
export const updateMediaAfterProcessing = mutation({
  args: {
    mediaId: v.id("postMedia"),
    displayUrl: v.string(),
    thumbnailUrl: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    processingStatus: v.union(
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const update: any = {
      displayUrl: args.displayUrl,
      processingStatus: args.processingStatus,
    };

    if (args.thumbnailUrl) update.thumbnailUrl = args.thumbnailUrl;
    if (args.width) update.width = args.width;
    if (args.height) update.height = args.height;
    if (args.processingStatus === "completed") {
      update.processedAt = Date.now();
    }

    await ctx.db.patch(args.mediaId, update);
    return null;
  },
});

/**
 * Get post ID for a media item (internal query)
 */
export const getMediaPostId = query({
  args: {
    mediaId: v.id("postMedia"),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const media = await ctx.db.get(args.mediaId);
    return media?.postId;
  },
});

/**
 * Cleanup old upload sessions
 * Should be run periodically
 */
export const cleanupOldUploadSessions = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const now = Date.now();
    const expiryCutoff = now - 24 * 60 * 60 * 1000; // 24 hours old

    const oldSessions = await ctx.runQuery(api.uploads.getExpiredSessions, {
      expiresAt: expiryCutoff,
    });

    for (const session of oldSessions) {
      // Mark as abandoned
      await ctx.runMutation(api.uploads.markSessionAbandoned, {
        sessionId: session._id,
      });

      // If has associated post, mark as failed
      if (session.postId && session.userId) {
        await ctx.runMutation(api.posts.publishPost, {
          userId: session.userId,
          postId: session.postId,
        });
      }
    }

    return null;
  },
});

/**
 * Get expired upload sessions
 */
export const getExpiredSessions = query({
  args: {
    expiresAt: v.number(),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("uploadSessions")
      .withIndex("by_expires", (q) => q.lt("expiresAt", args.expiresAt))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();
  },
});

/**
 * Mark upload session as abandoned
 */
export const markSessionAbandoned = mutation({
  args: {
    sessionId: v.id("uploadSessions"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await ctx.db.patch(args.sessionId, {
      status: "abandoned",
    });
    return null;
  },
});

/**
 * Get upload session status
 */
export const getUploadSession = query({
  args: {
    sessionId: v.id("uploadSessions"),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const userId = (ctx as any).userId as Id<"users"> | undefined;
    if (!userId) return undefined;

    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== userId) return undefined;

    return session;
  },
});
