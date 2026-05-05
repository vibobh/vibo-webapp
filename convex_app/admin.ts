import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { normalizeModerationStatus } from "./postModeration";

// ============================================
// STORAGE HELPERS
// ============================================

const CDN_DOMAIN = "cdn.joinvibo.com";

function ensureCdnUrl(urlOrKey: string | undefined): string | undefined {
  if (!urlOrKey) return undefined;
  if (urlOrKey.startsWith("http://") || urlOrKey.startsWith("https://"))
    return urlOrKey;
  return `https://${CDN_DOMAIN}/${urlOrKey}`;
}

async function resolveProfilePicture(
  ctx: QueryCtx,
  user: Doc<"users"> | null,
): Promise<string | undefined> {
  if (!user) return undefined;
  if (user.profilePictureStorageId) {
    const url = await ctx.storage.getUrl(user.profilePictureStorageId);
    if (url) return url;
  }
  if (user.profilePictureUrl) return ensureCdnUrl(user.profilePictureUrl);
  if (user.profilePictureKey) return ensureCdnUrl(user.profilePictureKey);
  return undefined;
}

function resolveMediaUrl(media: Doc<"postMedia">): {
  displayUrl: string;
  thumbnailUrl?: string;
} {
  const displayUrl = ensureCdnUrl(media.displayUrl) ?? media.displayUrl;
  const thumbnailUrl = ensureCdnUrl(media.thumbnailUrl) ?? displayUrl;
  return { displayUrl, thumbnailUrl };
}

async function findAuthorFallback(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Doc<"users"> | null> {
  const direct = await ctx.db.get(userId);
  if (direct) return direct;
  const all = await ctx.db.query("users").take(200);
  return (
    all.find(
      (u) =>
        u.profilePictureKey?.includes(String(userId)) ||
        u.bannerKey?.includes(String(userId)),
    ) ?? null
  );
}

// ============================================
// AUTH HELPERS
// ============================================

async function requireStaff(
  ctx: QueryCtx | MutationCtx,
  adminId: Id<"users">,
): Promise<Doc<"users">> {
  const user = await ctx.db.get(adminId);
  if (!user) throw new Error("User not found");
  if (user.staffRole !== "admin" && user.staffRole !== "moderator")
    throw new Error("Insufficient permissions");
  return user;
}

async function requireAdmin(
  ctx: QueryCtx | MutationCtx,
  adminId: Id<"users">,
): Promise<Doc<"users">> {
  const user = await requireStaff(ctx, adminId);
  if (user.staffRole !== "admin") throw new Error("Admin role required");
  return user;
}

// ============================================
// AUTH / ACCESS
// ============================================

export const validateStaffAccess = query({
  args: { userId: v.id("users") },
  returns: v.any(),
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) return { valid: false };
    if (user.staffRole !== "admin" && user.staffRole !== "moderator")
      return { valid: false };
    return {
      valid: true,
      staffRole: user.staffRole,
      email: user.email,
      username: user.username,
      fullName: user.fullName,
      profilePictureUrl: user.profilePictureUrl,
    };
  },
});

/**
 * PostHog wiring status for admin dashboards (keys live in Convex env, not in client .env).
 * Set: `npx convex env set POSTHOG_API_KEY phc_...` and `POSTHOG_HOST` (optional; defaults US cloud).
 */
export const getPosthogIntegrationStatus = query({
  args: { adminId: v.id("users") },
  returns: v.object({
    configured: v.boolean(),
    host: v.string(),
    /** Last 4 chars of project API key when configured — enough to confirm the right key without exposing it. */
    projectKeySuffix: v.optional(v.string()),
  }),
  handler: async (ctx, { adminId }) => {
    await requireAdmin(ctx, adminId);
    const key = process.env.POSTHOG_API_KEY ?? "";
    const host = process.env.POSTHOG_HOST?.trim() || "https://us.i.posthog.com";
    const trimmed = key.trim();
    return {
      configured: trimmed.length > 0,
      host,
      projectKeySuffix: trimmed.length >= 4 ? trimmed.slice(-4) : undefined,
    };
  },
});

export const loginByEmail = query({
  args: { email: v.string() },
  returns: v.any(),
  handler: async (ctx, { email }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email.toLowerCase().trim()))
      .first();
    if (!user) return { valid: false, error: "User not found" };
    if (user.staffRole !== "admin" && user.staffRole !== "moderator")
      return { valid: false, error: "Not a staff member" };
    return {
      valid: true,
      userId: user._id,
      staffRole: user.staffRole,
      email: user.email,
      username: user.username,
      fullName: user.fullName,
      profilePictureUrl: user.profilePictureUrl,
    };
  },
});

// ============================================
// DASHBOARD
// ============================================

export const getDashboardStats = query({
  args: { adminId: v.id("users") },
  returns: v.any(),
  handler: async (ctx, { adminId }) => {
    await requireStaff(ctx, adminId);
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const allUsers = await ctx.db.query("users").collect();
    const allPosts = await ctx.db.query("posts").collect();
    const allReports = await ctx.db.query("reports").collect();
    const allStories = await ctx.db.query("stories").collect();

    const totalUsers = allUsers.length;
    const newUsers7d = allUsers.filter(
      (u) => u.createdAt > sevenDaysAgo,
    ).length;
    const newUsers30d = allUsers.filter(
      (u) => u.createdAt > thirtyDaysAgo,
    ).length;

    const publishedPosts = allPosts.filter((p) => p.status === "published");
    const totalPosts = publishedPosts.length;
    const flaggedPosts = allPosts.filter(
      (p) => normalizeModerationStatus(p.moderationStatus) === "flagged",
    ).length;
    const postsToday = publishedPosts.filter(
      (p) => p.publishedAt && p.publishedAt > startOfDay.getTime(),
    ).length;

    const pendingReports = allReports.filter(
      (r) => r.status === "pending",
    ).length;
    const underReviewReports = allReports.filter(
      (r) => r.status === "under_review",
    ).length;
    const totalReports = allReports.length;

    const activeStories = allStories.filter((s) => s.expiresAt > now).length;

    const suspendedUsers = allUsers.filter(
      (u) => u.accountModerationStatus === "suspended",
    ).length;
    const bannedUsers = allUsers.filter(
      (u) => u.accountModerationStatus === "banned",
    ).length;

    return {
      totalUsers,
      newUsers7d,
      newUsers30d,
      totalPosts,
      flaggedPosts,
      postsToday,
      pendingReports,
      underReviewReports,
      totalReports,
      activeStories,
      suspendedUsers,
      bannedUsers,
    };
  },
});

