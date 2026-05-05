/**
 * Post collaboration invites — pending / accepted / rejected / removed.
 */

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { assertUserCanMutate } from "./accountModeration";
import { appendOutboundChatMessage, getOrCreateDirectConversationId } from "./messages";
import { syncPostDistributionUserIds } from "./postDistribution";
import { usersBlockedEitherWay } from "./viewerContentFilters";
import { loadSearchExcludedUserIds } from "./viewerContentFilters";

const MAX_COLLABORATORS = 5;

/** Public shape for clients: host + everyone on the collaboration (pending viewer only). */
export type CollaborationInviteRoster = {
  creator: {
    userId: Id<"users">;
    username?: string;
    fullName?: string;
    profilePictureUrl?: string;
    profilePictureKey?: string;
    verificationTier?: "blue" | "gold" | "gray";
  };
  members: Array<{
    collaborationId: Id<"postCollaborators">;
    status: "pending" | "accepted" | "rejected";
    userId: Id<"users">;
    username?: string;
    fullName?: string;
    profilePictureUrl?: string;
    profilePictureKey?: string;
    verificationTier?: "blue" | "gold" | "gray";
  }>;
};

function verificationTierForUser(
  u: Doc<"users">,
): "blue" | "gold" | "gray" | undefined {
  if (u.verificationPending === true) return undefined;
  if (
    u.verificationTier === "blue" ||
    u.verificationTier === "gold" ||
    u.verificationTier === "gray"
  ) {
    return u.verificationTier;
  }
  return undefined;
}

/**
 * When the viewer has a pending invite, returns the post author + all active
 * invite rows so the client can show “who’s on this collab” before they accept.
 */
export async function collaborationInviteRosterForPendingViewer(
  ctx: QueryCtx,
  post: Doc<"posts">,
  rows: Doc<"postCollaborators">[],
  viewerId: Id<"users">,
): Promise<CollaborationInviteRoster | undefined> {
  if (String(post.userId) === String(viewerId)) return undefined;
  const mine = rows.find(
    (r) => String(r.collaboratorUserId) === String(viewerId),
  );
  if (!mine || mine.status !== "pending") return undefined;

  const creator = await ctx.db.get(post.userId);
  if (!creator) return undefined;

  const creatorVt = verificationTierForUser(creator);
  const creatorOut: CollaborationInviteRoster["creator"] = {
    userId: creator._id,
    username: creator.username,
    fullName: creator.fullName,
    profilePictureUrl: creator.profilePictureUrl,
    profilePictureKey: creator.profilePictureKey,
    ...(creatorVt ? { verificationTier: creatorVt } : {}),
  };

  const statusOrder = (s: Doc<"postCollaborators">["status"]): number => {
    if (s === "pending") return 0;
    if (s === "accepted") return 1;
    if (s === "rejected") return 2;
    return 3;
  };

  const sorted = [...rows]
    .filter((r) => r.status !== "removed")
    .sort((a, b) => {
      const d = statusOrder(a.status) - statusOrder(b.status);
      if (d !== 0) return d;
      return (b.invitedAt ?? 0) - (a.invitedAt ?? 0);
    });

  const members: CollaborationInviteRoster["members"] = [];
  for (const r of sorted) {
    if (
      r.status !== "pending" &&
      r.status !== "accepted" &&
      r.status !== "rejected"
    ) {
      continue;
    }
    const u = await ctx.db.get(r.collaboratorUserId);
    if (!u) continue;
    const vt = verificationTierForUser(u);
    members.push({
      collaborationId: r._id,
      status: r.status,
      userId: u._id,
      username: u.username,
      fullName: u.fullName,
      profilePictureUrl: u.profilePictureUrl,
      profilePictureKey: u.profilePictureKey,
      ...(vt ? { verificationTier: vt } : {}),
    });
  }

  return { creator: creatorOut, members };
}

async function assertCreatorOwnsPost(
  ctx: MutationCtx,
  userId: Id<"users">,
  postId: Id<"posts">,
) {
  const post = await ctx.db.get(postId);
  if (!post) throw new Error("Post not found");
  if (String(post.userId) !== String(userId)) throw new Error("Unauthorized");
  return post;
}

