import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalAction, mutation, query } from "./_generated/server";
import {
  getEffectiveAccountStatus,
  maybeReactivateExpiredSuspension,
} from "./accountModeration";
import { getAppealSubmittedEmail } from "./appealEmailTemplates";
import { sendEmailWithProvider } from "./emailProvider";

function toAppealReferenceCode(appealId: Id<"appeals">): string {
  const raw = String(appealId)
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();
  const tail = raw.slice(-8);
  return `AP-${tail || "PENDING"}`;
}

/** Returns Convex storage upload URL (same pattern as profile image upload). */
export const generateAppealAttachmentUploadUrl = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const u = await maybeReactivateExpiredSuspension(ctx, userId);
    if (!u) throw new Error("Unauthorized");
    const eff = getEffectiveAccountStatus(u);
    if (eff === "active") throw new Error("Account is not restricted");
    if (eff === "suspended" && u.appealAllowedWhileSuspended === false) {
      throw new Error("Appeals are not available for this suspension");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

export const submit = mutation({
  args: {
    userId: v.id("users"),
    reason: v.string(),
    details: v.optional(v.string()),
    attachments: v.optional(v.array(v.id("_storage"))),
  },
  returns: v.id("appeals"),
  handler: async (ctx, args): Promise<Id<"appeals">> => {
    const u = await maybeReactivateExpiredSuspension(ctx, args.userId);
    if (!u) throw new Error("Unauthorized");

    const eff = getEffectiveAccountStatus(u);
    if (eff === "active") {
      throw new Error("Account is not restricted");
    }

    if (eff === "suspended" && u.appealAllowedWhileSuspended === false) {
      throw new Error("Appeals are not available for this suspension");
    }

    const latest = await ctx.db
      .query("appeals")
      .withIndex("by_user_created", (q) => q.eq("userId", args.userId))
      .order("desc")
      .first();
    if (latest?.status === "pending") {
      throw new Error("You already have a pending appeal");
    }

    const trimmed = args.reason.trim();
    if (!trimmed) throw new Error("Reason is required");
    if (trimmed.length > 8000) throw new Error("Reason is too long");

    const now = Date.now();
    const appealId = await ctx.db.insert("appeals", {
      userId: args.userId,
      status: "pending",
      reason: trimmed,
      details: args.details?.trim() || undefined,
      attachments: args.attachments,
      createdAt: now,
    });

    const email = u.email?.trim().toLowerCase();
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const appealReferenceCode = toAppealReferenceCode(appealId);
      const combined =
        trimmed + (args.details?.trim() ? `\n\n${args.details.trim()}` : "");
      const preview =
        combined.length > 1200 ? `${combined.slice(0, 1200)}…` : combined;
      await ctx.scheduler.runAfter(
        0,
        internal.appeals.sendAppealConfirmationEmail,
        {
          to: email,
          username: u.username ?? "",
          reasonPreview: preview,
          appealReference: appealReferenceCode,
          lang: u.preferredLang === "ar" ? "ar" : "en",
        },
      );
    }

    return appealId;
  },
});

/** Sends branded confirmation via Resend/SES — failures are logged only. */
export const sendAppealConfirmationEmail = internalAction({
  args: {
    to: v.string(),
    username: v.string(),
    reasonPreview: v.string(),
    appealReference: v.string(),
    lang: v.union(v.literal("en"), v.literal("ar")),
  },
  returns: v.null(),
  handler: async (_ctx, args): Promise<null> => {
    try {
      const t = getAppealSubmittedEmail({
        username: args.username,
        reasonPreview: args.reasonPreview,
        appealReference: args.appealReference,
        lang: args.lang,
      });
      await sendEmailWithProvider({
        to: args.to.trim().toLowerCase(),
        subject: t.subject,
        html: t.html,
        text: t.text,
      });
    } catch (e) {
      console.error("[appeals] Failed to send confirmation email", e);
    }
    return null;
  },
});

