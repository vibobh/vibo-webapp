import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { assertUserCanMutate } from "./accountModeration";
import { buildPublicMediaUrl } from "./mediaUrl";
import { notificationSuppressedBetween } from "./viewerContentFilters";

function effectiveBool(v: boolean | undefined, defaultTrue: boolean): boolean {
  if (v === undefined) return defaultTrue;
  return v;
}

/** In-app activity only surfaces post likes, comments/replies, and follows — not comment reactions or post settings. */
const EXCLUDED_ACTIVITY_TYPES = new Set([
  "like_comment",
  "like_count_visible",
  "like_count_hidden",
  "dislike_count_visible",
  "dislike_count_hidden",
  "comments_enabled",
  "comments_disabled",
]);

function isIncludedActivityType(type: string): boolean {
  return !EXCLUDED_ACTIVITY_TYPES.has(type);
}

/**
 * Reactive bounds for unread-count and unread-breakdown queries.
 *
 * These queries subscribe over the WebSocket for every mounted consumer (home
 * engagement icon, tab bar multi-account dot, account switcher badges). An
 * unbounded `.collect()` on `notificationGroups` scales with the *lifetime*
 * notification count of a single user — a noisy account can stall a single
 * subscription for tens of seconds and we have seen 250s+ "0 MB" results in
 * logs. We scan at most `UNREAD_SCAN_CAP` most-recent groups and cap the
 * displayed unread count at `UNREAD_DISPLAY_CAP` (UI renders "99+").
 */
const UNREAD_SCAN_CAP = 500;
const UNREAD_DISPLAY_CAP = 99;

/** Same unread rules as `unreadCount` — used for multi-account tab badge. */
async function countUnreadActivityForUser(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<number> {
  const groups = await ctx.db
    .query("notificationGroups")
    .withIndex("by_receiver_updated", (q) => q.eq("receiverId", userId))
    .order("desc")
    .take(UNREAD_SCAN_CAP);
  let count = 0;
  for (const g of groups) {
    if (g.readAt !== undefined) continue;
    if (!isIncludedActivityType(String(g.type))) continue;
    count += 1;
    if (count >= UNREAD_DISPLAY_CAP) return UNREAD_DISPLAY_CAP;
  }
  return count;
}

// Helper to resolve profile picture URL (prefers direct URL, falls back to key-based)
function resolveProfilePic(
  user:
    | {
        profilePictureUrl?: string | null;
        profilePictureKey?: string | null;
        profilePictureStorageRegion?: string | null;
      }
    | null
    | undefined,
): { url: string | null; key: string | null } {
  if (!user) return { url: null, key: null };
  if (user.profilePictureUrl) {
    return { url: user.profilePictureUrl, key: user.profilePictureKey ?? null };
  }
  if (user.profilePictureKey) {
    return {
      url: buildPublicMediaUrl(
        user.profilePictureKey,
        undefined,
        user.profilePictureStorageRegion,
      ),
      key: user.profilePictureKey,
    };
  }
  return { url: null, key: null };
}

export const getSettings = query({
  args: { userId: v.union(v.id("users"), v.string()) },
  handler: async (ctx, { userId }) => {
    const normalizedUserId =
      typeof userId === "string"
        ? await ctx.db.normalizeId("users", userId)
        : userId;
    if (!normalizedUserId) {
      return {
        likePostInApp: true,
        tagPostInApp: true,
        likeStoryInApp: true,
        followInApp: true,
        followRequestInApp: true,
        followAcceptInApp: true,
        messageInApp: true,
        pushEnabled: true,
        likePostPush: true,
        likeStoryPush: true,
        followPush: true,
        followRequestPush: true,
        followAcceptPush: true,
        messagePush: true,
        pushSound: true,
        pushVibration: true,
        onlyFromFollowing: false,
      };
    }
    const row = await ctx.db
      .query("userNotificationSettings")
      .withIndex("by_user", (q) => q.eq("userId", normalizedUserId))
      .unique();
    return {
      likePostInApp: effectiveBool(row?.likePostInApp, true),
      tagPostInApp: effectiveBool(row?.tagPostInApp, true),
      likeStoryInApp: effectiveBool(row?.likeStoryInApp, true),
      followInApp: effectiveBool(row?.followInApp, true),
      followRequestInApp: effectiveBool(row?.followRequestInApp, true),
      followAcceptInApp: effectiveBool(row?.followAcceptInApp, true),
      messageInApp: effectiveBool(row?.messageInApp, true),
      pushEnabled: effectiveBool(row?.pushEnabled, true),
      likePostPush: effectiveBool(row?.likePostPush, true),
      likeStoryPush: effectiveBool(row?.likeStoryPush, true),
      followPush: effectiveBool(row?.followPush, true),
      followRequestPush: effectiveBool(row?.followRequestPush, true),
      followAcceptPush: effectiveBool(row?.followAcceptPush, true),
      messagePush: effectiveBool(row?.messagePush, true),
      pushSound: effectiveBool(row?.pushSound, true),
      pushVibration: effectiveBool(row?.pushVibration, true),
      onlyFromFollowing: effectiveBool(row?.onlyFromFollowing, false),
    };
  },
});

export const updateSettings = mutation({
  args: {
    userId: v.id("users"),
    likePostInApp: v.optional(v.boolean()),
    tagPostInApp: v.optional(v.boolean()),
    likeStoryInApp: v.optional(v.boolean()),
    followInApp: v.optional(v.boolean()),
    followRequestInApp: v.optional(v.boolean()),
    followAcceptInApp: v.optional(v.boolean()),
    messageInApp: v.optional(v.boolean()),
    pushEnabled: v.optional(v.boolean()),
    likePostPush: v.optional(v.boolean()),
    likeStoryPush: v.optional(v.boolean()),
    followPush: v.optional(v.boolean()),
    followRequestPush: v.optional(v.boolean()),
    followAcceptPush: v.optional(v.boolean()),
    messagePush: v.optional(v.boolean()),
    pushSound: v.optional(v.boolean()),
    pushVibration: v.optional(v.boolean()),
    onlyFromFollowing: v.optional(v.boolean()),
  },
  handler: async (ctx, { userId, ...patch }) => {
    await assertUserCanMutate(ctx, userId);
    const now = Date.now();
    const existing = await ctx.db
      .query("userNotificationSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...patch,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("userNotificationSettings", {
      userId,
      updatedAt: now,
      ...patch,
    });
  },
});

