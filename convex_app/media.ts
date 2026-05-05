"use node";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v } from "convex/values";
import { randomUUID } from "node:crypto";
import { api, internal } from "./_generated/api";
import { action } from "./_generated/server";
import {
  getDualRegionUploadTargets,
  isMiddleEastAwsRegion,
  resolvePrimaryS3BucketName,
} from "./mediaS3Config";
import { resolvePublicMediaUrl } from "./mediaUrl";

export const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "audio/mpeg",
  "audio/mp4",
  "audio/webm",
  "audio/ogg",
  "application/pdf",
]);

const MIME_EXTENSION_MAP: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "application/pdf": "pdf",
};

type UploadType =
  | "profile"
  | "banner"
  | "post"
  | "story"
  | "message"
  | "thumbnail";

function requireEnv(name: string): string {
  const value = (process.env[name] ?? "").trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** Legacy: primary bucket env or tier EU bucket (see `mediaS3Config`). */
export function requireS3Bucket(): string {
  const bucket = resolvePrimaryS3BucketName().trim();
  if (!bucket) {
    throw new Error(
      "Missing S3 bucket context — set APP_ENV and S3_BUCKET_DEV / S3_BUCKET_DEV_US (dev) or use production backup buckets via APP_ENV=production",
    );
  }
  return bucket;
}

/** Primary S3 region: first of AWS_S3_REGION → AWS_REGION → AWS_DEFAULT_REGION, else `eu-west-1`. */
export function requireAwsRegion(): string {
  const candidates = [
    process.env.AWS_S3_REGION,
    process.env.AWS_REGION,
    process.env.AWS_DEFAULT_REGION,
  ];
  for (const raw of candidates) {
    const r = (raw ?? "").trim();
    if (!r) continue;
    if (isMiddleEastAwsRegion(r)) {
      throw new Error(
        "AWS_S3_REGION / AWS_REGION / AWS_DEFAULT_REGION must not be a Middle East (me-*) region. Use eu-west-1 or us-east-1.",
      );
    }
    return r;
  }
  return "eu-west-1";
}

const s3ClientByRegion = new Map<string, S3Client>();

export {
  getDualRegionUploadTargets,
  getUploadTargets,
  isMiddleEastAwsRegion,
  MEDIA_S3_TIER_CONFIG,
  resolveMediaTier,
} from "./mediaS3Config";

export function getS3ClientForRegion(region: string): S3Client {
  let client = s3ClientByRegion.get(region);
  if (!client) {
    const accessKeyId = requireEnv("AWS_ACCESS_KEY_ID");
    const secretAccessKey = requireEnv("AWS_SECRET_ACCESS_KEY");
    client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
    s3ClientByRegion.set(region, client);
  }
  return client;
}

export function getFileExtensionFromMimeType(fileType: string): string {
  const normalized = fileType.trim().toLowerCase();
  const extension = MIME_EXTENSION_MAP[normalized];
  if (!extension) throw new Error("Unsupported file type");
  return extension;
}

function buildMediaKey(args: {
  userId: string;
  uploadType: UploadType;
  fileExtension: string;
  postId?: string;
  chatId?: string;
}): string {
  const now = Date.now();
  const unique = randomUUID();
  const fileName = `${now}-${unique}.${args.fileExtension}`;

  switch (args.uploadType) {
    case "profile":
      // Use a unique key per profile upload to avoid stale CDN/device caches.
      // Clients store the latest key on the user document.
      return `users/${args.userId}/profile-${now}-${unique}.${args.fileExtension}`;
    case "banner":
      return `users/${args.userId}/banner-${now}-${unique}.${args.fileExtension}`;
    case "post":
      return `posts/${args.postId}/${fileName}`;
    case "story":
      return `stories/${args.userId}/${fileName}`;
    case "message":
      return `messages/${args.chatId}/${fileName}`;
    case "thumbnail":
      return `thumbnails/${args.userId}/${fileName}`;
    default:
      throw new Error("Unsupported upload type");
  }
}

function validateUploadArgs(args: {
  uploadType: UploadType;
  fileType: string;
  postId?: string;
  chatId?: string;
}): void {
  const normalizedType = args.fileType.trim().toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(normalizedType)) {
    throw new Error("Unsupported file type");
  }

  if (args.uploadType === "post" && !args.postId) {
    throw new Error("postId is required for post uploads");
  }

  if (args.uploadType === "message" && !args.chatId) {
    throw new Error("chatId is required for message uploads");
  }
}

