import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const blogCategory = v.union(
  v.literal("article"),
  v.literal("case_study"),
  v.literal("featured"),
  v.literal("guide"),
);

const newsTag = v.union(
  v.literal("all"),
  v.literal("community"),
  v.literal("company"),
  v.literal("news"),
  v.literal("product"),
  v.literal("safety"),
);

const newsStatus = v.union(
  v.literal("draft"),
  v.literal("approved"),
);

export default defineSchema({
  users: defineTable({
    email: v.string(),
    username: v.optional(v.string()),
    provider: v.string(),
    createdAt: v.number(),
    passwordHash: v.optional(v.string()),
    phone: v.optional(v.string()),
    countryCode: v.optional(v.string()),
    gender: v.optional(v.string()),
    fullName: v.optional(v.string()),
    dob: v.optional(v.string()),
    country: v.optional(v.string()),
    interests: v.optional(v.array(v.string())),
    profilePictureUrl: v.optional(v.string()),
    profilePictureKey: v.optional(v.string()),
    profilePictureStorageRegion: v.optional(v.string()),
    profilePictureStorageId: v.optional(v.id("_storage")),
    bannerUrl: v.optional(v.string()),
    bannerKey: v.optional(v.string()),
    bannerStorageRegion: v.optional(v.string()),
    bannerStorageId: v.optional(v.id("_storage")),
    bio: v.optional(v.string()),
    bioLink: v.optional(v.string()),
    preferredLang: v.optional(v.string()),
    isPrivate: v.optional(v.boolean()),
    followerCount: v.optional(v.number()),
    followingCount: v.optional(v.number()),
    pendingFollowRequests: v.optional(v.number()),
    role: v.optional(v.string()),
    isAdmin: v.optional(v.boolean()),
    totpEnabled: v.optional(v.boolean()),
    totpSecret: v.optional(v.string()),
    staffRole: v.optional(v.union(v.literal("admin"), v.literal("moderator"))),
    accountModerationStatus: v.optional(
      v.union(v.literal("active"), v.literal("suspended"), v.literal("banned")),
    ),
    suspensionEnd: v.optional(v.number()),
    suspensionReason: v.optional(v.string()),
    banReason: v.optional(v.string()),
    strikeCount: v.optional(v.number()),
    verificationTier: v.optional(
      v.union(v.literal("blue"), v.literal("gold"), v.literal("gray")),
    ),
    verificationPending: v.optional(v.boolean()),
    appealAllowedWhileSuspended: v.optional(v.boolean()),
    onboardingCompleted: v.optional(v.boolean()),
  })
    .index("by_email", ["email"])
    .index("by_email_provider", ["email", "provider"])
    .index("by_username", ["username"]),

  emailOtps: defineTable({
    email: v.string(),
    purpose: v.optional(
      v.union(v.literal("signup"), v.literal("password_reset")),
    ),
    codeHash: v.string(),
    expiresAt: v.number(),
    attempts: v.number(),
    lastSentAt: v.number(),
    verifiedAt: v.optional(v.number()),
    consumedAt: v.optional(v.number()),
    verifyTokenHash: v.optional(v.string()),
    verifyTokenExpiresAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_email_purpose", ["email", "purpose"]),

  blogs: defineTable({
    slug: v.string(),
    title: v.string(),
    excerpt: v.string(),
    /** Optional Arabic; public UI falls back to English when empty or missing */
    titleAr: v.optional(v.string()),
    excerptAr: v.optional(v.string()),
    bodyHtmlAr: v.optional(v.string()),
    category: blogCategory,
    authorName: v.string(),
    authorImageId: v.optional(v.id("_storage")),
    coverImageId: v.optional(v.id("_storage")),
    bodyHtml: v.string(),
    published: v.boolean(),
    publishedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_published", ["published", "publishedAt"]),

  // Editor-approved news items that appear on `/newsroom`.
  // Drafts exist only for the moderation UI at `/mangment` and are deleted on reject.
  newsItems: defineTable({
    tag: newsTag,
    status: newsStatus,
    title: v.string(),
    description: v.string(),
    content: v.optional(v.string()),

    url: v.string(),
    urlToImage: v.optional(v.string()),

    publishedAt: v.string(),
    publishedAtMs: v.number(),
    sourceName: v.string(),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status_tag", ["status", "tag"])
    // Dedupe across refreshes for the same tag.
    .index("by_url_tag", ["url", "tag"]),
});