export const unreadCount = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await countUnreadActivityForUser(ctx, userId);
  },
});

/** Unread activity rows grouped for the home feed engagement tooltip (follow / like / comment-style). */
export const unreadEngagementBreakdown = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    /**
     * Bounded identically to `unreadCount` — this subscription also stays live
     * on the home feed and must not fan out to a full-table scan. See
     * `UNREAD_SCAN_CAP` commentary above.
     */
    const groups = await ctx.db
      .query("notificationGroups")
      .withIndex("by_receiver_updated", (q) => q.eq("receiverId", userId))
      .order("desc")
      .take(UNREAD_SCAN_CAP);

    let follows = 0;
    let likes = 0;
    let comments = 0;

    for (const g of groups) {
      if (g.readAt !== undefined) continue;
      if (!isIncludedActivityType(String(g.type))) continue;
      switch (g.type) {
        case "follow":
        case "follow_request":
        case "follow_request_accepted":
          follows += 1;
          break;
        case "like_post":
        case "like_story":
          likes += 1;
          break;
        case "comment_post":
        case "reply_comment":
        case "tag_post":
        case "mention_post":
        case "mention_comment":
          comments += 1;
          break;
        default:
          break;
      }
    }

    return { follows, likes, comments };
  },
});

/** True if any of the given users has in-app unread activity (e.g. other accounts in multi-account). Max 3 ids. */
export const hasUnreadAmongUserIds = query({
  args: { userIds: v.array(v.id("users")) },
  handler: async (ctx, { userIds }) => {
    const unique = [...new Set(userIds)].slice(0, 3);
    for (const uid of unique) {
      if ((await countUnreadActivityForUser(ctx, uid)) > 0) return true;
    }
    return false;
  },
});

