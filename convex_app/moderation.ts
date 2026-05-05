import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { SUSPEND_PRESET_MS, strikeEscalation } from "./accountModeration";
import {
  assertUserAccountActive,
  normalizeModerationStatus,
} from "./postModeration";

const reportReasonV = v.union(
  v.literal("spam"),
  v.literal("harassment"),
  v.literal("hate_speech"),
  v.literal("violence"),
  v.literal("nudity"),
  v.literal("misinformation"),
  v.literal("copyright"),
  v.literal("other"),
);

const reportStatusV = v.union(
  v.literal("pending"),
  v.literal("under_review"),
  v.literal("resolved"),
  v.literal("rejected"),
);

const reportTargetTypeV = v.union(
  v.literal("post"),
  v.literal("user"),
  v.literal("comment"),
);

const moderationActionV = v.union(
  v.literal("none"),
  v.literal("warn_user"),
  v.literal("remove_content"),
  v.literal("restrict_content"),
  v.literal("shadow_hide"),
  v.literal("ban_user"),
  v.literal("suspend_user"),
);

async function requireStaff(
  ctx: {
    db: {
      get: (id: Id<"users">) => Promise<Doc<"users"> | null>;
    };
  },
  userId: Id<"users">,
): Promise<void> {
  const user = await ctx.db.get(userId);
  if (user?.staffRole !== "admin" && user?.staffRole !== "moderator") {
    throw new Error("Forbidden");
  }
}

async function countOpenReportsOnTarget(
  ctx: any,
  targetType: Doc<"reports">["targetType"],
  targetId: string,
): Promise<number> {
  const rows = await ctx.db
    .query("reports")
    .withIndex("by_target", (q: any) =>
      q.eq("targetType", targetType).eq("targetId", targetId),
    )
    .collect();
  return rows.filter(
    (r: Doc<"reports">) =>
      r.status === "pending" || r.status === "under_review",
  ).length;
}

function computePriority(
  reason: Doc<"reports">["reason"],
  openCountBeforeInsert: number,
): Doc<"reports">["priority"] {
  if (reason === "violence" || reason === "hate_speech") return "high";
  if (openCountBeforeInsert >= 4) return "high";
  if (openCountBeforeInsert >= 2) return "medium";
  return "low";
}

async function validateReportTarget(
  ctx: any,
  targetType: Doc<"reports">["targetType"],
  targetId: string,
): Promise<void> {
  if (targetType === "post") {
    const post = await ctx.db.get(targetId as Id<"posts">);
    if (!post) throw new Error("Post not found");
    return;
  }
  if (targetType === "user") {
    const user = await ctx.db.get(targetId as Id<"users">);
    if (!user) throw new Error("User not found");
    return;
  }
  const comment = await ctx.db.get(targetId as Id<"comments">);
  if (!comment) throw new Error("Comment not found");
}

/**
 * Submit a report (post, user, or comment). Idempotent per reporter+target.
 * Uses weighted scoring: trusted users count more, new accounts count less.
 * Re-runs AI moderation when weighted report score >= 3.
 */
