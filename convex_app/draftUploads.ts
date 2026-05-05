"use node";

/**
 * Draft Uploads — Node.js actions (S3-touching).
 *
 * Mutations + queries that touch `ctx.db` live in `draftUploadsDb.ts` so
 * they run on the V8 runtime; this file holds only AWS-SDK actions and
 * the cleanup cron (which calls AWS DELETE).
 *
 * Lifecycle (overview):
 *   1. `generateDraftUploadUrl` — presigns S3 PUT, inserts/upserts a
 *      `draftUploads` row at status `draft_uploading`.
 *   2. Client PUTs bytes directly to S3 (key under `posts-pending/...`).
 *   3. Client calls `markDraftUploadSucceeded` (in `draftUploadsDb.ts`).
 *   4. Share → `publishFromDrafts` here: reuses the SAME s3Key (no S3
 *      CopyObject), creates the post, links media, publishes, and flips
 *      draft rows to `published`.
 *   5. `cleanupExpiredDraftUploads` (cron) sweeps orphans on a 24 h TTL.
 */

import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v } from "convex/values";
import { randomUUID } from "node:crypto";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalAction } from "./_generated/server";
import {
  ALLOWED_MIME_TYPES,
  getDualRegionUploadTargets,
  getFileExtensionFromMimeType,
  getS3ClientForRegion,
} from "./media";
import { resolvePublicMediaUrl } from "./mediaUrl";

const PRESIGN_EXPIRES_IN_SECONDS = 600;

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function buildDraftKey(args: {
  userId: string;
  uploadId: string;
  fileExtension: string;
  isThumbnail?: boolean;
}): string {
  const ts = Date.now();
  const unique = randomUUID();
  const prefix = args.isThumbnail ? "thumb-" : "";
  return `posts-pending/${args.userId}/${args.uploadId}/${prefix}${ts}-${unique}.${args.fileExtension}`;
}

async function presignPutForAllRegions(
  key: string,
  contentType: string,
): Promise<{
  uploadUrl: string;
  fallbackUploadUrls?: string[];
  uploadRegions: string[];
}> {
  const targets = getDualRegionUploadTargets();
  const signedUrls = await Promise.all(
    targets.map(async (t) => {
      const command = new PutObjectCommand({
        Bucket: t.bucket,
        Key: key,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      });
      return getSignedUrl(getS3ClientForRegion(t.region), command, {
        expiresIn: PRESIGN_EXPIRES_IN_SECONDS,
      });
    }),
  );
  return {
    uploadUrl: signedUrls[0],
    fallbackUploadUrls:
      signedUrls.length > 1 ? signedUrls.slice(1) : undefined,
    uploadRegions: targets.map((t) => t.region),
  };
}

/**
 * Best-effort delete of an S3 object across all configured upload buckets
 * (primary + EU + US replicas). We don't know which bucket owns the object,
 * so we DELETE in each region — `NoSuchKey` is silently ignored by S3.
 */