export const generateUploadUrl = action({
  args: {
    userId: v.union(v.id("users"), v.string()),
    fileType: v.string(),
    uploadType: v.union(
      v.literal("profile"),
      v.literal("banner"),
      v.literal("post"),
      v.literal("story"),
      v.literal("message"),
      v.literal("thumbnail"),
    ),
    postId: v.optional(v.string()),
    chatId: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { userId, fileType, uploadType, postId, chatId },
  ): Promise<{
    uploadUrl: string;
    key: string;
    expiresInSeconds: number;
    /** Presigned PUT URLs for the same key in fallback buckets (EU/US), when configured */
    fallbackUploadUrls?: string[];
    /** Same order as [uploadUrl, ...fallbackUploadUrls] — AWS region per PUT target */
    uploadRegions: string[];
    /** When true, `uploadUrl` + `fallbackUploadUrls` are EU + US dual-write targets (same key). */
    dualRegionWrite?: boolean;
  }> => {
    validateUploadArgs({ uploadType, fileType, postId, chatId });
    const user = await ctx.runQuery(internal.users.getUserDocInternal, {
      id: userId,
    });
    if (!user) {
      throw new Error("Invalid session");
    }
    const mod = await ctx.runQuery(api.users.getAccountModeration, {
      userId: user._id,
    });
    if (!mod || mod.accountStatus !== "active") {
      throw new Error("Account restricted");
    }
    if (uploadType === "message") {
      const hasAccess = await ctx.runQuery(
        (api as any).messages.canUploadToConversation,
        {
          viewerId: user._id,
          conversationId: chatId,
        },
      );
      if (!hasAccess) {
        throw new Error("Not allowed to upload to this conversation");
      }
    }
    const targets = getDualRegionUploadTargets();
    const fileExtension = getFileExtensionFromMimeType(fileType);
    const key = buildMediaKey({
      userId: String(user._id),
      uploadType,
      fileExtension,
      postId,
      chatId,
    });

    const contentType = fileType.trim().toLowerCase();
    const expiresInSeconds = 600;

    const signedUrls = await Promise.all(
      targets.map(async (t) => {
        const command = new PutObjectCommand({
          Bucket: t.bucket,
          Key: key,
          ContentType: contentType,
          CacheControl: "public, max-age=31536000, immutable",
        });
        return getSignedUrl(getS3ClientForRegion(t.region), command, {
          expiresIn: expiresInSeconds,
        });
      }),
    );

    const uploadUrl = signedUrls[0];
    const fallbackUploadUrls =
      signedUrls.length > 1 ? signedUrls.slice(1) : undefined;
    const uploadRegions = targets.map((t) => t.region);

    return {
      uploadUrl,
      key,
      expiresInSeconds,
      fallbackUploadUrls,
      uploadRegions,
      /** Same key presigned for EU then US — clients should PUT to all URLs (see `putFileToAllDualRegionTargets`). */
      dualRegionWrite: true as const,
    };
  },
});

/** Returns CloudFront URL only; `storageRegion` is optional and ignored (kept for stable clients). */
export const getPublicMediaUrl = action({
  args: {
    key: v.string(),
    cacheBust: v.optional(v.string()),
    storageRegion: v.optional(v.string()),
  },
  handler: async (
    _ctx,
    { key, cacheBust, storageRegion },
  ): Promise<{
    url: string;
  }> => {
    return { url: resolvePublicMediaUrl(key, cacheBust, storageRegion) };
  },
});

// NOTE: We do NOT provide getSignedReadUrl because:
// 1. Public reads go through CloudFront only (private S3 + OAC)
// 2. S3 signatures are tied to the S3 host and break when served through CloudFront
// 3. Use getPublicMediaUrl() / buildPublicMediaUrl for media reads