export const submitReport = mutation({
  args: {
    targetType: reportTargetTypeV,
    targetId: v.string(),
    reason: reportReasonV,
    description: v.optional(v.string()),
    /** Same pattern as other app mutations: RN passes viewer id (Convex auth may be unset). */
    userId: v.optional(v.id("users")),
  },
  returns: v.id("reports"),
  handler: async (ctx, args): Promise<Id<"reports">> => {
    const userId =
      args.userId ?? ((ctx as any).userId as Id<"users"> | undefined);
    if (!userId) throw new Error("Unauthorized");

    await assertUserAccountActive(ctx, userId);
    await validateReportTarget(ctx, args.targetType, args.targetId);

    const existing = await ctx.db
      .query("reports")
      .withIndex("by_target", (q) =>
        q.eq("targetType", args.targetType).eq("targetId", args.targetId),
      )
      .filter((q) => q.eq(q.field("reporterId"), userId))
      .first();

    if (existing) {
      throw new Error("You have already reported this content");
    }

    const openBefore = await countOpenReportsOnTarget(
      ctx,
      args.targetType,
      args.targetId,
    );
    const now = Date.now();
    const priority = computePriority(args.reason, openBefore);

    const reportId = await ctx.db.insert("reports", {
      reporterId: userId,
      targetType: args.targetType,
      targetId: args.targetId,
      reason: args.reason,
      description: args.description,
      status: "pending",
      priority,
      createdAt: now,
      updatedAt: now,
    });

    if (args.targetType === "post") {
      const postId = args.targetId as Id<"posts">;

      // Weighted report scoring: trusted users count more, new accounts less
      const allReports = await ctx.db
        .query("reports")
        .withIndex("by_target", (q) =>
          q.eq("targetType", "post").eq("targetId", args.targetId),
        )
        .filter((q) =>
          q.or(
            q.eq(q.field("status"), "pending"),
            q.eq(q.field("status"), "under_review"),
          ),
        )
        .collect();

      let weightedScore = 0;
      for (const report of allReports) {
        const reporter = await ctx.db.get(report.reporterId);
        if (!reporter) { weightedScore += 1; continue; }
        const ageDays = (now - reporter.createdAt) / (24 * 3600_000);
        const isStaff = reporter.staffRole === "admin" || reporter.staffRole === "moderator";
        const isTrusted = isStaff || (ageDays > 30 && (reporter.followerCount ?? 0) > 10);
        const isRecent = ageDays < 7;
        const weight = (isTrusted ? 2 : 1) * (isRecent ? 0.5 : 1);
        weightedScore += weight;
      }

      // Flag post at weighted score >= 2
      if (weightedScore >= 2) {
        const post = await ctx.db.get(postId);
        if (
          post &&
          normalizeModerationStatus(post.moderationStatus) === "active"
        ) {
          await ctx.db.patch(postId, {
            moderationStatus: "flagged",
            updatedAt: now,
          });
        }
      }

      // Re-run AI moderation at weighted score >= 3 (prevents brigading)
      if (weightedScore >= 3) {
        await ctx.scheduler.runAfter(
          0,
          internal.contentModeration.moderatePublishedPost,
          { postId, trigger: "report" as const },
        );
      }
    }

    return reportId;
  },
});