/** One pending appeal per user (optional check from client). */
export const hasPendingAppeal = query({
  args: { userId: v.union(v.id("users"), v.string()) },
  returns: v.boolean(),
  handler: async (ctx, { userId }) => {
    const normalizedId =
      typeof userId === "string"
        ? await ctx.db.normalizeId("users", userId)
        : userId;
    if (!normalizedId) return false;
    const row = await ctx.db
      .query("appeals")
      .withIndex("by_user_created", (q) => q.eq("userId", normalizedId))
      .order("desc")
      .first();
    return row?.status === "pending";
  },
});

/** Latest appeal for the signed-in user (for restriction UI). */
export const latestForUser = query({
  args: { userId: v.union(v.id("users"), v.string()) },
  returns: v.union(
    v.object({
      _id: v.id("appeals"),
      status: v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("rejected"),
      ),
      createdAt: v.number(),
      reviewedAt: v.optional(v.number()),
      adminNote: v.optional(v.string()),
      /** Display-safe reference code for support. */
      reference: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, { userId }) => {
    const normalizedId =
      typeof userId === "string"
        ? await ctx.db.normalizeId("users", userId)
        : userId;
    if (!normalizedId) return null;

    const row = await ctx.db
      .query("appeals")
      .withIndex("by_user_created", (q) => q.eq("userId", normalizedId))
      .order("desc")
      .first();
    if (!row) return null;

    return {
      _id: row._id,
      status: row.status,
      createdAt: row.createdAt,
      reviewedAt: row.reviewedAt,
      adminNote: row.adminNote,
      reference: toAppealReferenceCode(row._id),
    };
  },
});

// ============================================
// ADMIN / MODERATION APPEALS
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

export const listAppeals = query({
  args: {
    adminId: v.id("users"),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("rejected"),
      ),
    ),
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    await requireStaff(ctx, args.adminId);
    const limit = args.limit ?? 25;

    let appeals: Doc<"appeals">[];
    if (args.status) {
      let q = ctx.db
        .query("appeals")
        .withIndex("by_status_created", (q) => q.eq("status", args.status!));
      if (args.cursor !== undefined) {
        q = q.filter((qi) => qi.lt(qi.field("createdAt"), args.cursor!));
      }
      appeals = await q.order("desc").take(limit + 1);
    } else {
      const all = await ctx.db
        .query("appeals")
        .order("desc")
        .take(limit * 3);
      if (args.cursor !== undefined) {
        appeals = all
          .filter((a) => a.createdAt < args.cursor!)
          .slice(0, limit + 1);
      } else {
        appeals = all.slice(0, limit + 1);
      }
    }

    let nextCursor: number | undefined;
    if (appeals.length > limit) {
      nextCursor = appeals[limit - 1].createdAt;
      appeals = appeals.slice(0, limit);
    }

    const enriched = await Promise.all(
      appeals.map(async (appeal) => {
        const user = await ctx.db.get(appeal.userId);
        const profilePic = await resolveProfilePicture(ctx, user);

        let reviewerName: string | undefined;
        if (appeal.reviewedBy) {
          const reviewer = await ctx.db.get(appeal.reviewedBy);
          reviewerName =
            reviewer?.username ?? reviewer?.email ?? "Unknown admin";
        }

        const attachmentUrls: string[] = [];
        if (appeal.attachments) {
          for (const storageId of appeal.attachments) {
            const url = await ctx.storage.getUrl(storageId);
            if (url) attachmentUrls.push(url);
          }
        }

        return {
          ...appeal,
          user: user
            ? {
                _id: user._id,
                username: user.username,
                email: user.email,
                fullName: user.fullName,
                profilePictureUrl: profilePic,
                accountModerationStatus:
                  user.accountModerationStatus ?? "active",
              }
            : null,
          reviewerName,
          attachmentUrls,
        };
      }),
    );

    return { appeals: enriched, nextCursor };
  },
});