export const getGrowthData = query({
  args: {
    adminId: v.id("users"),
    period: v.union(v.literal("7d"), v.literal("30d"), v.literal("90d")),
  },
  returns: v.any(),
  handler: async (ctx, { adminId, period }) => {
    await requireStaff(ctx, adminId);

    const now = Date.now();
    const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
    const since = now - days * 24 * 60 * 60 * 1000;

    const users = await ctx.db.query("users").collect();
    const posts = await ctx.db.query("posts").collect();

    const buckets: Record<string, { users: number; posts: number }> = {};

    for (let i = 0; i < days; i++) {
      const dayStart = now - (days - i) * 24 * 60 * 60 * 1000;
      const dayEnd = dayStart + 24 * 60 * 60 * 1000;
      const key = new Date(dayStart).toISOString().slice(0, 10);
      buckets[key] = {
        users: users.filter(
          (u) => u.createdAt >= dayStart && u.createdAt < dayEnd,
        ).length,
        posts: posts.filter(
          (p) =>
            p.status === "published" &&
            p.publishedAt &&
            p.publishedAt >= dayStart &&
            p.publishedAt < dayEnd,
        ).length,
      };
    }

    return Object.entries(buckets).map(([date, data]) => ({
      date,
      ...data,
    }));
  },
});

// ============================================
// REPORTS
// ============================================

export const listReports = query({
  args: {
    adminId: v.id("users"),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("under_review"),
        v.literal("resolved"),
        v.literal("rejected"),
      ),
    ),
    priority: v.optional(
      v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    ),
    targetType: v.optional(
      v.union(v.literal("post"), v.literal("user"), v.literal("comment")),
    ),
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    await requireStaff(ctx, args.adminId);
    const limit = args.limit ?? 25;

    let reports: Doc<"reports">[];
    if (args.status) {
      let q = ctx.db
        .query("reports")
        .withIndex("by_status_created", (q) => q.eq("status", args.status!));
      if (args.cursor !== undefined) {
        q = q.filter((qi) => qi.lt(qi.field("createdAt"), args.cursor!));
      }
      reports = await q.order("desc").take(limit + 1);
    } else {
      let q = ctx.db.query("reports").withIndex("by_created");
      if (args.cursor !== undefined) {
        q = q.filter((qi) => qi.lt(qi.field("createdAt"), args.cursor!));
      }
      reports = await q.order("desc").take(limit + 1);
    }

    if (args.priority) {
      reports = reports.filter((r) => r.priority === args.priority);
    }
    if (args.targetType) {
      reports = reports.filter((r) => r.targetType === args.targetType);
    }

    let nextCursor: number | undefined;
    if (reports.length > limit) {
      nextCursor = reports[limit - 1].createdAt;
      reports = reports.slice(0, limit);
    }

    const enriched = await Promise.all(
      reports.map(async (report) => {
        const reporter = await ctx.db.get(report.reporterId);
        const reporterPic = await resolveProfilePicture(ctx, reporter);

        let targetPreview: string | null = null;
        if (report.targetType === "post") {
          const post = await ctx.db.get(report.targetId as Id<"posts">);
          targetPreview = post?.caption?.slice(0, 100) ?? "[no caption]";
        } else if (report.targetType === "user") {
          const user = await ctx.db.get(report.targetId as Id<"users">);
          targetPreview =
            user?.username ?? user?.fullName ?? user?.email ?? "[unknown user]";
        } else if (report.targetType === "comment") {
          const comment = await ctx.db.get(report.targetId as Id<"comments">);
          targetPreview = comment?.text?.slice(0, 100) ?? "[deleted comment]";
        }

        const sameTargetReports = await ctx.db
          .query("reports")
          .withIndex("by_target", (q) =>
            q
              .eq("targetType", report.targetType)
              .eq("targetId", report.targetId),
          )
          .collect();

        return {
          ...report,
          reporter: reporter
            ? {
                _id: reporter._id,
                username: reporter.username,
                email: reporter.email,
                fullName: reporter.fullName,
                profilePictureUrl: reporterPic,
              }
            : null,
          targetPreview,
          reportCountOnTarget: sameTargetReports.length,
        };
      }),
    );

    return { reports: enriched, nextCursor };
  },
});

export const getReportDetail = query({
  args: {
    adminId: v.id("users"),
    reportId: v.id("reports"),
  },
  returns: v.any(),
  handler: async (ctx, { adminId, reportId }) => {
    await requireStaff(ctx, adminId);

    const report = await ctx.db.get(reportId);
    if (!report) throw new Error("Report not found");

    const reporter = await ctx.db.get(report.reporterId);
    const reporterPic = await resolveProfilePicture(ctx, reporter);

    let target: any = null;
    if (report.targetType === "post") {
      const post = await ctx.db.get(report.targetId as Id<"posts">);
      if (post) {
        const author = await ctx.db.get(post.userId);
        const authorPic = await resolveProfilePicture(ctx, author);
        const rawMedia = await ctx.db
          .query("postMedia")
          .withIndex("by_post_position", (q) => q.eq("postId", post._id))
          .collect();
        const media = rawMedia.map((m) => {
          const resolved = resolveMediaUrl(m);
          return {
            ...m,
            displayUrl: resolved.displayUrl,
            thumbnailUrl: resolved.thumbnailUrl,
          };
        });
        target = {
          ...post,
          author: author
            ? {
                ...author,
                passwordHash: undefined,
                profilePictureUrl: authorPic,
              }
            : null,
          media,
        };
      }
    } else if (report.targetType === "user") {
      const targetUser = await ctx.db.get(report.targetId as Id<"users">);
      if (targetUser) {
        const pic = await resolveProfilePicture(ctx, targetUser);
        target = {
          ...targetUser,
          passwordHash: undefined,
          profilePictureUrl: pic,
        };
      }
    } else if (report.targetType === "comment") {
      const comment = await ctx.db.get(report.targetId as Id<"comments">);
      if (comment) {
        const author = await ctx.db.get(comment.authorId);
        const authorPic = await resolveProfilePicture(ctx, author);
        target = {
          ...comment,
          author: author
            ? {
                ...author,
                passwordHash: undefined,
                profilePictureUrl: authorPic,
              }
            : null,
        };
      }
    }

    const sameTargetReports = await ctx.db
      .query("reports")
      .withIndex("by_target", (q) =>
        q.eq("targetType", report.targetType).eq("targetId", report.targetId),
      )
      .collect();

    const enrichedSameTarget = await Promise.all(
      sameTargetReports.map(async (r) => {
        const rep = await ctx.db.get(r.reporterId);
        const repPic = await resolveProfilePicture(ctx, rep);
        return {
          ...r,
          reporter: rep
            ? {
                _id: rep._id,
                username: rep.username,
                email: rep.email,
                profilePictureUrl: repPic,
              }
            : null,
        };
      }),
    );

    const moderationHistory = await ctx.db
      .query("moderationActions")
      .withIndex("by_target", (q) =>
        q.eq("targetType", report.targetType).eq("targetId", report.targetId),
      )
      .order("desc")
      .collect();

    const enrichedHistory = await Promise.all(
      moderationHistory.map(async (a) => {
        const admin = await ctx.db.get(a.adminId);
        return {
          ...a,
          adminName: admin?.username ?? admin?.email ?? "Unknown",
        };
      }),
    );

    return {
      report,
      reporter: reporter
        ? {
            _id: reporter._id,
            username: reporter.username,
            email: reporter.email,
            fullName: reporter.fullName,
            profilePictureUrl: reporterPic,
          }
        : null,
      target,
      allReportsOnTarget: enrichedSameTarget,
      moderationHistory: enrichedHistory,
    };
  },
});

