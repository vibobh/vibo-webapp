import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

async function requireViewerId(ctx: QueryCtx | MutationCtx): Promise<Id<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  return identity.subject as Id<"users">;
}

function sortParticipantIds(a: Id<"users">, b: Id<"users">): [Id<"users">, Id<"users">] {
  const as = a as unknown as string;
  const bs = b as unknown as string;
  return as < bs ? [a, b] : [b, a];
}

interface PeerLite {
  id: Id<"users">;
  username?: string;
  fullName?: string;
  profilePictureUrl?: string;
  verificationTier?: "blue" | "gold" | "gray";
}

function peerLite(u: Doc<"users"> | null): PeerLite | null {
  if (!u) return null;
  return {
    id: u._id,
    username: u.username,
    fullName: u.fullName,
    profilePictureUrl: u.profilePictureUrl,
    verificationTier: u.verificationTier,
  };
}

export interface ConversationListItem {
  id: Id<"conversations">;
  peer: PeerLite | null;
  lastMessage?: string;
  lastMessageAt?: number;
  lastSenderId?: Id<"users"> | null;
  unread: boolean;
  isYouSentLast: boolean;
}

export interface ConversationDetail {
  id: Id<"conversations">;
  peer: PeerLite | null;
}

export interface MessageDTO {
  id: Id<"messages">;
  text: string;
  createdAt: number;
  fromMe: boolean;
}

export interface ChatNoteDTO {
  id: string | null;
  username: string;
  fullName?: string;
  profilePictureUrl?: string;
  text: string;
  isYou: boolean;
}

async function findDmWithPeer(
  ctx: QueryCtx | MutationCtx,
  viewer: Id<"users">,
  peerId: Id<"users">,
): Promise<Id<"conversations"> | null> {
  const memberships = await ctx.db
    .query("conversationMembers")
    .withIndex("by_user_updated", (q) => q.eq("userId", viewer))
    .order("desc")
    .take(200);

  for (const m of memberships) {
    const conv = await ctx.db.get(m.conversationId);
    if (!conv || conv.isGroup) continue;
    if (conv.participants.length !== 2) continue;
    const hasPeer = conv.participants.some(
      (p) => (p as unknown as string) === (peerId as unknown as string),
    );
    const hasViewer = conv.participants.some(
      (p) => (p as unknown as string) === (viewer as unknown as string),
    );
    if (hasPeer && hasViewer) return conv._id;
  }
  return null;
}

async function ensureConversationFor(
  ctx: MutationCtx,
  viewer: Id<"users">,
  peerId: Id<"users">,
): Promise<Id<"conversations">> {
  if ((viewer as unknown as string) === (peerId as unknown as string)) {
    throw new Error("Cannot start a conversation with yourself");
  }
  const peer = await ctx.db.get(peerId);
  if (!peer) throw new Error("User not found");

  const existingId = await findDmWithPeer(ctx, viewer, peerId);
  if (existingId) return existingId;

  const now = Date.now();
  const participants = sortParticipantIds(viewer, peerId);
  const id = await ctx.db.insert("conversations", {
    type: "primary",
    isGroup: false,
    participants: [participants[0]!, participants[1]!],
    lastMessageAt: now,
    createdAt: now,
    updatedAt: now,
  });

  for (const uid of [viewer, peerId]) {
    await ctx.db.insert("conversationMembers", {
      conversationId: id,
      userId: uid,
      role: "member",
      folder: "primary",
      unreadCount: 0,
      lastInteractionAt: now,
      joinedAt: now,
      updatedAt: now,
    });
  }

  return id;
}

export const listConversations = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const viewer = identity.subject as Id<"users">;

    const memberships = await ctx.db
      .query("conversationMembers")
      .withIndex("by_user_updated", (q) => q.eq("userId", viewer))
      .order("desc")
      .take(200);

    const out: ConversationListItem[] = [];
    for (const m of memberships) {
      const conv = await ctx.db.get(m.conversationId);
      if (!conv) continue;

      let peerId: Id<"users"> | null = null;
      for (const pid of conv.participants) {
        if ((pid as unknown as string) !== (viewer as unknown as string)) {
          peerId = pid;
          break;
        }
      }
      const peer = peerId ? peerLite(await ctx.db.get(peerId)) : null;

      out.push({
        id: conv._id,
        peer,
        lastMessage: conv.lastMessagePreview,
        lastMessageAt: conv.lastMessageAt,
        lastSenderId: conv.lastSenderId ?? null,
        unread: m.unreadCount > 0,
        isYouSentLast:
          conv.lastSenderId !== undefined &&
          (conv.lastSenderId as unknown as string) === (viewer as unknown as string),
      });
    }

    out.sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0));
    return out;
  },
});

