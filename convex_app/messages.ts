import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { assertUserCanMutate } from "./accountModeration";
import { verificationTierPayload } from "./verificationTier";
import { userHiddenFromPublicDiscovery } from "./staffVisibility";
import {
  notificationSuppressedBetween,
  usersBlockedEitherWay,
} from "./viewerContentFilters";

const MESSAGE_PREVIEW_MAX = 120;

type MessageType = Doc<"messages">["type"];
type DbCtx = MutationCtx | QueryCtx;

function normalizePreview(type: MessageType, text?: string): string {
  const trimmed = (text ?? "").trim();
  if (type === "text" && trimmed.length > 0) {
    return trimmed.slice(0, MESSAGE_PREVIEW_MAX);
  }
  switch (type) {
    case "image":
      return "Photo";
    case "video":
      return "Video";
    case "voice":
      return "Voice message";
    case "post_share":
      return "Shared a post";
    case "collab_invite":
      return "Collaboration invite";
    case "story_reply":
      return "Replied to a story";
    case "gif":
      return "GIF";
    case "location":
      return "Location";
    default:
      return "Message";
  }
}

/** Short quote line for inline reply UI (client + server). */
export function replySnippetFromMessageDoc(m: Doc<"messages">): string {
  const cap = (s: string) => {
    const t = s.trim();
    return t.length > 120 ? `${t.slice(0, 117)}...` : t;
  };
  if (m.type === "text") {
    const s = cap(m.text ?? "");
    return s.length > 0 ? s : "Message";
  }
  if (m.type === "post_share") {
    const s = cap(m.text ?? "");
    return s.length > 0 ? s : "Shared a post";
  }
  if (m.type === "collab_invite") {
    const s = cap(m.text ?? "");
    return s.length > 0 ? s : "Collaboration invite";
  }
  return normalizePreview(m.type, m.text);
}

async function requireMembership(
  ctx: DbCtx,
  conversationId: Id<"conversations">,
  userId: Id<"users">,
) {
  const membership = await ctx.db
    .query("conversationMembers")
    .withIndex("by_conversation_user", (q) =>
      q.eq("conversationId", conversationId).eq("userId", userId),
    )
    .unique();
  if (!membership) throw new Error("Conversation not found");
  return membership;
}

async function listConversationMembers(
  ctx: DbCtx,
  conversationId: Id<"conversations">,
) {
  return await ctx.db
    .query("conversationMembers")
    .withIndex("by_conversation_joined", (q) =>
      q.eq("conversationId", conversationId),
    )
    .collect();
}

/**
 * Find or create a 1:1 primary DM between viewer and peer (no `assertUserCanMutate` — caller must verify).
 */
