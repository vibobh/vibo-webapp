/**
 * Draft Uploads — DB-only mutations / queries (V8 runtime).
 *
 * Convex requires that files using `"use node"` (for AWS SDK calls) contain
 * ONLY actions. The mutations and queries that touch `ctx.db` live here so
 * they can run on the V8 runtime, while `convex/draftUploads.ts` houses the
 * S3-touching actions that delegate to these via `ctx.runMutation`.
 */

import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";

/** Drafts older than this without reaching `published` are cleaned up. */
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

const DRAFT_UPLOAD_DOC_VALIDATOR = v.object({
  _id: v.id("draftUploads"),
  _creationTime: v.number(),
  uploadId: v.string(),
  userId: v.id("users"),
  composerSessionId: v.string(),
  mediaType: v.union(v.literal("image"), v.literal("video")),
  fileType: v.string(),
  s3Key: v.string(),
  s3Region: v.optional(v.string()),
  thumbnailKey: v.optional(v.string()),
  thumbnailRegion: v.optional(v.string()),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  durationMs: v.optional(v.number()),
  hasAudioTrack: v.optional(v.boolean()),
  status: v.union(
    v.literal("draft_uploading"),
    v.literal("draft_uploaded"),
    v.literal("published"),
    v.literal("failed"),
    v.literal("cancelled"),
  ),
  error: v.optional(v.string()),
  createdAt: v.number(),
  expiresAt: v.number(),
});

export const _internalGetDraftByUploadId = query({
  args: { uploadId: v.string() },
  returns: v.union(DRAFT_UPLOAD_DOC_VALIDATOR, v.null()),
  handler: async (ctx, { uploadId }) => {
    const row = await ctx.db
      .query("draftUploads")
      .withIndex("by_uploadId", (q) => q.eq("uploadId", uploadId))
      .first();
    return row;
  },
});

export const _internalUpsertDraftUploading = mutation({
  args: {
    userId: v.id("users"),
    uploadId: v.string(),
    composerSessionId: v.string(),
    mediaType: v.union(v.literal("image"), v.literal("video")),
    fileType: v.string(),
    s3Key: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const existing = await ctx.db
      .query("draftUploads")
      .withIndex("by_uploadId", (q) => q.eq("uploadId", args.uploadId))
      .first();
    const now = Date.now();
    if (existing) {
      if (existing.userId !== args.userId) throw new Error("Unauthorized");
      await ctx.db.patch(existing._id, {
        s3Key: args.s3Key,
        status: "draft_uploading",
        error: undefined,
        expiresAt: now + DRAFT_TTL_MS,
      });
      return null;
    }
    await ctx.db.insert("draftUploads", {
      uploadId: args.uploadId,
      userId: args.userId,
      composerSessionId: args.composerSessionId,
      mediaType: args.mediaType,
      fileType: args.fileType,
      s3Key: args.s3Key,
      status: "draft_uploading",
      createdAt: now,
      expiresAt: now + DRAFT_TTL_MS,
    });
    return null;
  },
});

export const _internalAttachThumbnailKey = mutation({
  args: {
    userId: v.id("users"),
    uploadId: v.string(),
    thumbnailKey: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const row = await ctx.db
      .query("draftUploads")
      .withIndex("by_uploadId", (q) => q.eq("uploadId", args.uploadId))
      .first();
    if (!row) throw new Error("Draft upload not found");
    if (row.userId !== args.userId) throw new Error("Unauthorized");
    await ctx.db.patch(row._id, { thumbnailKey: args.thumbnailKey });
    return null;
  },
});