export const getConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const viewer = identity.subject as Id<"users">;

    const conv = await ctx.db.get(conversationId);
    if (!conv) return null;

    const memberRow = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", conversationId).eq("userId", viewer),
      )
      .first();
    if (!memberRow) return null;

    let peerId: Id<"users"> | null = null;
    for (const pid of conv.participants) {
      if ((pid as unknown as string) !== (viewer as unknown as string)) {
        peerId = pid;
        break;
      }
    }
    const peer = peerId ? peerLite(await ctx.db.get(peerId)) : null;

    return { id: conv._id, peer } satisfies ConversationDetail;
  },
});

export const listMessages = query({
  args: {
    conversationId: v.id("conversations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { conversationId, limit }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const viewer = identity.subject as Id<"users">;

    const memberRow = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", conversationId).eq("userId", viewer),
      )
      .first();
    if (!memberRow) return [];

    const max = Math.max(1, Math.min(200, limit ?? 80));
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_conversation_created", (q) => q.eq("conversationId", conversationId))
      .order("desc")
      .take(max);

    rows.reverse();
    const dtos: MessageDTO[] = rows
      .filter((m) => m.status !== "deleted")
      .map((m) => ({
        id: m._id,
        text: m.text ?? "",
        createdAt: m.createdAt,
        fromMe: (m.senderId as unknown as string) === (viewer as unknown as string),
      }));
    return dtos;
  },
});

export const ensureConversation = mutation({
  args: { peerId: v.id("users") },
  handler: async (ctx, { peerId }) => {
    const viewer = await requireViewerId(ctx);
    const id = await ensureConversationFor(ctx, viewer, peerId);
    return { conversationId: id };
  },
});

export const ensureConversationByUsername = mutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const viewer = await requireViewerId(ctx);
    const handle = username.trim().toLowerCase();
    const all = await ctx.db.query("users").collect();
    const peer = all.find((x) => (x.username ?? "").toLowerCase() === handle);
    if (!peer) throw new Error("User not found");
    const id = await ensureConversationFor(ctx, viewer, peer._id);
    return { conversationId: id };
  },
});

export const sendMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    text: v.string(),
  },
  handler: async (ctx, { conversationId, text }) => {
    const viewer = await requireViewerId(ctx);
    const trimmed = text.trim();
    if (!trimmed) throw new Error("Message cannot be empty");
    if (trimmed.length > 4000) throw new Error("Message too long");

    const member = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", conversationId).eq("userId", viewer),
      )
      .first();
    if (!member) throw new Error("Not a member of this conversation");

    const now = Date.now();
    const id = await ctx.db.insert("messages", {
      conversationId,
      senderId: viewer,
      type: "text",
      text: trimmed,
      status: "sent",
      seenBy: [],
      createdAt: now,
    });

    await ctx.db.patch(conversationId, {
      lastMessagePreview: trimmed.slice(0, 240),
      lastMessageAt: now,
      lastSenderId: viewer,
      lastMessageType: "text",
      lastMessageId: id,
      updatedAt: now,
    });

    await ctx.db.patch(member._id, {
      lastReadAt: now,
      lastInteractionAt: now,
      updatedAt: now,
    });

    const allMembers = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation_joined", (q) => q.eq("conversationId", conversationId))
      .take(20);

    for (const row of allMembers) {
      if ((row.userId as unknown as string) === (viewer as unknown as string)) continue;
      await ctx.db.patch(row._id, {
        unreadCount: row.unreadCount + 1,
        updatedAt: now,
        lastInteractionAt: now,
      });
    }

    return { messageId: id };
  },
});

export const markRead = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const viewer = await requireViewerId(ctx);
    const member = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", conversationId).eq("userId", viewer),
      )
      .first();
    if (!member) return;
    const now = Date.now();
    await ctx.db.patch(member._id, {
      lastReadAt: now,
      unreadCount: 0,
      updatedAt: now,
    });
  },
});

/** Notes UI — production schema has no `notes` table; placeholder rail only. */
export const listNotes = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const viewerDoc = await ctx.db.get(identity.subject as Id<"users">);
    if (!viewerDoc) return [];
    const out: ChatNoteDTO[] = [
      {
        id: null,
        username: viewerDoc.username ?? "you",
        fullName: viewerDoc.fullName,
        profilePictureUrl: viewerDoc.profilePictureUrl,
        text: "Your note",
        isYou: true,
      },
    ];
    return out;
  },
});

export const upsertMyNote = mutation({
  args: { text: v.string() },
  handler: async (_ctx, _args) => {
    throw new Error("Notes are not stored in this schema revision.");
  },
});

export const clearMyNote = mutation({
  args: {},
  handler: async () => {
    return;
  },
});