export const getLatestUnread = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const groups = await ctx.db
      .query("notificationGroups")
      .withIndex("by_receiver_updated", (q) => q.eq("receiverId", userId))
      .order("desc")
      .take(10);

    // Find first unread that passes stale-follows filtering
    for (const g of groups) {
      if (g.readAt !== undefined) continue;
      if (!isIncludedActivityType(String(g.type))) continue;

      // Hide stale follow/follow-request notifications
      if (g.type === "follow" || g.type === "follow_request") {
        const rel = await ctx.db
          .query("follows")
          .withIndex("by_follower_following", (q) =>
            q
              .eq("followerId", g.targetId as Id<"users">)
              .eq("followingId", g.receiverId),
          )
          .unique();

        if (!rel) continue;
        if (g.type === "follow" && rel.status !== "active") continue;
        if (g.type === "follow_request" && rel.status !== "pending") continue;
      }

      // Found a valid unread notification - enrich it
      const senders = await Promise.all(
        g.latestSenderIds.slice(0, 1).map((id) => ctx.db.get(id)),
      );
      const sender = senders[0];
      const senderPic = resolveProfilePic(sender);

      return {
        _id: g._id,
        type: g.type,
        targetType: g.targetType,
        targetId: g.targetId,
        count: g.count,
        updatedAt: g.updatedAt,
        sender: sender
          ? {
              userId: sender._id,
              username: sender.username,
              fullName: sender.fullName,
              profilePictureKey: senderPic.key,
              profilePictureUrl: senderPic.url,
              profilePictureStorageRegion: sender.profilePictureStorageRegion,
            }
          : null,
      };
    }

    return null;
  },
});

export const listGroups = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
    /** Exclusive upper bound on `updatedAt` for the next page. */
    cursor: v.optional(v.number()),
  },
  handler: async (ctx, { userId, limit, cursor }) => {
    const pageSize = Math.min(Math.max(limit ?? 18, 1), 50);
    const BATCH = 64;

    const visibleGroups: Doc<"notificationGroups">[] = [];
    let dbCursor: number | undefined = cursor;
    let guard = 0;

    while (visibleGroups.length < pageSize && guard < 24) {
      guard += 1;
      let q = ctx.db
        .query("notificationGroups")
        .withIndex("by_receiver_updated", (q) => q.eq("receiverId", userId));
      if (dbCursor !== undefined) {
        const beforeUpdatedAt = dbCursor;
        q = q.filter((q) => q.lt(q.field("updatedAt"), beforeUpdatedAt));
      }
      const batch = await q.order("desc").take(BATCH);
      if (batch.length === 0) break;
      dbCursor = batch[batch.length - 1].updatedAt;

      for (const g of batch) {
        if (!isIncludedActivityType(String(g.type))) continue;

        if (g.type === "follow" || g.type === "follow_request") {
          const rel = await ctx.db
            .query("follows")
            .withIndex("by_follower_following", (q) =>
              q
                .eq("followerId", g.targetId as Id<"users">)
                .eq("followingId", g.receiverId),
            )
            .unique();

          if (!rel) continue;
          if (g.type === "follow" && rel.status !== "active") continue;
          if (g.type === "follow_request" && rel.status !== "pending") continue;
        }
        visibleGroups.push(g);
        if (visibleGroups.length >= pageSize) break;
      }

      if (batch.length < BATCH) break;
    }

    const page = visibleGroups.slice(0, pageSize);
    const nextCursor =
      page.length === pageSize ? page[pageSize - 1].updatedAt : undefined;

    const enriched = await Promise.all(
      page.map(async (g) => {
        const senders = await Promise.all(
          g.latestSenderIds.slice(0, 3).map((id) => ctx.db.get(id)),
        );
        let storyAuthorId: Id<"users"> | null = null;
        if (g.targetType === "story") {
          const story = await ctx.db.get(g.targetId as Id<"stories">);
          storyAuthorId = story?.userId ?? null;
        }
        return {
          _id: g._id,
          type: g.type,
          targetType: g.targetType,
          targetId: g.targetId,
          count: g.count,
          updatedAt: g.updatedAt,
          readAt: g.readAt,
          senders: senders.filter(Boolean).map((u) => {
            const pic = resolveProfilePic(u);
            return {
              userId: u!._id,
              username: u!.username,
              fullName: u!.fullName,
              profilePictureKey: pic.key,
              profilePictureUrl: pic.url,
            };
          }),
          storyAuthorId,
        };
      }),
    );

    return { notifications: enriched, nextCursor };
  },
});