export const finalizeInvitesAfterPublish = mutation({
  args: {
    creatorId: v.id("users"),
    postId: v.id("posts"),
    inviteeUserIds: v.array(v.id("users")),
  },
  returns: v.null(),
  handler: async (ctx, { creatorId, postId, inviteeUserIds }) => {
    await assertUserCanMutate(ctx, creatorId);
    const post = await assertCreatorOwnsPost(ctx, creatorId, postId);
    if (post.status !== "published") {
      throw new Error("Post must be published");
    }

    const exclude = await loadSearchExcludedUserIds(ctx, creatorId);
    const unique = [...new Set(inviteeUserIds.map(String))].map(
      (s) => s as Id<"users">,
    );
    const capped = unique.slice(0, MAX_COLLABORATORS);
    const now = Date.now();

    for (const uid of capped) {
      if (String(uid) === String(creatorId)) continue;
      if (exclude.has(String(uid))) continue;
      if (await usersBlockedEitherWay(ctx, creatorId, uid)) continue;

      const dup = await ctx.db
        .query("postCollaborators")
        .withIndex("by_post_collaborator", (q) =>
          q.eq("postId", postId).eq("collaboratorUserId", uid),
        )
        .unique();
      if (dup) continue;

      const existingForPost = await ctx.db
        .query("postCollaborators")
        .withIndex("by_post", (q) => q.eq("postId", postId))
        .collect();
      const active = existingForPost.filter(
        (r) => r.status === "pending" || r.status === "accepted",
      );
      if (active.length >= MAX_COLLABORATORS) break;

      const rowId = await ctx.db.insert("postCollaborators", {
        postId,
        creatorUserId: creatorId,
        collaboratorUserId: uid,
        status: "pending",
        source: "post_creation",
        invitedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      await ctx.scheduler.runAfter(
        0,
        internal.postCollaborators.deliverCollaborationInviteEffects,
        { collaborationId: rowId },
      );
    }
    await syncPostDistributionUserIds(ctx, postId);
    return null;
  },
});

export const deliverCollaborationInviteEffects = internalMutation({
  args: { collaborationId: v.id("postCollaborators") },
  returns: v.null(),
  handler: async (ctx, { collaborationId }) => {
    const row = await ctx.db.get(collaborationId);
    if (!row || row.status !== "pending") return null;

    const inviter = await ctx.db.get(row.creatorUserId);
    const invitee = await ctx.db.get(row.collaboratorUserId);
    if (!inviter || !invitee) return null;

    if (await usersBlockedEitherWay(ctx, row.creatorUserId, row.collaboratorUserId)) {
      return null;
    }

    // In-app notification (same category as tags / mentions).
    const settings = await ctx.db
      .query("userNotificationSettings")
      .withIndex("by_user", (q) => q.eq("userId", row.collaboratorUserId))
      .unique();
    if (settings?.tagPostInApp !== false) {
      const existing = await ctx.db
        .query("notificationGroups")
        .withIndex("by_receiver_target", (q) =>
          q
            .eq("receiverId", row.collaboratorUserId)
            .eq("type", "collaboration_invite")
            .eq("targetType", "post")
            .eq("targetId", row.postId),
        )
        .unique();
      const now = Date.now();
      if (existing) {
        await ctx.db.patch(existing._id, {
          count: existing.count + 1,
          latestSenderIds: [
            row.creatorUserId,
            ...existing.latestSenderIds.slice(0, 4),
          ],
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("notificationGroups", {
          receiverId: row.collaboratorUserId,
          type: "collaboration_invite",
          targetType: "post",
          targetId: row.postId,
          count: 1,
          latestSenderIds: [row.creatorUserId],
          updatedAt: now,
        });
      }
    }

    const clientMessageId = `collab-invite-${String(collaborationId)}`;
    let conversationId: Id<"conversations">;
    try {
      conversationId = await getOrCreateDirectConversationId(
        ctx,
        row.creatorUserId,
        row.collaboratorUserId,
      );
    } catch {
      return null;
    }

    const result = await appendOutboundChatMessage(ctx, {
      viewerId: row.creatorUserId,
      conversationId,
      type: "collab_invite",
      text: "You've been invited to collaborate on a post.",
      postId: row.postId,
      collaborationInviteId: collaborationId,
      clientMessageId,
    });

    if (!result.deduped) {
      await ctx.db.patch(collaborationId, {
        dmClientMessageId: clientMessageId,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

export const respondToInvite = mutation({
  args: {
    userId: v.id("users"),
    collaborationId: v.id("postCollaborators"),
    accept: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { userId, collaborationId, accept }) => {
    await assertUserCanMutate(ctx, userId);
    const row = await ctx.db.get(collaborationId);
    if (!row) throw new Error("Invite not found");
    if (String(row.collaboratorUserId) !== String(userId)) {
      throw new Error("Unauthorized");
    }
    if (row.status !== "pending") throw new Error("Invite is no longer pending");

    const now = Date.now();
    await ctx.db.patch(collaborationId, {
      status: accept ? "accepted" : "rejected",
      respondedAt: now,
      updatedAt: now,
    });
    await syncPostDistributionUserIds(ctx, row.postId);
    return null;
  },
});

export const removeCollaboratorByCreator = mutation({
  args: {
    creatorId: v.id("users"),
    postId: v.id("posts"),
    collaboratorUserId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertUserCanMutate(ctx, args.creatorId);
    await assertCreatorOwnsPost(ctx, args.creatorId, args.postId);
    const row = await ctx.db
      .query("postCollaborators")
      .withIndex("by_post_collaborator", (q) =>
        q.eq("postId", args.postId).eq("collaboratorUserId", args.collaboratorUserId),
      )
      .unique();
    if (!row) return null;
    if (row.status !== "pending" && row.status !== "accepted") return null;
    await ctx.db.patch(row._id, {
      status: "removed",
      updatedAt: Date.now(),
    });
    await syncPostDistributionUserIds(ctx, args.postId);
    return null;
  },
});

export const leaveCollaboration = mutation({
  args: {
    userId: v.id("users"),
    postId: v.id("posts"),
  },
  returns: v.null(),
  handler: async (ctx, { userId, postId }) => {
    await assertUserCanMutate(ctx, userId);
    const row = await ctx.db
      .query("postCollaborators")
      .withIndex("by_post_collaborator", (q) =>
        q.eq("postId", postId).eq("collaboratorUserId", userId),
      )
      .unique();
    if (!row || row.status !== "accepted") return null;
    await ctx.db.patch(row._id, {
      status: "removed",
      updatedAt: Date.now(),
    });
    await syncPostDistributionUserIds(ctx, postId);
    return null;
  },
});

export const listAcceptedCollaboratorsForPosts = query({
  args: { postIds: v.array(v.id("posts")) },
  returns: v.record(
    v.string(),
    v.array(
      v.object({
        userId: v.id("users"),
        username: v.optional(v.string()),
        fullName: v.optional(v.string()),
        profilePictureUrl: v.optional(v.string()),
        profilePictureKey: v.optional(v.string()),
        verificationTier: v.optional(
          v.union(v.literal("blue"), v.literal("gold"), v.literal("gray")),
        ),
      }),
    ),
  ),
  handler: async (ctx, { postIds }) => {
    const out: Record<
      string,
      Array<{
        userId: Id<"users">;
        username?: string;
        fullName?: string;
        profilePictureUrl?: string;
        profilePictureKey?: string;
        verificationTier?: "blue" | "gold" | "gray";
      }>
    > = {};
    for (const postId of postIds) {
      out[String(postId)] = [];
    }
    for (const postId of postIds) {
      const rows = await ctx.db
        .query("postCollaborators")
        .withIndex("by_post", (q) => q.eq("postId", postId))
        .collect();
      const accepted = rows.filter((r) => r.status === "accepted");
      const users: (typeof out)[string] = [];
      for (const r of accepted) {
        const u = await ctx.db.get(r.collaboratorUserId);
        if (!u?.username) continue;
        const vt =
          u.verificationPending === true
            ? undefined
            : u.verificationTier === "blue" ||
                u.verificationTier === "gold" ||
                u.verificationTier === "gray"
              ? u.verificationTier
              : undefined;
        users.push({
          userId: u._id,
          username: u.username,
          fullName: u.fullName,
          profilePictureUrl: u.profilePictureUrl,
          profilePictureKey: u.profilePictureKey,
          verificationTier: vt,
        });
      }
      out[String(postId)] = users;
    }
    return out;
  },
});

const collaborationInviteRosterMemberV = v.object({
  collaborationId: v.id("postCollaborators"),
  status: v.union(
    v.literal("pending"),
    v.literal("accepted"),
    v.literal("rejected"),
  ),
  userId: v.id("users"),
  username: v.optional(v.string()),
  fullName: v.optional(v.string()),
  profilePictureUrl: v.optional(v.string()),
  profilePictureKey: v.optional(v.string()),
  verificationTier: v.optional(
    v.union(v.literal("blue"), v.literal("gold"), v.literal("gray")),
  ),
});

const collaborationInviteRosterV = v.object({
  creator: v.object({
    userId: v.id("users"),
    username: v.optional(v.string()),
    fullName: v.optional(v.string()),
    profilePictureUrl: v.optional(v.string()),
    profilePictureKey: v.optional(v.string()),
    verificationTier: v.optional(
      v.union(v.literal("blue"), v.literal("gold"), v.literal("gray")),
    ),
  }),
  members: v.array(collaborationInviteRosterMemberV),
});

/**
 * Single subscription for post detail, collaborator sheet, and feed banners:
 * viewer invite state, creator flag, and full invite list (creator only).
 */
export const getPostCollaborationUiState = query({
  args: {
    postId: v.id("posts"),
    viewerId: v.optional(v.id("users")),
  },
  returns: v.object({
    viewerInvite: v.union(
      v.null(),
      v.object({
        collaborationId: v.id("postCollaborators"),
        status: v.union(
          v.literal("pending"),
          v.literal("accepted"),
          v.literal("rejected"),
          v.literal("removed"),
        ),
      }),
    ),
    isPostCreator: v.boolean(),
    creatorInvites: v.array(
      v.object({
        collaborationId: v.id("postCollaborators"),
        status: v.union(
          v.literal("pending"),
          v.literal("accepted"),
          v.literal("rejected"),
          v.literal("removed"),
        ),
        invitedAt: v.number(),
        respondedAt: v.optional(v.number()),
        userId: v.id("users"),
        username: v.optional(v.string()),
        fullName: v.optional(v.string()),
        profilePictureUrl: v.optional(v.string()),
        profilePictureKey: v.optional(v.string()),
        verificationTier: v.optional(
          v.union(v.literal("blue"), v.literal("gold"), v.literal("gray")),
        ),
      }),
    ),
    inviteRoster: v.union(v.null(), collaborationInviteRosterV),
  }),
  handler: async (ctx, { postId, viewerId }) => {
    const post = await ctx.db.get(postId);
    if (!post) {
      return {
        viewerInvite: null,
        isPostCreator: false,
        creatorInvites: [],
        inviteRoster: null,
      };
    }

    const isPostCreator =
      viewerId != null && String(post.userId) === String(viewerId);

    const rows = await ctx.db
      .query("postCollaborators")
      .withIndex("by_post", (q) => q.eq("postId", postId))
      .collect();

    let viewerInvite: {
      collaborationId: Id<"postCollaborators">;
      status: Doc<"postCollaborators">["status"];
    } | null = null;
    if (viewerId) {
      const mine = rows.find(
        (r) => String(r.collaboratorUserId) === String(viewerId),
      );
      if (mine) {
        viewerInvite = { collaborationId: mine._id, status: mine.status };
      }
    }

    const creatorInvites: Array<{
      collaborationId: Id<"postCollaborators">;
      status: Doc<"postCollaborators">["status"];
      invitedAt: number;
      respondedAt?: number;
      userId: Id<"users">;
      username?: string;
      fullName?: string;
      profilePictureUrl?: string;
      profilePictureKey?: string;
      verificationTier?: "blue" | "gold" | "gray";
    }> = [];

    if (isPostCreator) {
      const statusOrder = (
        s: Doc<"postCollaborators">["status"],
      ): number => {
        if (s === "pending") return 0;
        if (s === "accepted") return 1;
        if (s === "rejected") return 2;
        return 3;
      };

      const sorted = [...rows].sort((a, b) => {
        const d = statusOrder(a.status) - statusOrder(b.status);
        if (d !== 0) return d;
        return (b.invitedAt ?? 0) - (a.invitedAt ?? 0);
      });

      for (const r of sorted) {
        if (r.status === "removed") continue;
        const u = await ctx.db.get(r.collaboratorUserId);
        if (!u) continue;
        const vt =
          u.verificationPending === true
            ? undefined
            : u.verificationTier === "blue" ||
                u.verificationTier === "gold" ||
                u.verificationTier === "gray"
              ? u.verificationTier
              : undefined;
        creatorInvites.push({
          collaborationId: r._id,
          status: r.status,
          invitedAt: r.invitedAt,
          respondedAt: r.respondedAt,
          userId: u._id,
          username: u.username,
          fullName: u.fullName,
          profilePictureUrl: u.profilePictureUrl,
          profilePictureKey: u.profilePictureKey,
          verificationTier: vt,
        });
      }
    }

    let inviteRoster: CollaborationInviteRoster | null = null;
    if (
      viewerId &&
      viewerInvite?.status === "pending" &&
      !isPostCreator
    ) {
      inviteRoster =
        (await collaborationInviteRosterForPendingViewer(
          ctx,
          post,
          rows,
          viewerId,
        )) ?? null;
    }

    return { viewerInvite, isPostCreator, creatorInvites, inviteRoster };
  },
});

export const collaborationSheetRows = query({
  args: {
    postId: v.id("posts"),
  },
  returns: v.object({
    creator: v.union(
      v.object({
        userId: v.id("users"),
        username: v.optional(v.string()),
        fullName: v.optional(v.string()),
        profilePictureUrl: v.optional(v.string()),
        profilePictureKey: v.optional(v.string()),
        verificationTier: v.optional(
          v.union(v.literal("blue"), v.literal("gold"), v.literal("gray")),
        ),
        isCreator: v.literal(true),
      }),
      v.null(),
    ),
    collaborators: v.array(
      v.object({
        userId: v.id("users"),
        username: v.optional(v.string()),
        fullName: v.optional(v.string()),
        profilePictureUrl: v.optional(v.string()),
        profilePictureKey: v.optional(v.string()),
        verificationTier: v.optional(
          v.union(v.literal("blue"), v.literal("gold"), v.literal("gray")),
        ),
        isCreator: v.literal(false),
      }),
    ),
  }),
  handler: async (ctx, { postId }) => {
    const post = await ctx.db.get(postId);
    if (!post) {
      return { creator: null, collaborators: [] };
    }
    const creator = await ctx.db.get(post.userId);
    const creatorOut = creator
      ? {
          userId: creator._id,
          username: creator.username,
          fullName: creator.fullName,
          profilePictureUrl: creator.profilePictureUrl,
          profilePictureKey: creator.profilePictureKey,
          verificationTier:
            creator.verificationPending === true
              ? undefined
              : creator.verificationTier === "blue" ||
                  creator.verificationTier === "gold" ||
                  creator.verificationTier === "gray"
                ? creator.verificationTier
                : undefined,
          isCreator: true as const,
        }
      : null;

    const rows = await ctx.db
      .query("postCollaborators")
      .withIndex("by_post", (q) => q.eq("postId", postId))
      .collect();
    const accepted = rows.filter((r) => r.status === "accepted");
    const collaborators = [];
    for (const r of accepted) {
      const u = await ctx.db.get(r.collaboratorUserId);
      if (!u) continue;
      collaborators.push({
        userId: u._id,
        username: u.username,
        fullName: u.fullName,
        profilePictureUrl: u.profilePictureUrl,
        profilePictureKey: u.profilePictureKey,
        verificationTier:
          u.verificationPending === true
            ? undefined
            : u.verificationTier === "blue" ||
                u.verificationTier === "gold" ||
                u.verificationTier === "gray"
              ? u.verificationTier
              : undefined,
        isCreator: false as const,
      });
    }
    return { creator: creatorOut, collaborators };
  },
});