async function deleteFromAllRegions(key: string): Promise<void> {
  const targets = getDualRegionUploadTargets();
  await Promise.allSettled(
    targets.map((t) =>
      getS3ClientForRegion(t.region).send(
        new DeleteObjectCommand({ Bucket: t.bucket, Key: key }),
      ),
    ),
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Public actions
// ────────────────────────────────────────────────────────────────────────────

export const generateDraftUploadUrl = action({
  args: {
    userId: v.id("users"),
    uploadId: v.string(),
    composerSessionId: v.string(),
    mediaType: v.union(v.literal("image"), v.literal("video")),
    fileType: v.string(),
    /** Set true for the sibling thumbnail PUT of a video draft. */
    isThumbnail: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    uploadUrl: string;
    key: string;
    expiresInSeconds: number;
    fallbackUploadUrls?: string[];
    uploadRegions: string[];
  }> => {
    const { userId, uploadId, composerSessionId, mediaType, fileType } = args;
    const normalized = fileType.trim().toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(normalized)) {
      throw new Error("Unsupported file type");
    }

    const user = await ctx.runQuery(internal.users.getUserDocInternal, {
      id: userId,
    });
    if (!user) throw new Error("Invalid session");

    const mod = await ctx.runQuery(api.users.getAccountModeration, {
      userId: user._id,
    });
    if (!mod || mod.accountStatus !== "active") {
      throw new Error("Account restricted");
    }

    const fileExtension = getFileExtensionFromMimeType(normalized);
    const key = buildDraftKey({
      userId: String(user._id),
      uploadId,
      fileExtension,
      isThumbnail: !!args.isThumbnail,
    });

    const presigned = await presignPutForAllRegions(key, normalized);

    if (args.isThumbnail) {
      await ctx.runMutation(api.draftUploadsDb._internalAttachThumbnailKey, {
        userId: user._id,
        uploadId,
        thumbnailKey: key,
      });
    } else {
      await ctx.runMutation(api.draftUploadsDb._internalUpsertDraftUploading, {
        userId: user._id,
        uploadId,
        composerSessionId,
        mediaType,
        fileType: normalized,
        s3Key: key,
      });
    }

    return {
      uploadUrl: presigned.uploadUrl,
      key,
      expiresInSeconds: PRESIGN_EXPIRES_IN_SECONDS,
      fallbackUploadUrls: presigned.fallbackUploadUrls,
      uploadRegions: presigned.uploadRegions,
    };
  },
});

/**
 * Atomic Share commit. Creates the post, links the already-uploaded media
 * (no S3 CopyObject — keys are reused), publishes, and flips draft rows.
 */
export const publishFromDrafts = action({
  args: {
    userId: v.id("users"),
    uploadIds: v.array(v.string()),
    caption: v.optional(v.string()),
    locationName: v.optional(v.string()),
    locationId: v.optional(v.string()),
    locationLat: v.optional(v.number()),
    locationLng: v.optional(v.number()),
    visibility: v.optional(
      v.union(
        v.literal("public"),
        v.literal("followers_only"),
        v.literal("close_friends"),
        v.literal("private"),
      ),
    ),
    tags: v.optional(
      v.array(
        v.object({
          taggedUserId: v.id("users"),
          x: v.optional(v.number()),
          y: v.optional(v.number()),
        }),
      ),
    ),
    perItem: v.array(
      v.object({
        uploadId: v.string(),
        position: v.number(),
        cropData: v.optional(
          v.object({
            x: v.number(),
            y: v.number(),
            width: v.number(),
            height: v.number(),
            scale: v.number(),
            aspectRatio: v.string(),
          }),
        ),
        filterApplied: v.optional(v.string()),
      }),
    ),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ postId: Id<"posts"> }> => {
    const { userId, uploadIds, perItem } = args;

    // 1. Load + validate every draft upload row.
    const drafts: Doc<"draftUploads">[] = [];
    for (const uploadId of uploadIds) {
      const row: Doc<"draftUploads"> | null = await ctx.runQuery(
        api.draftUploadsDb._internalGetDraftByUploadId,
        { uploadId },
      );
      if (!row) throw new Error(`Draft upload not found: ${uploadId}`);
      if (row.userId !== userId) throw new Error("Unauthorized");
      if (row.status !== "draft_uploaded") {
        throw new Error(
          `Draft ${uploadId} is in status ${row.status}; cannot publish`,
        );
      }
      drafts.push(row);
    }

    // 2. Create the post.
    const postId: Id<"posts"> = await ctx.runMutation(api.posts.createPost, {
      userId,
      caption: args.caption,
      locationName: args.locationName,
      locationId: args.locationId,
      locationLat: args.locationLat,
      locationLng: args.locationLng,
      visibility: args.visibility,
      commentsEnabled: true,
      likesVisible: true,
      dislikesVisible: true,
    });

    // 3. Link uploaded media — reuse keys verbatim, no CopyObject.
    const draftsByUploadId = new Map(drafts.map((d) => [d.uploadId, d]));
    const mediaInput = perItem
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((it) => {
        const d = draftsByUploadId.get(it.uploadId);
        if (!d) throw new Error(`perItem references missing uploadId`);
        const displayUrl = resolvePublicMediaUrl(
          d.s3Key,
          undefined,
          d.s3Region,
        );
        const thumbnailUrl = d.thumbnailKey
          ? resolvePublicMediaUrl(
              d.thumbnailKey,
              undefined,
              d.thumbnailRegion ?? d.s3Region,
            )
          : displayUrl;
        return {
          type: d.mediaType,
          position: it.position,
          displayUrl,
          ...(d.s3Region ? { displayStorageRegion: d.s3Region } : {}),
          thumbnailUrl,
          ...(d.thumbnailRegion ?? d.s3Region
            ? {
                thumbnailStorageRegion: d.thumbnailRegion ?? d.s3Region,
              }
            : {}),
          ...(d.width != null ? { width: d.width } : {}),
          ...(d.height != null ? { height: d.height } : {}),
          ...(d.durationMs != null ? { durationMs: d.durationMs } : {}),
          ...(d.hasAudioTrack != null
            ? { hasAudioTrack: d.hasAudioTrack }
            : {}),
          ...(it.cropData ? { cropData: it.cropData } : {}),
          ...(it.filterApplied ? { filterApplied: it.filterApplied } : {}),
        };
      });

    await ctx.runMutation(api.posts.addPostMedia, {
      userId,
      postId,
      media: mediaInput,
    });

    // 4. Tags (optional).
    if (args.tags && args.tags.length > 0) {
      await ctx.runMutation(api.posts.addPostTags, {
        userId,
        postId,
        tags: args.tags,
      });
    }

    // 5. Publish.
    await ctx.runMutation(api.posts.publishPost, { userId, postId });

    // 6. Flip draft rows to `published` so cleanup never touches their S3 keys.
    await ctx.runMutation(api.draftUploadsDb._internalMarkDraftsPublished, {
      userId,
      uploadIds,
    });

    return { postId };
  },
});

// ────────────────────────────────────────────────────────────────────────────
// Cleanup cron
// ────────────────────────────────────────────────────────────────────────────

export const cleanupExpiredDraftUploads = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const BATCH_LIMIT = 100;
    const now = Date.now();
    const { orphans, publishedToReap } = await ctx.runQuery(
      api.draftUploadsDb._internalListExpiredDrafts,
      { now, limit: BATCH_LIMIT },
    );
    if (orphans.length === 0 && publishedToReap.length === 0) return null;

    let s3Deleted = 0;
    let dbDeleted = 0;
    for (const row of orphans) {
      try {
        await deleteFromAllRegions(row.s3Key);
        if (row.thumbnailKey) {
          await deleteFromAllRegions(row.thumbnailKey);
        }
        s3Deleted++;
      } catch (e) {
        console.error("[draftUploads.cleanup] S3 delete failed", {
          uploadId: row.uploadId,
          err: String(e),
        });
        continue;
      }
      await ctx.runMutation(internal.draftUploadsDb._internalDeleteDraftRow, {
        id: row._id,
      });
      dbDeleted++;
    }
    for (const row of publishedToReap) {
      await ctx.runMutation(internal.draftUploadsDb._internalDeleteDraftRow, {
        id: row._id,
      });
      dbDeleted++;
    }
    console.log("[draftUploads.cleanup]", {
      orphans: orphans.length,
      published: publishedToReap.length,
      s3Deleted,
      dbDeleted,
    });
    return null;
  },
});