export const markDraftUploadSucceeded = mutation({
  args: {
    userId: v.id("users"),
    uploadId: v.string(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    hasAudioTrack: v.optional(v.boolean()),
    s3Region: v.optional(v.string()),
    thumbnailRegion: v.optional(v.string()),
    trimStartMs: v.optional(v.number()),
    trimEndMs: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const row = await ctx.db
      .query("draftUploads")
      .withIndex("by_uploadId", (q) => q.eq("uploadId", args.uploadId))
      .first();
    if (!row) throw new Error("Draft upload not found");
    if (row.userId !== args.userId) throw new Error("Unauthorized");
    if (row.status === "published" || row.status === "cancelled") {
      return null;
    }
    await ctx.db.patch(row._id, {
      status: "draft_uploaded",
      ...(args.width != null ? { width: args.width } : {}),
      ...(args.height != null ? { height: args.height } : {}),
      ...(args.durationMs != null ? { durationMs: args.durationMs } : {}),
      ...(args.hasAudioTrack != null
        ? { hasAudioTrack: args.hasAudioTrack }
        : {}),
      ...(args.s3Region ? { s3Region: args.s3Region } : {}),
      ...(args.thumbnailRegion
        ? { thumbnailRegion: args.thumbnailRegion }
        : {}),
      ...(args.trimStartMs != null ? { trimStartMs: args.trimStartMs } : {}),
      ...(args.trimEndMs != null ? { trimEndMs: args.trimEndMs } : {}),
      error: undefined,
    });
    return null;
  },
});

export const markDraftUploadFailed = mutation({
  args: {
    userId: v.id("users"),
    uploadId: v.string(),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const row = await ctx.db
      .query("draftUploads")
      .withIndex("by_uploadId", (q) => q.eq("uploadId", args.uploadId))
      .first();
    if (!row) return null;
    if (row.userId !== args.userId) throw new Error("Unauthorized");
    if (row.status === "published") return null;
    await ctx.db.patch(row._id, {
      status: "failed",
      error: args.error.slice(0, 500),
    });
    return null;
  },
});

export const cancelDraftUploads = mutation({
  args: {
    userId: v.id("users"),
    uploadIds: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    for (const uploadId of args.uploadIds) {
      const row = await ctx.db
        .query("draftUploads")
        .withIndex("by_uploadId", (q) => q.eq("uploadId", uploadId))
        .first();
      if (!row) continue;
      if (row.userId !== args.userId) continue;
      if (row.status === "published") continue;
      await ctx.db.patch(row._id, {
        status: "cancelled",
        expiresAt: Date.now(),
      });
    }
    return null;
  },
});

export const _internalMarkDraftsPublished = mutation({
  args: {
    userId: v.id("users"),
    uploadIds: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    for (const uploadId of args.uploadIds) {
      const row = await ctx.db
        .query("draftUploads")
        .withIndex("by_uploadId", (q) => q.eq("uploadId", uploadId))
        .first();
      if (!row) continue;
      if (row.userId !== args.userId) continue;
      await ctx.db.patch(row._id, { status: "published" });
    }
    return null;
  },
});

export const _internalListExpiredDrafts = query({
  args: { now: v.number(), limit: v.number() },
  returns: v.object({
    orphans: v.array(DRAFT_UPLOAD_DOC_VALIDATOR),
    publishedToReap: v.array(DRAFT_UPLOAD_DOC_VALIDATOR),
  }),
  handler: async (ctx, { now, limit }) => {
    const orphans: Doc<"draftUploads">[] = [];
    const publishedToReap: Doc<"draftUploads">[] = [];
    const orphanStatuses = [
      "draft_uploading",
      "draft_uploaded",
      "failed",
      "cancelled",
    ] as const;
    for (const status of orphanStatuses) {
      if (orphans.length >= limit) break;
      const rows = await ctx.db
        .query("draftUploads")
        .withIndex("by_status_expiresAt", (q) =>
          q.eq("status", status).lt("expiresAt", now),
        )
        .take(limit - orphans.length);
      orphans.push(...rows);
    }
    if (publishedToReap.length < limit) {
      const rows = await ctx.db
        .query("draftUploads")
        .withIndex("by_status_expiresAt", (q) =>
          q.eq("status", "published").lt("expiresAt", now),
        )
        .take(limit - publishedToReap.length);
      publishedToReap.push(...rows);
    }
    return { orphans, publishedToReap };
  },
});

export const _internalDeleteDraftRow = internalMutation({
  args: { id: v.id("draftUploads") },
  returns: v.null(),
  handler: async (ctx, { id }): Promise<null> => {
    await ctx.db.delete(id);
    return null;
  },
});