export const getAppealDetail = query({
  args: {
    adminId: v.id("users"),
    appealId: v.id("appeals"),
  },
  returns: v.any(),
  handler: async (ctx, { adminId, appealId }) => {
    await requireStaff(ctx, adminId);

    const appeal = await ctx.db.get(appealId);
    if (!appeal) throw new Error("Appeal not found");

    const user = await ctx.db.get(appeal.userId);
    const profilePic = await resolveProfilePicture(ctx, user);

    let reviewerName: string | undefined;
    if (appeal.reviewedBy) {
      const reviewer = await ctx.db.get(appeal.reviewedBy);
      reviewerName = reviewer?.username ?? reviewer?.email ?? "Unknown admin";
    }

    const attachmentUrls: string[] = [];
    if (appeal.attachments) {
      for (const storageId of appeal.attachments) {
        const url = await ctx.storage.getUrl(storageId);
        if (url) attachmentUrls.push(url);
      }
    }

    const userAppeals = await ctx.db
      .query("appeals")
      .withIndex("by_user_created", (q) => q.eq("userId", appeal.userId))
      .order("desc")
      .collect();

    const moderationHistory = await ctx.db
      .query("moderationActions")
      .withIndex("by_target", (q) =>
        q.eq("targetType", "user").eq("targetId", appeal.userId),
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
      appeal: {
        ...appeal,
        attachmentUrls,
      },
      user: user
        ? {
            ...user,
            passwordHash: undefined,
            profilePictureUrl: profilePic,
          }
        : null,
      reviewerName,
      userAppeals,
      moderationHistory: enrichedHistory,
    };
  },
});

export const getAppealStats = query({
  args: { adminId: v.id("users") },
  returns: v.any(),
  handler: async (ctx, { adminId }) => {
    await requireStaff(ctx, adminId);
    const all = await ctx.db.query("appeals").collect();
    return {
      total: all.length,
      pending: all.filter((a) => a.status === "pending").length,
      approved: all.filter((a) => a.status === "approved").length,
      rejected: all.filter((a) => a.status === "rejected").length,
    };
  },
});

export const approveAppeal = mutation({
  args: {
    adminId: v.id("users"),
    appealId: v.id("appeals"),
    adminNote: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { adminId, appealId, adminNote }) => {
    const admin = await requireStaff(ctx, adminId);
    if (admin.staffRole !== "admin")
      throw new Error("Only admins can approve appeals");

    const appeal = await ctx.db.get(appealId);
    if (!appeal) throw new Error("Appeal not found");
    if (appeal.status !== "pending") throw new Error("Appeal already resolved");

    const now = Date.now();

    await ctx.db.patch(appealId, {
      status: "approved",
      reviewedBy: adminId,
      reviewedAt: now,
      adminNote,
    });

    await ctx.db.patch(appeal.userId, {
      accountModerationStatus: "active",
    });

    await ctx.db.insert("moderationActions", {
      adminId,
      targetType: "user",
      targetId: appeal.userId,
      action: "none",
      notes: `Appeal approved${adminNote ? `: ${adminNote}` : ""}. Account restored.`,
      createdAt: now,
    });

    return null;
  },
});

export const rejectAppeal = mutation({
  args: {
    adminId: v.id("users"),
    appealId: v.id("appeals"),
    adminNote: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { adminId, appealId, adminNote }) => {
    const admin = await requireStaff(ctx, adminId);
    if (admin.staffRole !== "admin")
      throw new Error("Only admins can reject appeals");

    const appeal = await ctx.db.get(appealId);
    if (!appeal) throw new Error("Appeal not found");
    if (appeal.status !== "pending") throw new Error("Appeal already resolved");

    const now = Date.now();

    await ctx.db.patch(appealId, {
      status: "rejected",
      reviewedBy: adminId,
      reviewedAt: now,
      adminNote,
    });

    await ctx.db.insert("moderationActions", {
      adminId,
      targetType: "user",
      targetId: appeal.userId,
      action: "none",
      notes: `Appeal rejected${adminNote ? `: ${adminNote}` : ""}. Restrictions remain.`,
      createdAt: now,
    });

    return null;
  },
});