/** Staff: paginated queue (newest first). */
export const adminListReports = query({
  args: {
    viewerUserId: v.optional(v.id("users")),
    status: v.optional(reportStatusV),
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  returns: v.object({
    reports: v.array(v.any()),
    nextCursor: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const userId =
      args.viewerUserId ?? ((ctx as any).userId as Id<"users"> | undefined);
    if (!userId) return { reports: [], nextCursor: undefined };
    await requireStaff(ctx, userId);

    const limit = Math.min(Math.max(args.limit ?? 40, 1), 100);
    const cursor = args.cursor;

    let q = args.status
      ? ctx.db
          .query("reports")
          .withIndex("by_status_created", (iq) => iq.eq("status", args.status!))
      : ctx.db
          .query("reports")
          .withIndex("by_created", (iq) => iq.gte("createdAt", 0));

    if (cursor !== undefined) {
      q = q.filter((fq) => fq.lt(fq.field("createdAt"), cursor));
    }

    const rows = await q.order("desc").take(limit + 1);

    let nextCursor: number | undefined;
    if (rows.length > limit) {
      nextCursor = rows[limit - 1].createdAt;
      rows.pop();
    }

    return { reports: rows, nextCursor };
  },
});

/** Staff: workflow only — does not change content. */
export const adminSetReportStatus = mutation({
  args: {
    reportId: v.id("reports"),
    status: reportStatusV,
    viewerUserId: v.optional(v.id("users")),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const userId =
      args.viewerUserId ?? ((ctx as any).userId as Id<"users"> | undefined);
    if (!userId) throw new Error("Unauthorized");
    await requireStaff(ctx, userId);

    const row = await ctx.db.get(args.reportId);
    if (!row) throw new Error("Report not found");

    await ctx.db.patch(args.reportId, {
      status: args.status,
      updatedAt: Date.now(),
    });
    return null;
  },
});

async function insertActionAndMaybeResolveReport(
  ctx: any,
  args: {
    adminId: Id<"users">;
    targetType: Doc<"reports">["targetType"];
    targetId: string;
    action: Doc<"moderationActions">["action"];
    notes?: string;
    /** Stored on the row as `reason` (and mirrored from notes when omitted). */
    reason?: string;
    reportId?: Id<"reports">;
    resolveReport: boolean;
  },
): Promise<void> {
  const now = Date.now();
  const reasonText = args.reason ?? args.notes;
  await ctx.db.insert("moderationActions", {
    adminId: args.adminId,
    targetType: args.targetType,
    targetId: args.targetId,
    action: args.action,
    notes: args.notes,
    reason: reasonText,
    reportId: args.reportId,
    createdAt: now,
  });

  if (args.resolveReport && args.reportId) {
    await ctx.db.patch(args.reportId, {
      status: "resolved",
      updatedAt: now,
    });
  }
}

/**
 * Staff: apply a moderation decision and append an audit row.
 * Target id must match the Convex id string for that table.
 */
const suspendPresetV = v.optional(
  v.union(
    v.literal("24h"),
    v.literal("3d"),
    v.literal("7d"),
    v.literal("14d"),
    v.literal("custom"),
  ),
);

export const adminApplyModerationAction = mutation({
  args: {
    targetType: reportTargetTypeV,
    targetId: v.string(),
    action: moderationActionV,
    notes: v.optional(v.string()),
    reportId: v.optional(v.id("reports")),
    resolveLinkedReport: v.optional(v.boolean()),
    viewerUserId: v.optional(v.id("users")),
    /** When action is `suspend_user`: duration preset or custom ms. */
    suspendDurationPreset: suspendPresetV,
    suspendCustomDurationMs: v.optional(v.number()),
    /** Human-readable reason shown to the user (suspension / ban). */
    userFacingReason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const userId =
      args.viewerUserId ?? ((ctx as any).userId as Id<"users"> | undefined);
    if (!userId) throw new Error("Unauthorized");
    await requireStaff(ctx, userId);

    const now = Date.now();
    const resolveLinked = args.resolveLinkedReport ?? !!args.reportId;

    await insertActionAndMaybeResolveReport(ctx, {
      adminId: userId,
      targetType: args.targetType,
      targetId: args.targetId,
      action: args.action,
      notes: args.notes,
      reason: args.userFacingReason ?? args.notes,
      reportId: args.reportId,
      resolveReport: resolveLinked,
    });

    switch (args.action) {
      case "none":
      case "warn_user":
        break;
      case "remove_content":
        if (args.targetType === "post") {
          await ctx.db.patch(args.targetId as Id<"posts">, {
            moderationStatus: "removed",
            moderationVisibilityStatus: "hidden",
            updatedAt: now,
          });
        } else if (args.targetType === "comment") {
          await ctx.db.patch(args.targetId as Id<"comments">, {
            isDeleted: true,
            deletedAt: now,
            updatedAt: now,
          });
        }
        break;
      case "restrict_content":
        if (args.targetType === "post") {
          await ctx.db.patch(args.targetId as Id<"posts">, {
            moderationStatus: "restricted",
            moderationVisibilityStatus: "public",
            updatedAt: now,
          });
        }
        break;
      case "shadow_hide":
        if (args.targetType === "post") {
          await ctx.db.patch(args.targetId as Id<"posts">, {
            moderationVisibilityStatus: "shadow_hidden",
            moderationStatus: "active",
            updatedAt: now,
          });
        }
        break;
      case "ban_user":
        if (args.targetType === "user") {
          await ctx.db.patch(args.targetId as Id<"users">, {
            accountModerationStatus: "banned",
            banReason:
              args.userFacingReason ?? args.notes ?? "Community guidelines",
            suspensionEnd: undefined,
            suspensionReason: undefined,
          });
        }
        break;
      case "suspend_user":
        if (args.targetType === "user") {
          let durationMs = SUSPEND_PRESET_MS["24h"];
          const preset = args.suspendDurationPreset;
          if (preset === "custom") {
            durationMs = Math.min(
              Math.max(
                args.suspendCustomDurationMs ?? 24 * 60 * 60 * 1000,
                60_000,
              ),
              365 * 24 * 60 * 60 * 1000,
            );
          } else if (
            preset === "24h" ||
            preset === "3d" ||
            preset === "7d" ||
            preset === "14d"
          ) {
            durationMs = SUSPEND_PRESET_MS[preset];
          }
          await ctx.db.patch(args.targetId as Id<"users">, {
            accountModerationStatus: "suspended",
            suspensionEnd: now + durationMs,
            suspensionReason:
              args.userFacingReason ??
              args.notes ??
              "Your account was temporarily suspended.",
            banReason: undefined,
          });
        }
        break;
      default:
        break;
    }

    return null;
  },
});

/**
 * Staff: increment strike count and apply Instagram-style escalation (warn → suspend → ban).
 */
export const adminApplyStrike = mutation({
  args: {
    targetUserId: v.id("users"),
    viewerUserId: v.optional(v.id("users")),
    userFacingReason: v.optional(v.string()),
    reportId: v.optional(v.id("reports")),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const userId =
      args.viewerUserId ?? ((ctx as any).userId as Id<"users"> | undefined);
    if (!userId) throw new Error("Unauthorized");
    await requireStaff(ctx, userId);

    const target = await ctx.db.get(args.targetUserId);
    if (!target) throw new Error("User not found");

    const nextStrike = (target.strikeCount ?? 0) + 1;
    const escalation = strikeEscalation(nextStrike);
    const now = Date.now();
    const reason = args.userFacingReason ?? "Community guidelines";

    if (escalation.kind === "warning") {
      await ctx.db.patch(args.targetUserId, { strikeCount: nextStrike });
    } else if (escalation.kind === "suspend") {
      await ctx.db.patch(args.targetUserId, {
        strikeCount: nextStrike,
        accountModerationStatus: "suspended",
        suspensionEnd: now + escalation.durationMs,
        suspensionReason: reason,
        banReason: undefined,
      });
    } else {
      await ctx.db.patch(args.targetUserId, {
        strikeCount: nextStrike,
        accountModerationStatus: "banned",
        banReason: reason,
        suspensionEnd: undefined,
        suspensionReason: undefined,
      });
    }

    await ctx.db.insert("moderationActions", {
      adminId: userId,
      targetType: "user",
      targetId: String(args.targetUserId),
      action: "warn_user",
      notes: `strike_${nextStrike}`,
      reason,
      reportId: args.reportId,
      createdAt: now,
    });

    return null;
  },
});

/**
 * Staff: dismiss a report and restore a merely `flagged` post to active when appropriate.
 */
export const adminRejectReport = mutation({
  args: {
    reportId: v.id("reports"),
    notes: v.optional(v.string()),
    viewerUserId: v.optional(v.id("users")),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const userId =
      args.viewerUserId ?? ((ctx as any).userId as Id<"users"> | undefined);
    if (!userId) throw new Error("Unauthorized");
    await requireStaff(ctx, userId);

    const report = await ctx.db.get(args.reportId);
    if (!report) throw new Error("Report not found");

    const now = Date.now();
    const rejectNote = args.notes ?? "report_rejected";
    await ctx.db.insert("moderationActions", {
      adminId: userId,
      targetType: report.targetType,
      targetId: report.targetId,
      action: "none",
      notes: rejectNote,
      reason: rejectNote,
      reportId: args.reportId,
      createdAt: now,
    });

    await ctx.db.patch(args.reportId, {
      status: "rejected",
      updatedAt: now,
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
          updatedAt: now,
        });
      }
    }

    return null;
  },
});