export const markGroupRead = mutation({
  args: {
    userId: v.id("users"),
    groupId: v.id("notificationGroups"),
  },
  handler: async (ctx, { userId, groupId }) => {
    await assertUserCanMutate(ctx, userId);
    const g = await ctx.db.get(groupId);
    if (!g || g.receiverId !== userId) {
      throw new Error("Notification not found");
    }
    await ctx.db.patch(groupId, { readAt: Date.now() });
    return { ok: true };
  },
});

export const markAllRead = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await assertUserCanMutate(ctx, userId);
    const groups = await ctx.db
      .query("notificationGroups")
      .withIndex("by_receiver_updated", (q) => q.eq("receiverId", userId))
      .collect();
    const now = Date.now();
    let n = 0;
    for (const g of groups) {
      if (g.readAt === undefined) {
        await ctx.db.patch(g._id, { readAt: now });
        n += 1;
      }
    }
    return { marked: n };
  },
});

export const registerPushToken = mutation({
  args: {
    userId: v.id("users"),
    token: v.string(),
    platform: v.union(v.literal("ios"), v.literal("android"), v.literal("web")),
  },
  handler: async (ctx, { userId, token, platform }) => {
    await assertUserCanMutate(ctx, userId);
    const now = Date.now();
    const existing = await ctx.db
      .query("pushDeviceTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { userId, platform, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("pushDeviceTokens", {
      userId,
      token,
      platform,
      updatedAt: now,
    });
  },
});

// ============================================
// INTERNAL MUTATIONS - Post Notifications
// ============================================

/**
 * Internal: Create notification when user is tagged in a post
 */