export const setReportStatus = mutation({
  args: {
    adminId: v.id("users"),
    reportId: v.id("reports"),
    status: v.union(
      v.literal("pending"),
      v.literal("under_review"),
      v.literal("resolved"),
      v.literal("rejected"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { adminId, reportId, status }) => {
    await requireStaff(ctx, adminId);
    const report = await ctx.db.get(reportId);
    if (!report) throw new Error("Report not found");
    await ctx.db.patch(reportId, { status, updatedAt: Date.now() });
    return null;
  },
});

export const rejectReport = mutation({
  args: {
    adminId: v.id("users"),
    reportId: v.id("reports"),
    notes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { adminId, reportId, notes }) => {
    await requireStaff(ctx, adminId);
    const report = await ctx.db.get(reportId);
    if (!report) throw new Error("Report not found");

    await ctx.db.patch(reportId, { status: "rejected", updatedAt: Date.now() });

    await ctx.db.insert("moderationActions", {
      adminId,
      targetType: report.targetType,
      targetId: report.targetId,
      action: "none",
      notes: notes ?? "Report rejected",
      reportId,
      createdAt: Date.now(),
    });

    if (report.targetType === "post") {
      const post = await ctx.db.get(report.targetId as Id<"posts">);
      if (
        post &&
        normalizeModerationStatus(post.moderationStatus) === "flagged"
      ) {
        await ctx.db.patch(post._id, {
          moderationStatus: "active",
          moderationVisibilityStatus: "public",
          updatedAt: Date.now(),
        });
      }
    }

    return null;
  },
});

// ============================================
// MODERATION ACTIONS
// ============================================

export const applyModerationAction = mutation({
  args: {
    adminId: v.id("users"),
    targetType: v.union(
      v.literal("post"),
      v.literal("user"),
      v.literal("comment"),
    ),
    targetId: v.string(),
    action: v.union(
      v.literal("none"),
      v.literal("warn_user"),
      v.literal("remove_content"),
      v.literal("restrict_content"),
      v.literal("shadow_hide"),
      v.literal("ban_user"),
      v.literal("suspend_user"),
    ),
    notes: v.optional(v.string()),
    reportId: v.optional(v.id("reports")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireStaff(ctx, args.adminId);
    const now = Date.now();

    if (
      (args.action === "ban_user" || args.action === "suspend_user") &&
      admin.staffRole !== "admin"
    ) {
      throw new Error("Only admins can ban or suspend users");
    }

    await ctx.db.insert("moderationActions", {
      adminId: args.adminId,
      targetType: args.targetType,
      targetId: args.targetId,
      action: args.action,
      notes: args.notes,
      reportId: args.reportId,
      createdAt: now,
    });

    if (args.targetType === "post") {
      const postId = args.targetId as Id<"posts">;
      const post = await ctx.db.get(postId);
      if (!post) throw new Error("Post not found");

      if (args.action === "remove_content") {
        await ctx.db.patch(postId, {
          moderationStatus: "removed",
          moderationVisibilityStatus: "hidden",
          moderationReason: args.notes,
          updatedAt: now,
        });
      } else if (args.action === "restrict_content") {
        await ctx.db.patch(postId, {
          moderationStatus: "restricted",
          moderationReason: args.notes,
          updatedAt: now,
        });
      } else if (args.action === "shadow_hide") {
        await ctx.db.patch(postId, {
          moderationVisibilityStatus: "shadow_hidden",
          moderationReason: args.notes,
          updatedAt: now,
        });
      }
    } else if (args.targetType === "comment") {
      const commentId = args.targetId as Id<"comments">;
      const comment = await ctx.db.get(commentId);
      if (!comment) throw new Error("Comment not found");

      if (args.action === "remove_content") {
        await ctx.db.patch(commentId, {
          isDeleted: true,
          deletedAt: now,
          updatedAt: now,
        });
      }
    } else if (args.targetType === "user") {
      const userId = args.targetId as Id<"users">;
      const user = await ctx.db.get(userId);
      if (!user) throw new Error("User not found");

      if (args.action === "ban_user") {
        await ctx.db.patch(userId, { accountModerationStatus: "banned" });
      } else if (args.action === "suspend_user") {
        await ctx.db.patch(userId, { accountModerationStatus: "suspended" });
      }
    }

    if (args.reportId) {
      await ctx.db.patch(args.reportId, { status: "resolved", updatedAt: now });
    }

    return null;
  },
});

/**
 * Restores a suspended/banned user account back to active.
 * Admin-only operation used by dashboard moderation tooling.
 */
export const restoreUserAccount = mutation({
  args: {
    adminId: v.id("users"),
    userId: v.id("users"),
    notes: v.optional(v.string()),
    /** Alias for `notes` (dashboard clients). */
    adminNote: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { adminId, userId, notes, adminNote }) => {
    await requireAdmin(ctx, adminId);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    const priorStatus = user.accountModerationStatus ?? "active";
    const noteText = (notes ?? adminNote)?.trim();

    const now = Date.now();
    await ctx.db.patch(userId, {
      accountModerationStatus: "active",
      suspensionEnd: undefined,
      suspensionReason: undefined,
      banReason: undefined,
    });

    await ctx.db.insert("moderationActions", {
      adminId,
      targetType: "user",
      targetId: userId,
      action: "none",
      notes:
        noteText || `Account restored by admin (${priorStatus} -> active).`,
      createdAt: now,
    });

    return null;
  },
});

// ============================================
// POSTS ADMIN
// ============================================

export const listPosts = query({
  args: {
    adminId: v.id("users"),
    moderationStatus: v.optional(v.string()),
    visibility: v.optional(v.string()),
    postStatus: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    await requireStaff(ctx, args.adminId);
    const limit = args.limit ?? 25;

    let q = ctx.db
      .query("posts")
      .withIndex("by_status_created", (qi) =>
        qi.eq("status", (args.postStatus as any) ?? "published"),
      );

    if (args.cursor !== undefined) {
      q = q.filter((qi) => qi.lt(qi.field("createdAt"), args.cursor!));
    }

    let posts = await q.order("desc").take(limit * 3);

    if (args.moderationStatus) {
      posts = posts.filter(
        (p) =>
          normalizeModerationStatus(p.moderationStatus) ===
          args.moderationStatus,
      );
    }
    if (args.visibility) {
      posts = posts.filter((p) => p.visibility === args.visibility);
    }

    posts = posts.slice(0, limit + 1);

    let nextCursor: number | undefined;
    if (posts.length > limit) {
      nextCursor = posts[limit - 1].createdAt;
      posts = posts.slice(0, limit);
    }

    const enriched = await Promise.all(
      posts.map(async (post) => {
        const author = await findAuthorFallback(ctx, post.userId);
        const authorPic = await resolveProfilePicture(ctx, author);

        let media = await ctx.db
          .query("postMedia")
          .withIndex("by_post_position", (q) => q.eq("postId", post._id))
          .collect();
        if (media.length === 0) {
          media = await ctx.db
            .query("postMedia")
            .withIndex("by_post", (q) => q.eq("postId", post._id))
            .collect();
        }

        let thumbnailUrl: string | null = null;
        if (media[0]) {
          const resolved = resolveMediaUrl(media[0]);
          thumbnailUrl = resolved.thumbnailUrl ?? resolved.displayUrl ?? null;
        }

        const reportCount = (
          await ctx.db
            .query("reports")
            .withIndex("by_target", (q) =>
              q.eq("targetType", "post").eq("targetId", post._id),
            )
            .collect()
        ).length;

        return {
          ...post,
          normalizedModerationStatus: normalizeModerationStatus(
            post.moderationStatus,
          ),
          author: author
            ? {
                _id: author._id,
                username: author.username,
                email: author.email,
                fullName: author.fullName,
                profilePictureUrl: authorPic,
              }
            : null,
          thumbnail: thumbnailUrl,
          mediaType: media[0]?.type ?? null,
          totalMedia: media.length,
          reportCount,
        };
      }),
    );

    return { posts: enriched, nextCursor };
  },
});

export const getPostDetail = query({
  args: {
    adminId: v.id("users"),
    postId: v.id("posts"),
  },
  returns: v.any(),
  handler: async (ctx, { adminId, postId }) => {
    await requireStaff(ctx, adminId);

    const post = await ctx.db.get(postId);
    if (!post) throw new Error("Post not found");

    const author = await findAuthorFallback(ctx, post.userId);
    const authorPic = await resolveProfilePicture(ctx, author);

    let rawMedia = await ctx.db
      .query("postMedia")
      .withIndex("by_post_position", (q) => q.eq("postId", postId))
      .collect();
    if (rawMedia.length === 0) {
      rawMedia = await ctx.db
        .query("postMedia")
        .withIndex("by_post", (q) => q.eq("postId", postId))
        .collect();
    }

    const media = rawMedia.map((m) => {
      const resolved = resolveMediaUrl(m);
      return {
        ...m,
        displayUrl: resolved.displayUrl,
        thumbnailUrl: resolved.thumbnailUrl,
      };
    });

    const tags = await ctx.db
      .query("postTags")
      .withIndex("by_post", (q) => q.eq("postId", postId))
      .collect();

    const tagsWithUsers = await Promise.all(
      tags.map(async (tag) => {
        const user = await ctx.db.get(tag.taggedUserId);
        return {
          ...tag,
          taggedUser: user ? { _id: user._id, username: user.username } : null,
        };
      }),
    );

    const reports = await ctx.db
      .query("reports")
      .withIndex("by_target", (q) =>
        q.eq("targetType", "post").eq("targetId", postId),
      )
      .collect();

    const moderationHistory = await ctx.db
      .query("moderationActions")
      .withIndex("by_target", (q) =>
        q.eq("targetType", "post").eq("targetId", postId),
      )
      .order("desc")
      .collect();

    const enrichedHistory = await Promise.all(
      moderationHistory.map(async (a) => {
        const adminUser = await ctx.db.get(a.adminId);
        return {
          ...a,
          adminName: adminUser?.username ?? adminUser?.email ?? "Unknown",
        };
      }),
    );

    const comments = await ctx.db
      .query("comments")
      .withIndex("by_post", (qi) => qi.eq("postId", postId))
      .order("desc")
      .take(200);

    const enrichedComments = await Promise.all(
      comments.map(async (c) => {
        const commentAuthor = await findAuthorFallback(ctx, c.authorId);
        const commentAuthorPic = await resolveProfilePicture(
          ctx,
          commentAuthor,
        );
        return {
          ...c,
          author: commentAuthor
            ? {
                _id: commentAuthor._id,
                username: commentAuthor.username,
                fullName: commentAuthor.fullName,
                email: commentAuthor.email,
                profilePictureUrl: commentAuthorPic,
              }
            : null,
        };
      }),
    );

    const savedDocs = await ctx.db
      .query("savedPosts")
      .withIndex("by_post", (q) => q.eq("postId", postId))
      .collect();

    const savedByUsers = await Promise.all(
      savedDocs.map(async (s) => {
        const u = await ctx.db.get(s.userId);
        const pic = await resolveProfilePicture(ctx, u);
        return {
          _id: s._id,
          userId: s.userId,
          username: u?.username,
          fullName: u?.fullName,
          email: u?.email,
          profilePictureUrl: pic,
          savedAt: s.createdAt,
        };
      }),
    );

    const likeDocs = await ctx.db
      .query("likes")
      .withIndex("by_target", (q) =>
        q.eq("targetType", "post").eq("targetId", String(postId)),
      )
      .order("desc")
      .take(100);

    const likedByUsers = await Promise.all(
      likeDocs.map(async (l) => {
        const u = await ctx.db.get(l.userId);
        const pic = await resolveProfilePicture(ctx, u);
        return {
          _id: l._id,
          userId: l.userId,
          username: u?.username,
          fullName: u?.fullName,
          email: u?.email,
          profilePictureUrl: pic,
          likedAt: l.createdAt,
        };
      }),
    );

    return {
      post: {
        ...post,
        normalizedModerationStatus: normalizeModerationStatus(
          post.moderationStatus,
        ),
      },
      author: author
        ? {
            _id: author._id,
            username: author.username,
            email: author.email,
            fullName: author.fullName,
            profilePictureUrl: authorPic,
            accountModerationStatus: author.accountModerationStatus,
          }
        : null,
      media,
      tags: tagsWithUsers,
      reports,
      moderationHistory: enrichedHistory,
      comments: enrichedComments,
      savedCount: savedDocs.length,
      savedByUsers,
      likedByUsers,
    };
  },
});

// ============================================
// COMMENTS ADMIN
// ============================================

export const listComments = query({
  args: {
    adminId: v.id("users"),
    postId: v.optional(v.id("posts")),
    showDeleted: v.optional(v.boolean()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    await requireStaff(ctx, args.adminId);
    const limit = args.limit ?? 25;

    let comments: Doc<"comments">[];
    if (args.postId) {
      let q = ctx.db
        .query("comments")
        .withIndex("by_post", (qi) => qi.eq("postId", args.postId!));
      if (args.cursor !== undefined) {
        q = q.filter((qi) => qi.lt(qi.field("createdAt"), args.cursor!));
      }
      comments = await q.order("desc").take(limit + 1);
    } else {
      const allComments = await ctx.db
        .query("comments")
        .order("desc")
        .take(limit * 3);
      if (args.cursor !== undefined) {
        comments = allComments
          .filter((c) => c.createdAt < args.cursor!)
          .slice(0, limit + 1);
      } else {
        comments = allComments.slice(0, limit + 1);
      }
    }

    if (!args.showDeleted) {
      comments = comments.filter((c) => !c.isDeleted);
    }

    let nextCursor: number | undefined;
    if (comments.length > limit) {
      nextCursor = comments[limit - 1].createdAt;
      comments = comments.slice(0, limit);
    }

    const enriched = await Promise.all(
      comments.map(async (comment) => {
        const author = await findAuthorFallback(ctx, comment.authorId);
        const authorPic = await resolveProfilePicture(ctx, author);
        const post = await ctx.db.get(comment.postId);
        const reportCount = (
          await ctx.db
            .query("reports")
            .withIndex("by_target", (q) =>
              q.eq("targetType", "comment").eq("targetId", comment._id),
            )
            .collect()
        ).length;

        return {
          ...comment,
          author: author
            ? {
                _id: author._id,
                username: author.username,
                email: author.email,
                fullName: author.fullName,
                profilePictureUrl: authorPic,
              }
            : null,
          postCaption: post?.caption?.slice(0, 60) ?? "[unknown post]",
          reportCount,
        };
      }),
    );

    return { comments: enriched, nextCursor };
  },
});

// ============================================
// USERS ADMIN
// ============================================

export const listUsers = query({
  args: {
    adminId: v.id("users"),
    search: v.optional(v.string()),
    accountStatus: v.optional(v.string()),
    staffRoleFilter: v.optional(v.string()),
    countryFilter: v.optional(v.string()),
    genderFilter: v.optional(v.string()),
    privacyFilter: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    await requireStaff(ctx, args.adminId);
    const limit = args.limit ?? 25;

    let users: Doc<"users">[];

    if (args.search && args.search.trim().length > 0) {
      const search = args.search.trim().toLowerCase();
      const byUsername = await ctx.db
        .query("users")
        .withIndex("by_username", (q) =>
          q.gte("username", search).lt("username", search + "\xff"),
        )
        .take(50);

      const byEmail = await ctx.db
        .query("users")
        .withIndex("by_email", (q) =>
          q.gte("email", search).lt("email", search + "\xff"),
        )
        .take(50);

      const seen = new Set<string>();
      users = [];
      for (const u of [...byUsername, ...byEmail]) {
        if (!seen.has(String(u._id))) {
          seen.add(String(u._id));
          users.push(u);
        }
      }
    } else {
      const all = await ctx.db
        .query("users")
        .order("desc")
        .take(limit * 5);
      if (args.cursor !== undefined) {
        users = all.filter((u) => u.createdAt < args.cursor!);
      } else {
        users = all;
      }
    }

    if (args.accountStatus) {
      if (args.accountStatus === "active") {
        users = users.filter(
          (u) =>
            !u.accountModerationStatus ||
            u.accountModerationStatus === "active",
        );
      } else {
        users = users.filter(
          (u) => u.accountModerationStatus === args.accountStatus,
        );
      }
    }
    if (args.staffRoleFilter) {
      users = users.filter((u) => u.staffRole === args.staffRoleFilter);
    }
    if (args.countryFilter) {
      users = users.filter((u) => u.country === args.countryFilter);
    }
    if (args.genderFilter) {
      users = users.filter(
        (u) => u.gender?.toLowerCase() === args.genderFilter!.toLowerCase(),
      );
    }
    if (args.privacyFilter) {
      if (args.privacyFilter === "private") {
        users = users.filter((u) => u.isPrivate === true);
      } else if (args.privacyFilter === "public") {
        users = users.filter((u) => !u.isPrivate);
      }
    }

    users = users.slice(0, limit + 1);

    let nextCursor: number | undefined;
    if (users.length > limit) {
      nextCursor = users[limit - 1].createdAt;
      users = users.slice(0, limit);
    }

    const result = await Promise.all(
      users.map(async (u) => {
        const pic = await resolveProfilePicture(ctx, u);
        return {
          _id: u._id,
          email: u.email,
          username: u.username,
          fullName: u.fullName,
          profilePictureUrl: pic,
          followerCount: u.followerCount ?? 0,
          followingCount: u.followingCount ?? 0,
          accountModerationStatus: u.accountModerationStatus ?? "active",
          staffRole: u.staffRole,
          createdAt: u.createdAt,
          country: u.country,
          gender: u.gender,
          isPrivate: u.isPrivate ?? false,
          bio: u.bio,
        };
      }),
    );

    const countries = new Set<string>();
    const allUsers = await ctx.db.query("users").take(500);
    for (const u of allUsers) {
      if (u.country) countries.add(u.country);
    }

    return {
      users: result,
      nextCursor,
      availableCountries: Array.from(countries).sort(),
    };
  },
});

export const getUserDetail = query({
  args: {
    adminId: v.id("users"),
    userId: v.id("users"),
  },
  returns: v.any(),
  handler: async (ctx, { adminId, userId }) => {
    await requireStaff(ctx, adminId);

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    const profilePic = await resolveProfilePicture(ctx, user);
    let bannerPic: string | undefined;
    if (user.bannerStorageId) {
      bannerPic =
        (await ctx.storage.getUrl(user.bannerStorageId)) ?? user.bannerUrl;
    } else {
      bannerPic = user.bannerUrl;
    }

    const posts = await ctx.db
      .query("posts")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .collect();
    const postCount = posts.length;

    const stories = await ctx.db
      .query("stories")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .collect();
    const storyCount = stories.length;

    const allComments = await ctx.db
      .query("comments")
      .withIndex("by_author", (q) => q.eq("authorId", userId))
      .collect();
    const commentCount = allComments.length;

    const allLikes = await ctx.db
      .query("likes")
      .withIndex("by_user_target", (q) => q.eq("userId", userId))
      .collect();
    const likeCount = allLikes.length;

    const reportsAsTarget = await ctx.db
      .query("reports")
      .withIndex("by_target", (q) =>
        q.eq("targetType", "user").eq("targetId", userId),
      )
      .collect();

    const reportsAsReporter = await ctx.db
      .query("reports")
      .withIndex("by_reporter_created", (q) => q.eq("reporterId", userId))
      .collect();

    const moderationHistory = await ctx.db
      .query("moderationActions")
      .withIndex("by_target", (q) =>
        q.eq("targetType", "user").eq("targetId", userId),
      )
      .order("desc")
      .collect();

    const enrichedHistory = await Promise.all(
      moderationHistory.map(async (a) => {
        const adminUser = await ctx.db.get(a.adminId);
        return {
          ...a,
          adminName: adminUser?.username ?? adminUser?.email ?? "Unknown",
        };
      }),
    );

    return {
      user: {
        ...user,
        passwordHash: undefined,
        profilePictureUrl: profilePic,
        bannerUrl: bannerPic,
      },
      postCount,
      storyCount,
      commentCount,
      likeCount,
      reportsAgainstUser: reportsAsTarget.length,
      reportsMadeByUser: reportsAsReporter.length,
      reportsAgainstDocs: reportsAsTarget,
      reportsByDocs: reportsAsReporter,
      moderationHistory: enrichedHistory,
    };
  },
});

export const setStaffRole = mutation({
  args: {
    adminId: v.id("users"),
    userId: v.id("users"),
    staffRole: v.optional(v.union(v.literal("admin"), v.literal("moderator"))),
  },
  returns: v.null(),
  handler: async (ctx, { adminId, userId, staffRole }) => {
    await requireAdmin(ctx, adminId);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    await ctx.db.patch(userId, { staffRole });
    return null;
  },
});

// ============================================
// INSIGHTS
// ============================================

export const getInsights = query({
  args: {
    adminId: v.id("users"),
    metric: v.union(
      v.literal("topReportedUsers"),
      v.literal("mostReportedPosts"),
      v.literal("mostActivePosters"),
      v.literal("mostActiveCommenters"),
      v.literal("engagementLeaders"),
      v.literal("reportResolutionRate"),
    ),
  },
  returns: v.any(),
  handler: async (ctx, { adminId, metric }) => {
    await requireStaff(ctx, adminId);

    if (metric === "topReportedUsers") {
      const reports = await ctx.db.query("reports").collect();
      const userCounts = new Map<string, number>();

      for (const r of reports) {
        if (r.targetType === "user") {
          userCounts.set(r.targetId, (userCounts.get(r.targetId) ?? 0) + 1);
        } else if (r.targetType === "post") {
          const post = await ctx.db.get(r.targetId as Id<"posts">);
          if (post) {
            const uid = String(post.userId);
            userCounts.set(uid, (userCounts.get(uid) ?? 0) + 1);
          }
        }
      }

      const sorted = [...userCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      const result = await Promise.all(
        sorted.map(async ([uid, count]) => {
          const user = await ctx.db.get(uid as Id<"users">);
          return {
            userId: uid,
            username: user?.username ?? user?.email ?? "Unknown",
            reportCount: count,
          };
        }),
      );
      return result;
    }

    if (metric === "mostReportedPosts") {
      const reports = await ctx.db
        .query("reports")
        .withIndex("by_target")
        .collect();

      const postCounts = new Map<string, number>();
      for (const r of reports) {
        if (r.targetType === "post") {
          postCounts.set(r.targetId, (postCounts.get(r.targetId) ?? 0) + 1);
        }
      }

      const sorted = [...postCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      const result = await Promise.all(
        sorted.map(async ([pid, count]) => {
          const post = await ctx.db.get(pid as Id<"posts">);
          const author = post ? await ctx.db.get(post.userId) : null;
          return {
            postId: pid,
            caption: post?.caption?.slice(0, 80) ?? "[deleted]",
            authorUsername: author?.username ?? "Unknown",
            reportCount: count,
          };
        }),
      );
      return result;
    }

    if (metric === "mostActivePosters") {
      const posts = await ctx.db
        .query("posts")
        .withIndex("by_status_created", (q) => q.eq("status", "published"))
        .order("desc")
        .take(5000);

      const userCounts = new Map<string, number>();
      for (const p of posts) {
        const uid = String(p.userId);
        userCounts.set(uid, (userCounts.get(uid) ?? 0) + 1);
      }

      const sorted = [...userCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      const result = await Promise.all(
        sorted.map(async ([uid, count]) => {
          const user = await ctx.db.get(uid as Id<"users">);
          return {
            userId: uid,
            username: user?.username ?? user?.email ?? "Unknown",
            postCount: count,
          };
        }),
      );
      return result;
    }

    if (metric === "mostActiveCommenters") {
      const comments = await ctx.db.query("comments").order("desc").take(5000);

      const userCounts = new Map<string, number>();
      for (const c of comments) {
        if (c.isDeleted) continue;
        const uid = String(c.authorId);
        userCounts.set(uid, (userCounts.get(uid) ?? 0) + 1);
      }

      const sorted = [...userCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      const result = await Promise.all(
        sorted.map(async ([uid, count]) => {
          const user = await ctx.db.get(uid as Id<"users">);
          return {
            userId: uid,
            username: user?.username ?? user?.email ?? "Unknown",
            commentCount: count,
          };
        }),
      );
      return result;
    }

    if (metric === "engagementLeaders") {
      const users = await ctx.db.query("users").collect();
      const sorted = users
        .sort((a, b) => (b.followerCount ?? 0) - (a.followerCount ?? 0))
        .slice(0, 10);

      return sorted.map((u) => ({
        userId: String(u._id),
        username: u.username ?? u.email,
        followerCount: u.followerCount ?? 0,
        followingCount: u.followingCount ?? 0,
      }));
    }

    if (metric === "reportResolutionRate") {
      const reports = await ctx.db.query("reports").collect();
      const total = reports.length;
      const resolved = reports.filter((r) => r.status === "resolved").length;
      const rejected = reports.filter((r) => r.status === "rejected").length;
      const pending = reports.filter((r) => r.status === "pending").length;
      const underReview = reports.filter(
        (r) => r.status === "under_review",
      ).length;

      return {
        total,
        resolved,
        rejected,
        pending,
        underReview,
        resolutionRate: total > 0 ? Math.round((resolved / total) * 100) : 0,
      };
    }

    return null;
  },
});

// ============================================
// USER PROFILE TABS — lazy-loaded queries
// ============================================

export const getUserPosts = query({
  args: { adminId: v.id("users"), userId: v.id("users") },
  returns: v.any(),
  handler: async (ctx, { adminId, userId }) => {
    await requireStaff(ctx, adminId);
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(100);

    return Promise.all(
      posts.map(async (post) => {
        const media = await ctx.db
          .query("postMedia")
          .withIndex("by_post_position", (q) => q.eq("postId", post._id))
          .take(1);
        let thumbnail: string | null = null;
        if (media[0]) {
          const resolved = resolveMediaUrl(media[0]);
          thumbnail = resolved.thumbnailUrl ?? resolved.displayUrl ?? null;
        }
        return {
          _id: post._id,
          caption: post.caption,
          thumbnail,
          mediaType: media[0]?.type ?? null,
          mediaCount: post.mediaCount,
          likeCount: post.likeCount ?? 0,
          commentCount: post.commentCount ?? 0,
          status: post.status,
          moderationStatus: normalizeModerationStatus(post.moderationStatus),
          visibility: post.visibility,
          createdAt: post.createdAt,
        };
      }),
    );
  },
});

export const getUserStories = query({
  args: { adminId: v.id("users"), userId: v.id("users") },
  returns: v.any(),
  handler: async (ctx, { adminId, userId }) => {
    await requireStaff(ctx, adminId);
    const stories = await ctx.db
      .query("stories")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(100);

    const now = Date.now();
    return Promise.all(
      stories.map(async (s) => {
        const views = await ctx.db
          .query("storyViews")
          .withIndex("by_story", (q) => q.eq("storyId", s._id))
          .collect();
        return {
          _id: s._id,
          mediaUrl: ensureCdnUrl(s.mediaKey),
          mediaType: s.mediaType,
          caption: s.caption,
          viewCount: views.length,
          likeCount: s.likeCount ?? 0,
          createdAt: s.createdAt,
          expiresAt: s.expiresAt,
          isExpired: s.expiresAt < now,
          locationLabel: s.locationLabel,
          duration: s.duration,
        };
      }),
    );
  },
});

export const getUserComments = query({
  args: { adminId: v.id("users"), userId: v.id("users") },
  returns: v.any(),
  handler: async (ctx, { adminId, userId }) => {
    await requireStaff(ctx, adminId);
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_author", (q) => q.eq("authorId", userId))
      .order("desc")
      .take(100);

    return Promise.all(
      comments.map(async (c) => {
        const post = await ctx.db.get(c.postId);
        let postThumbnail: string | null = null;
        if (post) {
          const media = await ctx.db
            .query("postMedia")
            .withIndex("by_post_position", (q) => q.eq("postId", post._id))
            .take(1);
          if (media[0]) {
            const resolved = resolveMediaUrl(media[0]);
            postThumbnail =
              resolved.thumbnailUrl ?? resolved.displayUrl ?? null;
          }
        }
        return {
          _id: c._id,
          text: c.text,
          likeCount: c.likeCount ?? 0,
          replyCount: c.replyCount ?? 0,
          isDeleted: c.isDeleted ?? false,
          parentCommentId: c.parentCommentId,
          createdAt: c.createdAt,
          postId: c.postId,
          postCaption: post?.caption?.slice(0, 80) ?? "[deleted post]",
          postThumbnail,
        };
      }),
    );
  },
});

export const getUserFollowers = query({
  args: { adminId: v.id("users"), userId: v.id("users") },
  returns: v.any(),
  handler: async (ctx, { adminId, userId }) => {
    await requireStaff(ctx, adminId);
    const follows = await ctx.db
      .query("follows")
      .withIndex("by_following_status", (q) =>
        q.eq("followingId", userId).eq("status", "active"),
      )
      .order("desc")
      .take(200);

    return Promise.all(
      follows.map(async (f) => {
        const user = await ctx.db.get(f.followerId);
        const pic = await resolveProfilePicture(ctx, user);
        return {
          _id: f._id,
          userId: f.followerId,
          username: user?.username,
          fullName: user?.fullName,
          email: user?.email,
          profilePictureUrl: pic,
          followedAt: f.createdAt,
        };
      }),
    );
  },
});

export const getUserFollowing = query({
  args: { adminId: v.id("users"), userId: v.id("users") },
  returns: v.any(),
  handler: async (ctx, { adminId, userId }) => {
    await requireStaff(ctx, adminId);
    const follows = await ctx.db
      .query("follows")
      .withIndex("by_follower_status", (q) =>
        q.eq("followerId", userId).eq("status", "active"),
      )
      .order("desc")
      .take(200);

    return Promise.all(
      follows.map(async (f) => {
        const user = await ctx.db.get(f.followingId);
        const pic = await resolveProfilePicture(ctx, user);
        return {
          _id: f._id,
          userId: f.followingId,
          username: user?.username,
          fullName: user?.fullName,
          email: user?.email,
          profilePictureUrl: pic,
          followedAt: f.createdAt,
        };
      }),
    );
  },
});

export const getUserLikesActivity = query({
  args: { adminId: v.id("users"), userId: v.id("users") },
  returns: v.any(),
  handler: async (ctx, { adminId, userId }) => {
    await requireStaff(ctx, adminId);
    const likes = await ctx.db
      .query("likes")
      .withIndex("by_user_target", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);

    return Promise.all(
      likes.map(async (l) => {
        let preview: string | null = null;
        let thumbnail: string | null = null;
        if (l.targetType === "post") {
          const post = await ctx.db.get(l.targetId as Id<"posts">);
          preview = post?.caption?.slice(0, 60) ?? "[deleted]";
          if (post) {
            const media = await ctx.db
              .query("postMedia")
              .withIndex("by_post_position", (q) => q.eq("postId", post._id))
              .take(1);
            if (media[0]) {
              const resolved = resolveMediaUrl(media[0]);
              thumbnail = resolved.thumbnailUrl ?? null;
            }
          }
        } else if (l.targetType === "story") {
          const story = await ctx.db.get(l.targetId as Id<"stories">);
          preview = story?.caption ?? "Story";
          if (story) thumbnail = ensureCdnUrl(story.mediaKey) ?? null;
        }
        return {
          _id: l._id,
          targetType: l.targetType,
          targetId: l.targetId,
          preview,
          thumbnail,
          createdAt: l.createdAt,
        };
      }),
    );
  },
});

// ============================================
// ADMIN DELETE MUTATIONS
// ============================================

export const adminDeletePost = mutation({
  args: {
    adminId: v.id("users"),
    postId: v.id("posts"),
    notes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { adminId, postId, notes }) => {
    await requireStaff(ctx, adminId);
    const post = await ctx.db.get(postId);
    if (!post) throw new Error("Post not found");
    await ctx.db.patch(postId, {
      status: "deleted",
      deletedAt: Date.now(),
      moderationStatus: "deleted",
    });
    await ctx.db.insert("moderationActions", {
      adminId,
      targetType: "post",
      targetId: postId,
      action: "remove_content",
      notes: notes ?? "Post deleted by admin",
      createdAt: Date.now(),
    });
    return null;
  },
});

export const adminDeleteStory = mutation({
  args: {
    adminId: v.id("users"),
    storyId: v.id("stories"),
    notes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { adminId, storyId, notes }) => {
    await requireStaff(ctx, adminId);
    const story = await ctx.db.get(storyId);
    if (!story) throw new Error("Story not found");
    await ctx.db.insert("moderationActions", {
      adminId,
      targetType: "post",
      targetId: storyId,
      action: "remove_content",
      notes: notes ?? "Story deleted by admin",
      createdAt: Date.now(),
    });
    const storyViews = await ctx.db
      .query("storyViews")
      .withIndex("by_story", (q) => q.eq("storyId", storyId))
      .collect();
    for (const sv of storyViews) await ctx.db.delete(sv._id);
    const replies = await ctx.db
      .query("storyReplies")
      .withIndex("by_story", (q) => q.eq("storyId", storyId))
      .collect();
    for (const r of replies) await ctx.db.delete(r._id);
    await ctx.db.delete(storyId);
    return null;
  },
});

export const adminDeleteComment = mutation({
  args: {
    adminId: v.id("users"),
    commentId: v.id("comments"),
    notes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { adminId, commentId, notes }) => {
    await requireStaff(ctx, adminId);
    const comment = await ctx.db.get(commentId);
    if (!comment) throw new Error("Comment not found");
    await ctx.db.patch(commentId, { isDeleted: true, deletedAt: Date.now() });
    await ctx.db.insert("moderationActions", {
      adminId,
      targetType: "comment",
      targetId: commentId,
      action: "remove_content",
      notes: notes ?? "Comment deleted by admin",
      createdAt: Date.now(),
    });
    return null;
  },
});

// ============================================
// IAM (reference + audit) — minimal stubs for dashboard tooling
// ============================================

export const getIamReference = query({
  args: { adminId: v.id("users") },
  returns: v.any(),
  handler: async (ctx, { adminId }) => {
    await requireAdmin(ctx, adminId);
    return {
      permissions: [] as string[],
      rolePermissions: {} as Record<string, string[]>,
    };
  },
});

export const listIamAuditLog = query({
  args: {
    adminId: v.id("users"),
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  returns: v.any(),
  handler: async (ctx, { adminId, limit, cursor }) => {
    await requireAdmin(ctx, adminId);
    const take = Math.min(limit ?? 40, 100);
    let q = ctx.db.query("moderationActions").order("desc");
    if (cursor !== undefined) {
      q = q.filter((qi) => qi.lt(qi.field("createdAt"), cursor));
    }
    const rows = await q.take(take);
    const nextCursor =
      rows.length === take ? rows[rows.length - 1].createdAt : undefined;

    const enriched = await Promise.all(
      rows.map(async (row) => {
        const adminUser = await ctx.db.get(row.adminId);
        return {
          ...row,
          adminName: adminUser?.username ?? adminUser?.email ?? "Unknown",
        };
      }),
    );

    return { rows: enriched, nextCursor };
  },
});

/** Assign or clear public verification badge (admin tooling / dashboard). */
export const setUserVerification = mutation({
  args: {
    adminId: v.id("users"),
    userId: v.id("users"),
    tier: v.union(
      v.literal("blue"),
      v.literal("gold"),
      v.literal("gray"),
      v.null(),
    ),
    pending: v.optional(v.boolean()),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, { adminId, userId, tier, pending }) => {
    await requireAdmin(ctx, adminId);
    const target = await ctx.db.get(userId);
    if (!target) throw new Error("User not found");
    if (tier === null) {
      await ctx.db.patch(userId, {
        verificationTier: undefined,
        verificationPending: undefined,
      });
    } else {
      await ctx.db.patch(userId, {
        verificationTier: tier,
        // Omitted or false → approved (show badge when tier is set). `true` = under review.
        verificationPending: pending === true,
      });
    }
    return { ok: true };
  },
});