export async function getOrCreateDirectConversationId(
  ctx: MutationCtx,
  viewerId: Id<"users">,
  peerUserId: Id<"users">,
): Promise<Id<"conversations">> {
  if (viewerId === peerUserId) throw new Error("Invalid peer");
  const blocked = await usersBlockedEitherWay(ctx, viewerId, peerUserId);
  if (blocked) throw new Error("Cannot message this user");

  const mine = await ctx.db
    .query("conversationMembers")
    .withIndex("by_user_updated", (q) => q.eq("userId", viewerId))
    .collect();
  for (const m of mine) {
    const conv = await ctx.db.get(m.conversationId);
    if (!conv || conv.isGroup || conv.participants.length !== 2) continue;
    const participants = new Set(conv.participants.map(String));
    if (
      participants.has(String(viewerId)) &&
      participants.has(String(peerUserId))
    ) {
      return conv._id;
    }
  }

  const now = Date.now();
  const conversationId = await ctx.db.insert("conversations", {
    type: "primary",
    isGroup: false,
    participants: [viewerId, peerUserId],
    lastMessageAt: now,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("conversationMembers", {
    conversationId,
    userId: viewerId,
    role: "member",
    folder: "primary",
    unreadCount: 0,
    lastInteractionAt: now,
    joinedAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("conversationMembers", {
    conversationId,
    userId: peerUserId,
    role: "member",
    folder: "primary",
    unreadCount: 0,
    lastInteractionAt: now,
    joinedAt: now,
    updatedAt: now,
  });
  return conversationId;
}

/** Insert a message and update conversation + member unread state (shared by `sendMessage` and story flows). */
export async function appendOutboundChatMessage(
  ctx: MutationCtx,
  args: {
    viewerId: Id<"users">;
    conversationId: Id<"conversations">;
    type: MessageType;
    text?: string;
    mediaKey?: string;
    mediaStorageRegion?: string;
    mediaMimeType?: string;
    mediaDurationMs?: number;
    mediaThumbKey?: string;
    mediaThumbStorageRegion?: string;
    viewOnce?: boolean;
    postId?: Id<"posts">;
    storyId?: Id<"stories">;
    gifUrl?: string;
    gifPreviewUrl?: string;
    gifWidth?: number;
    gifHeight?: number;
    gifKind?: "gif" | "sticker";
    location?: {
      latitude: number;
      longitude: number;
      label?: string;
    };
    clientMessageId?: string;
    replyToMessageId?: Id<"messages">;
    collaborationInviteId?: Id<"postCollaborators">;
  },
): Promise<{
  messageId: Id<"messages">;
  deduped: boolean;
  conversationMemberId?: Id<"conversationMembers">;
}> {
  const membership = await requireMembership(
    ctx,
    args.conversationId,
    args.viewerId,
  );
  const conversation = await ctx.db.get(args.conversationId);
  if (!conversation) throw new Error("Conversation not found");

  if (args.clientMessageId) {
    const existing = await ctx.db
      .query("messages")
      .withIndex("by_client_message_id", (q) =>
        q.eq("clientMessageId", args.clientMessageId),
      )
      .collect();
    const dup = existing.find((m) => m.senderId === args.viewerId);
    if (dup) return { messageId: dup._id, deduped: true };
  }

  for (const participantId of conversation.participants) {
    if (participantId === args.viewerId) continue;
    const blocked = await usersBlockedEitherWay(
      ctx,
      args.viewerId,
      participantId,
    );
    if (blocked) throw new Error("Cannot send to blocked user");
  }

  let replySnippet: string | undefined;
  let replyToSenderId: Id<"users"> | undefined;
  if (args.replyToMessageId) {
    const parent = await ctx.db.get(args.replyToMessageId);
    if (!parent || parent.conversationId !== args.conversationId) {
      throw new Error("Invalid reply target");
    }
    if (parent.status === "deleted") {
      throw new Error("Cannot reply to this message");
    }
    replySnippet = replySnippetFromMessageDoc(parent);
    replyToSenderId = parent.senderId;
  }

  const now = Date.now();
  const messageId = await ctx.db.insert("messages", {
    conversationId: args.conversationId,
    senderId: args.viewerId,
    type: args.type,
    text: args.text?.trim() || undefined,
    mediaKey: args.mediaKey,
    ...(args.mediaStorageRegion?.trim()
      ? { mediaStorageRegion: args.mediaStorageRegion.trim() }
      : {}),
    mediaMimeType: args.mediaMimeType,
    mediaDurationMs: args.mediaDurationMs,
    mediaThumbKey: args.mediaThumbKey,
    ...(args.mediaThumbStorageRegion?.trim()
      ? { mediaThumbStorageRegion: args.mediaThumbStorageRegion.trim() }
      : {}),
    viewOnce: args.viewOnce,
    viewedOnceBy: args.viewOnce ? [args.viewerId] : undefined,
    postId: args.postId,
    ...(args.collaborationInviteId
      ? { collaborationInviteId: args.collaborationInviteId }
      : {}),
    storyId: args.storyId,
    gifUrl: args.gifUrl,
    ...(args.gifPreviewUrl?.trim()
      ? { gifPreviewUrl: args.gifPreviewUrl.trim() }
      : {}),
    ...(args.gifWidth != null && args.gifWidth > 0
      ? { gifWidth: args.gifWidth }
      : {}),
    ...(args.gifHeight != null && args.gifHeight > 0
      ? { gifHeight: args.gifHeight }
      : {}),
    ...(args.gifKind ? { gifKind: args.gifKind } : {}),
    location: args.location,
    status: "sent",
    seenBy: [args.viewerId],
    createdAt: now,
    clientMessageId: args.clientMessageId,
    ...(args.replyToMessageId && replySnippet
      ? {
          replyToMessageId: args.replyToMessageId,
          replySnippet,
          replyToSenderId,
        }
      : {}),
  });
  let preview = normalizePreview(args.type, args.text);
  if (args.storyId != null && args.type === "text") {
    const core = preview.trim().length > 0 ? preview.trim() : "Message";
    preview = `Story · ${core}`.slice(0, MESSAGE_PREVIEW_MAX);
  }
  await ctx.db.patch(args.conversationId, {
    lastMessageId: messageId,
    lastMessageType: args.type,
    lastMessagePreview: preview,
    lastSenderId: args.viewerId,
    lastMessageAt: now,
    updatedAt: now,
  });

  const members = await listConversationMembers(ctx, args.conversationId);
  await Promise.all(
    members.map(async (member) => {
      if (member.userId === args.viewerId) {
        await ctx.db.patch(member._id, {
          unreadCount: 0,
          lastReadAt: now,
          lastReadMessageAt: now,
          lastInteractionAt: now,
          updatedAt: now,
        });
        return;
      }
      await ctx.db.patch(member._id, {
        unreadCount: member.unreadCount + 1,
        updatedAt: now,
      });
      await upsertMessageNotification(
        ctx,
        member.userId,
        args.viewerId,
        args.conversationId,
      );
    }),
  );
  return {
    messageId,
    deduped: false,
    conversationMemberId: membership._id,
  };
}

async function upsertMessageNotification(
  ctx: MutationCtx,
  receiverId: Id<"users">,
  senderId: Id<"users">,
  conversationId: Id<"conversations">,
) {
  const suppressed = await notificationSuppressedBetween(
    ctx,
    receiverId,
    senderId,
  );
  if (suppressed) return;
  const settings = await ctx.db
    .query("userNotificationSettings")
    .withIndex("by_user", (q) => q.eq("userId", receiverId))
    .unique();
  if (settings?.messageInApp === false) return;
  if (settings?.onlyFromFollowing) {
    const follows = await ctx.db
      .query("follows")
      .withIndex("by_follower_following", (q) =>
        q.eq("followerId", receiverId).eq("followingId", senderId),
      )
      .unique();
    if (follows?.status !== "active") return;
  }

  const existing = await ctx.db
    .query("notificationGroups")
    .withIndex("by_receiver_target", (q) =>
      q
        .eq("receiverId", receiverId)
        .eq("type", "message_new")
        .eq("targetType", "user")
        .eq("targetId", String(conversationId)),
    )
    .unique();
  const now = Date.now();
  if (existing) {
    const latestSenderIds = [
      senderId,
      ...existing.latestSenderIds.filter((id) => id !== senderId),
    ].slice(0, 5);
    await ctx.db.patch(existing._id, {
      count: existing.count + 1,
      latestSenderIds,
      readAt: undefined,
      updatedAt: now,
    });
    return;
  }
  await ctx.db.insert("notificationGroups", {
    receiverId,
    type: "message_new",
    targetType: "user",
    targetId: String(conversationId),
    count: 1,
    latestSenderIds: [senderId],
    updatedAt: now,
  });
}

export const createOrGetDirectConversation = mutation({
  args: { viewerId: v.id("users"), peerUserId: v.id("users") },
  handler: async (ctx, { viewerId, peerUserId }) => {
    await assertUserCanMutate(ctx, viewerId);
    const conversationId = await getOrCreateDirectConversationId(
      ctx,
      viewerId,
      peerUserId,
    );
    return { conversationId };
  },
});

export const createGroupConversation = mutation({
  args: {
    viewerId: v.id("users"),
    participantIds: v.array(v.id("users")),
    title: v.optional(v.string()),
  },
  handler: async (ctx, { viewerId, participantIds, title }) => {
    await assertUserCanMutate(ctx, viewerId);
    const ids = Array.from(new Set([viewerId, ...participantIds]));
    if (ids.length < 3) throw new Error("Group must have at least 3 members");
    const now = Date.now();
    const conversationId = await ctx.db.insert("conversations", {
      type: "primary",
      isGroup: true,
      title: title?.trim() || undefined,
      participants: ids,
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await Promise.all(
      ids.map((userId) =>
        ctx.db.insert("conversationMembers", {
          conversationId,
          userId,
          role: userId === viewerId ? "admin" : "member",
          folder: "primary",
          unreadCount: 0,
          lastInteractionAt: now,
          joinedAt: now,
          updatedAt: now,
        }),
      ),
    );
    return { conversationId };
  },
});

export const moveConversationFolder = mutation({
  args: {
    viewerId: v.id("users"),
    conversationId: v.id("conversations"),
    folder: v.union(v.literal("primary"), v.literal("general")),
  },
  handler: async (ctx, { viewerId, conversationId, folder }) => {
    await assertUserCanMutate(ctx, viewerId);
    const membership = await requireMembership(ctx, conversationId, viewerId);
    await ctx.db.patch(membership._id, { folder, updatedAt: Date.now() });
    return { ok: true };
  },
});

type SharedPostPreviewRow = {
  postId: Id<"posts">;
  caption: string | undefined;
  authorUsername: string | undefined;
  authorFullName: string | undefined;
  authorProfilePictureUrl: string | undefined;
  authorProfilePictureKey: string | undefined;
  authorProfilePictureStorageRegion: string | undefined;
  thumbnailUrl: string | undefined;
  displayUrl: string | undefined;
  /** When `displayUrl` is an object key (not `https://…`), pass through for `media:getPublicMediaUrl`. */
  displayStorageRegion: string | undefined;
  thumbnailStorageRegion: string | undefined;
  mediaType: string | undefined;
  mediaWidth: number | undefined;
  mediaHeight: number | undefined;
  mediaCropAspectRatio?: string;
  verificationTier?: import("./verificationTier").VerificationTier;
};

async function loadSharedPostPreviews(
  ctx: QueryCtx,
  postIds: Id<"posts">[],
): Promise<Map<string, SharedPostPreviewRow>> {
  const unique = [...new Set(postIds.map(String))] as Id<"posts">[];
  const sharedPosts = await Promise.all(
    unique.map(async (postId) => {
      const post = await ctx.db.get(postId);
      if (!post) return null;
      const author = await ctx.db.get(post.userId);
      let media =
        (await ctx.db
          .query("postMedia")
          .withIndex("by_post_position", (q) =>
            q.eq("postId", post._id).eq("position", 0),
          )
          .unique()) ?? null;
      if (!media) {
        const all = await ctx.db
          .query("postMedia")
          .withIndex("by_post", (q) => q.eq("postId", post._id))
          .collect();
        media =
          all.sort((a, b) => a.position - b.position)[0] ?? null;
      }
      return {
        postId: post._id,
        caption: post.caption,
        authorUsername: author?.username,
        authorFullName: author?.fullName,
        authorProfilePictureUrl: author?.profilePictureUrl,
        authorProfilePictureKey: author?.profilePictureKey,
        authorProfilePictureStorageRegion: author?.profilePictureStorageRegion,
        ...verificationTierPayload(author ?? null),
        thumbnailUrl:
          media?.thumbnailUrl ??
          (media?.type === "image" ? media.displayUrl : undefined),
        displayUrl: media?.displayUrl,
        displayStorageRegion: media?.displayStorageRegion,
        thumbnailStorageRegion: media?.thumbnailStorageRegion,
        mediaType: media?.type,
        mediaWidth: media?.width,
        mediaHeight: media?.height,
        mediaCropAspectRatio: media?.cropData?.aspectRatio,
      } satisfies SharedPostPreviewRow;
    }),
  );
  const map = new Map<string, SharedPostPreviewRow>();
  for (const row of sharedPosts) {
    if (row) map.set(String(row.postId), row);
  }
  return map;
}

async function refreshConversationPreviewFromLatestMessages(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
) {
  const recent = await ctx.db
    .query("messages")
    .withIndex("by_conversation_created", (q) =>
      q.eq("conversationId", conversationId),
    )
    .order("desc")
    .take(80);
  const last = recent.find((m) => m.status !== "deleted");
  const now = Date.now();
  if (!last) {
    await ctx.db.patch(conversationId, {
      lastMessageId: undefined,
      lastMessageType: undefined,
      lastMessagePreview: undefined,
      lastSenderId: undefined,
      lastMessageAt: now,
      updatedAt: now,
    });
    return;
  }
  await ctx.db.patch(conversationId, {
    lastMessageId: last._id,
    lastMessageType: last.type,
    lastMessagePreview: normalizePreview(last.type, last.text),
    lastSenderId: last.senderId,
    lastMessageAt: last.createdAt,
    updatedAt: now,
  });
}

export const getConversation = query({
  args: { viewerId: v.id("users"), conversationId: v.id("conversations") },
  handler: async (ctx, { viewerId, conversationId }) => {
    const membership = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", conversationId).eq("userId", viewerId),
      )
      .unique();
    if (!membership) return null;
    const conversation = await ctx.db.get(conversationId);
    if (!conversation) return null;
    const members = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation_joined", (q) =>
        q.eq("conversationId", conversationId),
      )
      .collect();
    const users = await Promise.all(members.map((m) => ctx.db.get(m.userId)));

    let pinnedPreview: {
      messageId: Id<"messages">;
      type: MessageType;
      text?: string;
      postPreview: SharedPostPreviewRow | null;
      thumbUrl?: string;
    } | null = null;
    if (conversation.pinnedMessageId) {
      const pm = await ctx.db.get(conversation.pinnedMessageId);
      if (
        pm &&
        pm.conversationId === conversationId &&
        pm.status !== "deleted"
      ) {
        let postPreview: SharedPostPreviewRow | null = null;
        if (
          (pm.type === "post_share" || pm.type === "collab_invite") &&
          pm.postId
        ) {
          const map = await loadSharedPostPreviews(ctx, [pm.postId]);
          postPreview = map.get(String(pm.postId)) ?? null;
        }
        const thumbUrl =
          postPreview?.thumbnailUrl ??
          postPreview?.displayUrl ??
          pm.gifPreviewUrl ??
          undefined;
        pinnedPreview = {
          messageId: pm._id,
          type: pm.type,
          text: pm.text,
          postPreview,
          thumbUrl,
        };
      }
    }

    return {
      ...conversation,
      membership,
      members: users.filter(Boolean),
      pinnedPreview,
    };
  },
});

export const listConversations = query({
  args: {
    viewerId: v.id("users"),
    folder: v.union(v.literal("primary"), v.literal("general")),
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
    q: v.optional(v.string()),
  },
  handler: async (ctx, { viewerId, folder, limit = 20, cursor, q }) => {
    let rowsQ = ctx.db
      .query("conversationMembers")
      .withIndex("by_user_folder_updated", (qi) =>
        qi.eq("userId", viewerId).eq("folder", folder),
      )
      .order("desc");
    if (cursor !== undefined) {
      rowsQ = rowsQ.filter((qi) => qi.lt(qi.field("updatedAt"), cursor));
    }
    const memberRows = await rowsQ.take(Math.min(limit, 30));
    const now = Date.now();
    const items = await Promise.all(
      memberRows.map(async (member) => {
        const conv = await ctx.db.get(member.conversationId);
        if (!conv) return null;
        const peers = conv.participants.filter((id) => id !== viewerId);
        const peerDocs = await Promise.all(peers.map((id) => ctx.db.get(id)));
        const activeStories = await Promise.all(
          peers.map(async (id) => {
            const stories = await ctx.db
              .query("stories")
              .withIndex("by_user_created", (qi) => qi.eq("userId", id))
              .order("desc")
              .take(1);
            return stories.some((s) => s.expiresAt > now);
          }),
        );
        const title = conv.isGroup
          ? (conv.title ??
            peerDocs
              .filter(Boolean)
              .map((u) => u?.fullName || u?.username || "User")
              .slice(0, 3)
              .join(", "))
          : peerDocs[0]?.fullName || peerDocs[0]?.username || "Unknown";
        if (q && !title.toLowerCase().includes(q.trim().toLowerCase()))
          return null;
        return {
          conversationId: conv._id,
          type: conv.type,
          isGroup: conv.isGroup,
          title,
          avatarKey: conv.avatarKey,
          peers: peerDocs.filter(Boolean),
          unreadCount: member.unreadCount,
          lastMessagePreview: conv.lastMessagePreview,
          lastMessageType: conv.lastMessageType,
          lastMessageAt: conv.lastMessageAt,
          hasActiveStory: activeStories.some(Boolean),
          updatedAt: member.updatedAt,
          rankScore:
            conv.lastMessageAt + Math.floor(member.lastInteractionAt / 10),
        };
      }),
    );
    const normalized = items.filter((x): x is NonNullable<typeof x> =>
      Boolean(x),
    );
    normalized.sort((a, b) => b.rankScore - a.rankScore);
    const nextCursor =
      memberRows.length === Math.min(limit, 30)
        ? memberRows[memberRows.length - 1]?.updatedAt
        : null;
    return { items: normalized, nextCursor };
  },
});

export const listMessages = query({
  args: {
    viewerId: v.id("users"),
    conversationId: v.id("conversations"),
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  handler: async (ctx, { viewerId, conversationId, limit = 30, cursor }) => {
    const membership = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", conversationId).eq("userId", viewerId),
      )
      .unique();
    if (!membership) return { items: [], nextCursor: null };
    let q = ctx.db
      .query("messages")
      .withIndex("by_conversation_created", (qi) =>
        qi.eq("conversationId", conversationId),
      )
      .order("desc");
    if (cursor !== undefined) {
      q = q.filter((qi) => qi.lt(qi.field("createdAt"), cursor));
    }
    const page = await q.take(Math.min(limit, 50));
    const senderIds = [...new Set(page.map((m) => m.senderId))];
    const senders = await Promise.all(senderIds.map((id) => ctx.db.get(id)));
    const senderMap = new Map(
      senderIds.map((id, i) => [String(id), senders[i]]),
    );
    const sharedPostIds = [
      ...new Set(
        page
          .filter(
            (m) =>
              (m.type === "post_share" || m.type === "collab_invite") &&
              m.postId,
          )
          .map((m) => m.postId as Id<"posts">),
      ),
    ];
    const sharedPostMap = await loadSharedPostPreviews(ctx, sharedPostIds);
    const items = page
      .slice()
      .reverse()
      .filter((m) => {
        if (!m.viewOnce) return true;
        // Keep sender-side history intact; hide only for recipients who already opened it.
        if (m.senderId === viewerId) return true;
        return !(m.viewedOnceBy ?? []).includes(viewerId);
      })
      .map((m) => ({
        ...m,
        sender: senderMap.get(String(m.senderId)) ?? null,
        postPreview:
          (m.type === "post_share" || m.type === "collab_invite") && m.postId
            ? (sharedPostMap.get(String(m.postId)) ?? null)
            : null,
      }));
    const nextCursor =
      page.length === Math.min(limit, 50)
        ? page[page.length - 1]?.createdAt
        : null;
    return { items, nextCursor };
  },
});

export const unreadInboxCount = query({
  args: {
    viewerId: v.id("users"),
  },
  handler: async (ctx, { viewerId }) => {
    const memberships = await ctx.db
      .query("conversationMembers")
      .withIndex("by_user_updated", (q) => q.eq("userId", viewerId))
      .collect();
    return memberships.reduce((sum, row) => sum + (row.unreadCount ?? 0), 0);
  },
});

export const markAllConversationsRead = mutation({
  args: {
    viewerId: v.id("users"),
  },
  handler: async (ctx, { viewerId }) => {
    await assertUserCanMutate(ctx, viewerId);
    const now = Date.now();
    const memberships = await ctx.db
      .query("conversationMembers")
      .withIndex("by_user_updated", (q) => q.eq("userId", viewerId))
      .collect();
    await Promise.all(
      memberships
        .filter((m) => m.unreadCount > 0)
        .map((m) =>
          ctx.db.patch(m._id, {
            unreadCount: 0,
            lastReadAt: now,
            lastReadMessageAt: now,
            updatedAt: now,
          }),
        ),
    );
    return { ok: true };
  },
});

export const markConversationRead = mutation({
  args: {
    viewerId: v.id("users"),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, { viewerId, conversationId }) => {
    await assertUserCanMutate(ctx, viewerId);
    const membership = await requireMembership(ctx, conversationId, viewerId);
    const now = Date.now();
    await ctx.db.patch(membership._id, {
      unreadCount: 0,
      lastReadAt: now,
      lastReadMessageAt: now,
      updatedAt: now,
    });
    const recent = await ctx.db
      .query("messages")
      .withIndex("by_conversation_created", (q) =>
        q.eq("conversationId", conversationId),
      )
      .order("desc")
      .take(50);
    await Promise.all(
      recent.map(async (m) => {
        if (m.seenBy.includes(viewerId)) return;
        await ctx.db.patch(m._id, { seenBy: [...m.seenBy, viewerId] });
      }),
    );
    return { ok: true };
  },
});

export const sendMessage = mutation({
  args: {
    viewerId: v.id("users"),
    conversationId: v.id("conversations"),
    type: v.union(
      v.literal("text"),
      v.literal("image"),
      v.literal("video"),
      v.literal("voice"),
      v.literal("post_share"),
      v.literal("collab_invite"),
      v.literal("story_reply"),
      v.literal("gif"),
      v.literal("location"),
    ),
    text: v.optional(v.string()),
    mediaKey: v.optional(v.string()),
    mediaStorageRegion: v.optional(v.string()),
    mediaMimeType: v.optional(v.string()),
    mediaDurationMs: v.optional(v.number()),
    mediaThumbKey: v.optional(v.string()),
    mediaThumbStorageRegion: v.optional(v.string()),
    viewOnce: v.optional(v.boolean()),
    postId: v.optional(v.id("posts")),
    storyId: v.optional(v.id("stories")),
    gifUrl: v.optional(v.string()),
    gifPreviewUrl: v.optional(v.string()),
    gifWidth: v.optional(v.number()),
    gifHeight: v.optional(v.number()),
    gifKind: v.optional(
      v.union(v.literal("gif"), v.literal("sticker")),
    ),
    location: v.optional(
      v.object({
        latitude: v.number(),
        longitude: v.number(),
        label: v.optional(v.string()),
      }),
    ),
    clientMessageId: v.optional(v.string()),
    replyToMessageId: v.optional(v.id("messages")),
  },
  handler: async (ctx, args) => {
    await assertUserCanMutate(ctx, args.viewerId);
    const result = await appendOutboundChatMessage(ctx, {
      viewerId: args.viewerId,
      conversationId: args.conversationId,
      type: args.type,
      text: args.text,
      mediaKey: args.mediaKey,
      mediaStorageRegion: args.mediaStorageRegion,
      mediaMimeType: args.mediaMimeType,
      mediaDurationMs: args.mediaDurationMs,
      mediaThumbKey: args.mediaThumbKey,
      mediaThumbStorageRegion: args.mediaThumbStorageRegion,
      viewOnce: args.viewOnce,
      postId: args.postId,
      storyId: args.storyId,
      gifUrl: args.gifUrl,
      gifPreviewUrl: args.gifPreviewUrl,
      gifWidth: args.gifWidth,
      gifHeight: args.gifHeight,
      gifKind: args.gifKind,
      location: args.location,
      clientMessageId: args.clientMessageId,
      replyToMessageId: args.replyToMessageId,
    });
    if (result.deduped) {
      return { messageId: result.messageId, deduped: true as const };
    }
    return {
      messageId: result.messageId,
      deduped: false as const,
      conversationMemberId: result.conversationMemberId!,
    };
  },
});

export const consumeViewOnceMessage = mutation({
  args: {
    viewerId: v.id("users"),
    conversationId: v.id("conversations"),
    messageId: v.id("messages"),
  },
  handler: async (ctx, { viewerId, conversationId, messageId }) => {
    await assertUserCanMutate(ctx, viewerId);
    await requireMembership(ctx, conversationId, viewerId);
    const message = await ctx.db.get(messageId);
    if (!message || message.conversationId !== conversationId) {
      throw new Error("Message not found");
    }
    if (!message.viewOnce) return { ok: true };
    if (message.senderId === viewerId) return { ok: true };
    const consumedBy = message.viewedOnceBy ?? [];
    if (consumedBy.includes(viewerId)) return { ok: true };
    await ctx.db.patch(messageId, { viewedOnceBy: [...consumedBy, viewerId] });
    return { ok: true };
  },
});

export const listShareTargets = query({
  args: {
    viewerId: v.id("users"),
    limit: v.optional(v.number()),
    q: v.optional(v.string()),
  },
  handler: async (ctx, { viewerId, limit = 20, q }) => {
    const recentMembers = await ctx.db
      .query("conversationMembers")
      .withIndex("by_user_updated", (qi) => qi.eq("userId", viewerId))
      .order("desc")
      .take(Math.min(limit, 30));
    const recentConversationIds = recentMembers.map((m) => m.conversationId);
    const recentConversations = await Promise.all(
      recentConversationIds.map((id) => ctx.db.get(id)),
    );

    const follows = await ctx.db
      .query("follows")
      .withIndex("by_follower_status", (qi) =>
        qi.eq("followerId", viewerId).eq("status", "active"),
      )
      .take(120);
    let followedUsers = await Promise.all(
      follows.map((f) => ctx.db.get(f.followingId)),
    );
    followedUsers = followedUsers.filter(
      (u): u is NonNullable<typeof u> =>
        Boolean(u) && !userHiddenFromPublicDiscovery(u),
    );

    const followerLinks = await ctx.db
      .query("follows")
      .withIndex("by_following_status", (qi) =>
        qi.eq("followingId", viewerId).eq("status", "active"),
      )
      .take(100);
    let usersWhoFollowViewer = await Promise.all(
      followerLinks.map((f) => ctx.db.get(f.followerId)),
    );
    usersWhoFollowViewer = usersWhoFollowViewer.filter(
      (u): u is NonNullable<typeof u> =>
        Boolean(u) && !userHiddenFromPublicDiscovery(u),
    );

    const recentSearchRows = await ctx.db
      .query("recentSearches")
      .withIndex("by_user", (qi) => qi.eq("userId", viewerId))
      .order("desc")
      .take(30);

    const matchesQuery = (
      u: { username?: string; fullName?: string } | null,
    ) => {
      if (!u || !q?.trim()) return true;
      const queryText = q.toLowerCase();
      return (
        (u.username ?? "").toLowerCase().includes(queryText) ||
        (u.fullName ?? "").toLowerCase().includes(queryText)
      );
    };

    if (q?.trim()) {
      const queryText = q.toLowerCase();
      followedUsers = followedUsers.filter(
        (u) =>
          (u?.username ?? "").toLowerCase().includes(queryText) ||
          (u?.fullName ?? "").toLowerCase().includes(queryText),
      );
      usersWhoFollowViewer = usersWhoFollowViewer.filter(
        (u) =>
          u &&
          ((u.username ?? "").toLowerCase().includes(queryText) ||
            (u.fullName ?? "").toLowerCase().includes(queryText)),
      );
    }

    const ranked = new Map<
      string,
      {
        user: NonNullable<(typeof followedUsers)[number]>;
        rank: number;
        existingConversationId?: Id<"conversations">;
        isRecent: boolean;
      }
    >();

    for (let index = 0; index < recentConversations.length; index += 1) {
      const conv = recentConversations[index];
      if (!conv) continue;
      const peers = conv.participants.filter((id) => id !== viewerId);
      for (const peerId of peers) {
        const peer = await ctx.db.get(peerId);
        if (!peer || userHiddenFromPublicDiscovery(peer)) continue;
        const key = String(peer._id);
        const score = 1_000_000 - index * 10_000 + conv.lastMessageAt;
        const existing = ranked.get(key);
        ranked.set(key, {
          user: peer,
          rank: Math.max(existing?.rank ?? 0, score),
          existingConversationId:
            !conv.isGroup && conv.participants.length === 2
              ? conv._id
              : existing?.existingConversationId,
          isRecent: true,
        });
      }
    }

    for (let index = 0; index < followedUsers.length; index += 1) {
      const user = followedUsers[index];
      if (!user) continue;
      const key = String(user._id);
      const existing = ranked.get(key);
      const baseRank = Math.max(0, 100_000 - index * 200);
      if (existing) {
        ranked.set(key, {
          ...existing,
          rank: Math.max(existing.rank, baseRank),
        });
      } else {
        ranked.set(key, {
          user,
          rank: baseRank,
          isRecent: false,
        });
      }
    }

    for (let index = 0; index < usersWhoFollowViewer.length; index += 1) {
      const user = usersWhoFollowViewer[index];
      if (!user || user._id === viewerId) continue;
      const key = String(user._id);
      const existing = ranked.get(key);
      const baseRank = Math.max(0, 55_000 - index * 120);
      if (existing) {
        ranked.set(key, {
          ...existing,
          rank: Math.max(existing.rank, baseRank),
        });
      } else {
        ranked.set(key, {
          user,
          rank: baseRank,
          isRecent: false,
        });
      }
    }

    for (let index = 0; index < recentSearchRows.length; index += 1) {
      const row = recentSearchRows[index];
      const user = await ctx.db.get(row.searchedUserId);
      if (!user || user._id === viewerId) continue;
      if (userHiddenFromPublicDiscovery(user)) continue;
      if (!matchesQuery(user)) continue;
      const key = String(user._id);
      const existing = ranked.get(key);
      const baseRank = Math.max(0, 72_000 - index * 400);
      if (existing) {
        ranked.set(key, {
          ...existing,
          rank: Math.max(existing.rank, baseRank),
        });
      } else {
        ranked.set(key, {
          user,
          rank: baseRank,
          isRecent: false,
        });
      }
    }

    let items = [...ranked.values()]
      .sort((a, b) => b.rank - a.rank)
      .slice(0, Math.max(36, limit))
      .map((item) => ({
        _id: item.user._id,
        username: item.user.username,
        fullName: item.user.fullName,
        profilePictureUrl: item.user.profilePictureUrl,
        profilePictureKey: item.user.profilePictureKey,
        isRecent: item.isRecent,
        existingConversationId: item.existingConversationId,
        ...verificationTierPayload(item.user),
      }));

    if (q?.trim()) {
      const queryText = q.toLowerCase();
      items = items.filter(
        (row) =>
          (row.username ?? "").toLowerCase().includes(queryText) ||
          (row.fullName ?? "").toLowerCase().includes(queryText),
      );
    }

    return {
      recents: recentConversations.filter(Boolean),
      followedUsers: followedUsers.slice(0, limit),
      items,
    };
  },
});

export const canUploadToConversation = query({
  args: {
    viewerId: v.id("users"),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, { viewerId, conversationId }) => {
    const membership = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", conversationId).eq("userId", viewerId),
      )
      .unique();
    return Boolean(membership);
  },
});

export const unsendMessage = mutation({
  args: {
    viewerId: v.id("users"),
    conversationId: v.id("conversations"),
    messageId: v.id("messages"),
  },
  handler: async (ctx, { viewerId, conversationId, messageId }) => {
    await assertUserCanMutate(ctx, viewerId);
    await requireMembership(ctx, conversationId, viewerId);
    const m = await ctx.db.get(messageId);
    if (!m || m.conversationId !== conversationId) {
      throw new Error("Message not found");
    }
    if (m.senderId !== viewerId) throw new Error("Not your message");
    if (m.status === "deleted") return { ok: true as const };
    const now = Date.now();
    await ctx.db.patch(messageId, { status: "deleted" });
    const conv = await ctx.db.get(conversationId);
    if (conv?.pinnedMessageId === messageId) {
      await ctx.db.patch(conversationId, {
        pinnedMessageId: undefined,
        updatedAt: now,
      });
    }
    await refreshConversationPreviewFromLatestMessages(ctx, conversationId);
    return { ok: true as const };
  },
});

export const setPinnedMessage = mutation({
  args: {
    viewerId: v.id("users"),
    conversationId: v.id("conversations"),
    messageId: v.optional(v.id("messages")),
  },
  handler: async (ctx, { viewerId, conversationId, messageId }) => {
    await assertUserCanMutate(ctx, viewerId);
    await requireMembership(ctx, conversationId, viewerId);
    const now = Date.now();
    if (!messageId) {
      await ctx.db.patch(conversationId, {
        pinnedMessageId: undefined,
        updatedAt: now,
      });
      return { ok: true as const };
    }
    const m = await ctx.db.get(messageId);
    if (!m || m.conversationId !== conversationId) {
      throw new Error("Message not found");
    }
    if (m.status === "deleted") {
      throw new Error("Cannot pin this message");
    }
    await ctx.db.patch(conversationId, {
      pinnedMessageId: messageId,
      updatedAt: now,
    });
    return { ok: true as const };
  },
});

export const forwardMessage = mutation({
  args: {
    viewerId: v.id("users"),
    sourceConversationId: v.id("conversations"),
    targetConversationId: v.id("conversations"),
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    await assertUserCanMutate(ctx, args.viewerId);
    await requireMembership(ctx, args.sourceConversationId, args.viewerId);
    await requireMembership(ctx, args.targetConversationId, args.viewerId);
    const m = await ctx.db.get(args.messageId);
    if (!m || m.conversationId !== args.sourceConversationId) {
      throw new Error("Message not found");
    }
    if (m.status === "deleted") {
      throw new Error("Cannot forward this message");
    }
    return appendOutboundChatMessage(ctx, {
      viewerId: args.viewerId,
      conversationId: args.targetConversationId,
      type: m.type,
      text: m.text,
      mediaKey: m.mediaKey,
      mediaStorageRegion: m.mediaStorageRegion,
      mediaMimeType: m.mediaMimeType,
      mediaDurationMs: m.mediaDurationMs,
      mediaThumbKey: m.mediaThumbKey,
      mediaThumbStorageRegion: m.mediaThumbStorageRegion,
      postId: m.postId,
      storyId: m.storyId,
      gifUrl: m.gifUrl,
      gifPreviewUrl: m.gifPreviewUrl,
      gifWidth: m.gifWidth,
      gifHeight: m.gifHeight,
      gifKind: m.gifKind,
      location: m.location,
    });
  },
});

export const toggleMessageReaction = mutation({
  args: {
    viewerId: v.id("users"),
    conversationId: v.id("conversations"),
    messageId: v.id("messages"),
    emoji: v.string(),
  },
  handler: async (ctx, { viewerId, conversationId, messageId, emoji }) => {
    await assertUserCanMutate(ctx, viewerId);
    await requireMembership(ctx, conversationId, viewerId);
    const m = await ctx.db.get(messageId);
    if (!m || m.conversationId !== conversationId) {
      throw new Error("Message not found");
    }
    if (m.status === "deleted") {
      throw new Error("Cannot react to this message");
    }
    const trimmed = emoji.trim();
    if (!trimmed) throw new Error("Invalid emoji");
    const prev = m.reactions ?? [];
    const mine = prev.find((r) => r.userId === viewerId);
    let next: typeof prev;
    if (mine?.emoji === trimmed) {
      next = prev.filter((r) => r.userId !== viewerId);
    } else {
      next = [...prev.filter((r) => r.userId !== viewerId), { userId: viewerId, emoji: trimmed }];
    }
    await ctx.db.patch(messageId, {
      reactions: next.length > 0 ? next : undefined,
    });
    return { ok: true as const };
  },
});