export const internalCreateTagNotification = internalMutation({
  args: {
    postId: v.id("posts"),
    taggedUserId: v.id("users"),
    taggerId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    if (args.taggedUserId === args.taggerId) return;

    if (
      await notificationSuppressedBetween(ctx, args.taggedUserId, args.taggerId)
    ) {
      return;
    }

    const settings = await ctx.db
      .query("userNotificationSettings")
      .withIndex("by_user", (q) => q.eq("userId", args.taggedUserId))
      .unique();

    if (settings?.tagPostInApp === false) return;

    // Create or update notification group
    const existing = await ctx.db
      .query("notificationGroups")
      .withIndex("by_receiver_target", (q) =>
        q
          .eq("receiverId", args.taggedUserId)
          .eq("type", "tag_post")
          .eq("targetType", "post")
          .eq("targetId", args.postId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        count: existing.count + 1,
        latestSenderIds: [
          args.taggerId,
          ...existing.latestSenderIds.slice(0, 4),
        ],
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("notificationGroups", {
        receiverId: args.taggedUserId,
        type: "tag_post",
        targetType: "post",
        targetId: args.postId,
        count: 1,
        latestSenderIds: [args.taggerId],
        updatedAt: now,
      });
    }
  },
});

/**
 * Internal: Create notification when user is mentioned in a post caption
 */
export const internalCreateMentionNotification = internalMutation({
  args: {
    postId: v.id("posts"),
    username: v.string(),
    mentionerId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Find user by username
    const mentionedUser = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .unique();

    if (!mentionedUser) return;

    // Don't notify self
    if (mentionedUser._id === args.mentionerId) return;

    if (
      await notificationSuppressedBetween(
        ctx,
        mentionedUser._id,
        args.mentionerId,
      )
    ) {
      return;
    }

    // Check if mentioned user has notifications enabled
    const settings = await ctx.db
      .query("userNotificationSettings")
      .withIndex("by_user", (q) => q.eq("userId", mentionedUser._id))
      .unique();

    if (settings?.likePostInApp === false) return;

    // Create or update notification group
    const existing = await ctx.db
      .query("notificationGroups")
      .withIndex("by_receiver_target", (q) =>
        q
          .eq("receiverId", mentionedUser._id)
          .eq("type", "mention_post")
          .eq("targetType", "post")
          .eq("targetId", args.postId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        count: existing.count + 1,
        latestSenderIds: [
          args.mentionerId,
          ...existing.latestSenderIds.slice(0, 4),
        ],
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("notificationGroups", {
        receiverId: mentionedUser._id,
        type: "mention_post" as any,
        targetType: "post",
        targetId: args.postId,
        count: 1,
        latestSenderIds: [args.mentionerId],
        updatedAt: now,
      });
    }
  },
});

/**
 * Internal: notify a user they were @mentioned in a comment (opens the post).
 * Skips duplicate ping when the receiver is the post author — they already get comment_post.
 */
export const internalCreateCommentMentionNotification = internalMutation({
  args: {
    postId: v.id("posts"),
    mentionedUserId: v.id("users"),
    mentionerId: v.id("users"),
    postAuthorId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    if (args.mentionedUserId === args.mentionerId) return;
    if (args.mentionedUserId === args.postAuthorId) return;

    if (
      await notificationSuppressedBetween(
        ctx,
        args.mentionedUserId,
        args.mentionerId,
      )
    ) {
      return;
    }

    const settings = await ctx.db
      .query("userNotificationSettings")
      .withIndex("by_user", (q) => q.eq("userId", args.mentionedUserId))
      .unique();

    if (settings?.likePostInApp === false) return;

    const existing = await ctx.db
      .query("notificationGroups")
      .withIndex("by_receiver_target", (q) =>
        q
          .eq("receiverId", args.mentionedUserId)
          .eq("type", "mention_comment")
          .eq("targetType", "post")
          .eq("targetId", args.postId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        count: existing.count + 1,
        latestSenderIds: [
          args.mentionerId,
          ...existing.latestSenderIds.slice(0, 4),
        ],
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("notificationGroups", {
        receiverId: args.mentionedUserId,
        type: "mention_comment" as any,
        targetType: "post",
        targetId: args.postId,
        count: 1,
        latestSenderIds: [args.mentionerId],
        updatedAt: now,
      });
    }
  },
});

/**
 * Internal: Create notification when someone comments on a post
 */
export const internalCreateCommentNotification = internalMutation({
  args: {
    postId: v.id("posts"),
    commentId: v.id("comments"),
    postAuthorId: v.id("users"),
    commenterId: v.id("users"),
    isReply: v.boolean(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Don't notify self
    if (args.postAuthorId === args.commenterId) return;

    if (
      await notificationSuppressedBetween(
        ctx,
        args.postAuthorId,
        args.commenterId,
      )
    ) {
      return;
    }

    // Check settings
    const settings = await ctx.db
      .query("userNotificationSettings")
      .withIndex("by_user", (q) => q.eq("userId", args.postAuthorId))
      .unique();

    if (settings?.likePostInApp === false) return;

    const type = args.isReply ? "reply_comment" : "comment_post";

    const existing = await ctx.db
      .query("notificationGroups")
      .withIndex("by_receiver_target", (q) =>
        q
          .eq("receiverId", args.postAuthorId)
          .eq("type", type as any)
          .eq("targetType", "post")
          .eq("targetId", args.postId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        count: existing.count + 1,
        latestSenderIds: [
          args.commenterId,
          ...existing.latestSenderIds.slice(0, 4),
        ],
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("notificationGroups", {
        receiverId: args.postAuthorId,
        type: type as any,
        targetType: "post",
        targetId: args.postId,
        count: 1,
        latestSenderIds: [args.commenterId],
        updatedAt: now,
      });
    }
  },
});

/**
 * Internal: Create notification when someone replies to a comment
 */
export const internalCreateReplyNotification = internalMutation({
  args: {
    postId: v.id("posts"),
    commentId: v.id("comments"),
    parentCommentId: v.id("comments"),
    parentCommentAuthorId: v.id("users"),
    replierId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Don't notify self
    if (args.parentCommentAuthorId === args.replierId) return;

    if (
      await notificationSuppressedBetween(
        ctx,
        args.parentCommentAuthorId,
        args.replierId,
      )
    ) {
      return;
    }

    // Check settings
    const settings = await ctx.db
      .query("userNotificationSettings")
      .withIndex("by_user", (q) => q.eq("userId", args.parentCommentAuthorId))
      .unique();

    if (settings?.likePostInApp === false) return;

    const existing = await ctx.db
      .query("notificationGroups")
      .withIndex("by_receiver_target", (q) =>
        q
          .eq("receiverId", args.parentCommentAuthorId)
          .eq("type", "reply_comment")
          .eq("targetType", "comment")
          .eq("targetId", args.parentCommentId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        count: existing.count + 1,
        latestSenderIds: [
          args.replierId,
          ...existing.latestSenderIds.slice(0, 4),
        ],
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("notificationGroups", {
        receiverId: args.parentCommentAuthorId,
        type: "reply_comment" as any,
        targetType: "comment",
        targetId: args.parentCommentId,
        count: 1,
        latestSenderIds: [args.replierId],
        updatedAt: now,
      });
    }
  },
});

/**
 * Internal: Create notification when someone likes a comment
 */
export const internalCreateCommentLikeNotification = internalMutation({
  args: {
    commentId: v.id("comments"),
    commentAuthorId: v.id("users"),
    likerId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Don't notify self
    if (args.commentAuthorId === args.likerId) return;

    if (
      await notificationSuppressedBetween(
        ctx,
        args.commentAuthorId,
        args.likerId,
      )
    ) {
      return;
    }

    // Check settings
    const settings = await ctx.db
      .query("userNotificationSettings")
      .withIndex("by_user", (q) => q.eq("userId", args.commentAuthorId))
      .unique();

    if (settings?.likePostInApp === false) return;

    const existing = await ctx.db
      .query("notificationGroups")
      .withIndex("by_receiver_target", (q) =>
        q
          .eq("receiverId", args.commentAuthorId)
          .eq("type", "like_comment")
          .eq("targetType", "comment")
          .eq("targetId", args.commentId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        count: existing.count + 1,
        latestSenderIds: [
          args.likerId,
          ...existing.latestSenderIds.slice(0, 4),
        ],
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("notificationGroups", {
        receiverId: args.commentAuthorId,
        type: "like_comment" as any,
        targetType: "comment",
        targetId: args.commentId,
        count: 1,
        latestSenderIds: [args.likerId],
        updatedAt: now,
      });
    }
  },
});

/**
 * Internal: Add like to notification group
 */
export const internalAddLikeToGroup = internalMutation({
  args: {
    receiverId: v.id("users"),
    type: v.string(),
    targetType: v.string(),
    targetId: v.string(),
    senderId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    if (
      await notificationSuppressedBetween(ctx, args.receiverId, args.senderId)
    ) {
      return;
    }

    // Check settings
    const settings = await ctx.db
      .query("userNotificationSettings")
      .withIndex("by_user", (q) => q.eq("userId", args.receiverId))
      .unique();

    if (settings?.likePostInApp === false) return;

    const existing = await ctx.db
      .query("notificationGroups")
      .withIndex("by_receiver_target", (q) =>
        q
          .eq("receiverId", args.receiverId)
          .eq("type", args.type as any)
          .eq("targetType", args.targetType as any)
          .eq("targetId", args.targetId),
      )
      .unique();

    if (existing) {
      // Don't add duplicate sender
      const alreadyInList = existing.latestSenderIds.includes(args.senderId);
      if (!alreadyInList) {
        await ctx.db.patch(existing._id, {
          count: existing.count + 1,
          latestSenderIds: [
            args.senderId,
            ...existing.latestSenderIds.slice(0, 4),
          ],
          updatedAt: now,
          readAt: undefined, // Mark as unread
        });
      }
    } else {
      await ctx.db.insert("notificationGroups", {
        receiverId: args.receiverId,
        type: args.type as any,
        targetType: args.targetType as any,
        targetId: args.targetId,
        count: 1,
        latestSenderIds: [args.senderId],
        updatedAt: now,
      });
    }
  },
});

/**
 * Internal: Remove like from notification group
 */
export const internalRemoveLikeFromGroup = internalMutation({
  args: {
    receiverId: v.id("users"),
    type: v.string(),
    targetId: v.string(),
    senderId: v.id("users"),
    targetType: v.optional(
      v.union(v.literal("post"), v.literal("comment"), v.literal("story")),
    ),
  },
  handler: async (ctx, args) => {
    const targetType = args.targetType ?? "post";
    const existing = await ctx.db
      .query("notificationGroups")
      .withIndex("by_receiver_target", (q) =>
        q
          .eq("receiverId", args.receiverId)
          .eq("type", args.type as any)
          .eq("targetType", targetType as any)
          .eq("targetId", args.targetId),
      )
      .unique();

    if (!existing) return;

    // Remove sender from list
    const newSenders = existing.latestSenderIds.filter(
      (id) => id !== args.senderId,
    );

    if (newSenders.length === 0 || existing.count <= 1) {
      // No more likes, delete the notification
      await ctx.db.delete(existing._id);
    } else {
      await ctx.db.patch(existing._id, {
        count: existing.count - 1,
        latestSenderIds: newSenders,
        updatedAt: Date.now(),
      });
    }
  },
});
