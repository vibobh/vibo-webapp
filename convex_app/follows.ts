/**
 * Follow System - Complete follow/unfollow/request/accept/decline logic
 * Supports both public and private accounts
 */

import { v } from "convex/values";
import { verificationTierPayload } from "./verificationTier";
import { userHiddenFromPublicDiscovery } from "./staffVisibility";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { assertUserCanMutate } from "./accountModeration";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import {
  notificationSuppressedBetween,
  usersBlockedEitherWay,
} from "./viewerContentFilters";

/** Get the current follow status between two users */
export const getFollowStatus = query({
  args: {
    followerId: v.id("users"),
    followingId: v.id("users"),
  },
  handler: async (ctx, { followerId, followingId }) => {
    if (followerId === followingId) {
      return { status: "self" };
    }

    const follow = await ctx.db
      .query("follows")
      .withIndex("by_follower_following", (q) =>
        q.eq("followerId", followerId).eq("followingId", followingId),
      )
      .unique();

    if (!follow) {
      return { status: "not_following" };
    }

    return {
      status: follow.status, // "active" | "pending"
      followId: follow._id,
    };
  },
});

/** Get bidirectional relationship for "Follow Back" UI */
export const getFollowRelationship = query({
  args: {
    viewerId: v.id("users"),
    targetId: v.id("users"),
  },
  handler: async (ctx, { viewerId, targetId }) => {
    if (viewerId === targetId) {
      return {
        isSelf: true,
        isFollowing: false,
        followsYou: false,
        status: "self",
      };
    }

    const [viewerToTarget, targetToViewer] = await Promise.all([
      ctx.db
        .query("follows")
        .withIndex("by_follower_following", (q) =>
          q.eq("followerId", viewerId).eq("followingId", targetId),
        )
        .unique(),
      ctx.db
        .query("follows")
        .withIndex("by_follower_following", (q) =>
          q.eq("followerId", targetId).eq("followingId", viewerId),
        )
        .unique(),
    ]);

    return {
      isSelf: false,
      status: viewerToTarget?.status ?? "not_following",
      isFollowing: viewerToTarget?.status === "active",
      isPending: viewerToTarget?.status === "pending",
      followsYou: targetToViewer?.status === "active",
    };
  },
});

/**
 * Consolidated follow metadata query
 * Returns all follow-related state in a single call
 * Replaces: getFollowStatus + getFollowRelationship + isCloseFriend + getMutedStatus + getRestrictedStatus
 */
export const getFollowMeta = query({
  args: {
    viewerId: v.id("users"),
    targetId: v.id("users"),
  },
  handler: async (ctx, { viewerId, targetId }) => {
    // Self check
    if (viewerId === targetId) {
      return {
        isSelf: true,
        status: "self",
        isFollowing: false,
        isPending: false,
        followsYou: false,
        isCloseFriend: false,
        isMuted: false,
        muteStories: false,
        mutePosts: false,
        isRestricted: false,
        isBlocked: false,
        isBlockedBy: false,
      };
    }

    // Parallel queries for all follow-related data
    const [
      viewerToTarget,
      targetToViewer,
      closeFriendEntry,
      muteEntry,
      restrictEntry,
      blockViewerToTarget,
      blockTargetToViewer,
    ] = await Promise.all([
      // Viewer -> Target follow status
      ctx.db
        .query("follows")
        .withIndex("by_follower_following", (q) =>
          q.eq("followerId", viewerId).eq("followingId", targetId),
        )
        .unique(),
      // Target -> Viewer follow status (for "followsYou" / "Follow Back")
      ctx.db
        .query("follows")
        .withIndex("by_follower_following", (q) =>
          q.eq("followerId", targetId).eq("followingId", viewerId),
        )
        .unique(),
      // Close friend check
      ctx.db
        .query("closeFriends")
        .withIndex("by_user_friend", (q) =>
          q.eq("userId", viewerId).eq("friendId", targetId),
        )
        .unique(),
      // Mute check
      ctx.db
        .query("mutes")
        .withIndex("by_user_muted", (q) =>
          q.eq("userId", viewerId).eq("mutedId", targetId),
        )
        .unique(),
      // Restrict check
      ctx.db
        .query("restricts")
        .withIndex("by_user_restricted", (q) =>
          q.eq("userId", viewerId).eq("restrictedId", targetId),
        )
        .unique(),
      ctx.db
        .query("userBlocks")
        .withIndex("by_blocker_blocked", (q) =>
          q.eq("blockerId", viewerId).eq("blockedId", targetId),
        )
        .unique(),
      ctx.db
        .query("userBlocks")
        .withIndex("by_blocker_blocked", (q) =>
          q.eq("blockerId", targetId).eq("blockedId", viewerId),
        )
        .unique(),
    ]);

    const status = viewerToTarget?.status ?? "not_following";

    return {
      isSelf: false,
      status, // "active" | "pending" | "not_following"
      isFollowing: status === "active",
      isPending: status === "pending",
      followsYou: targetToViewer?.status === "active",
      isCloseFriend: !!closeFriendEntry,
      isMuted: !!muteEntry,
      muteStories: muteEntry?.muteStories ?? false,
      mutePosts: muteEntry?.mutePosts ?? false,
      isRestricted: !!restrictEntry,
      isBlocked: !!blockViewerToTarget,
      isBlockedBy: !!blockTargetToViewer,
    };
  },
});

/** Get follower and following counts for a user */
export const getFollowCounts = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, { userId }) => {
    const followers = await ctx.db
      .query("follows")
      .withIndex("by_following_status", (q) =>
        q.eq("followingId", userId).eq("status", "active"),
      )
      .collect();

    const following = await ctx.db
      .query("follows")
      .withIndex("by_follower_status", (q) =>
        q.eq("followerId", userId).eq("status", "active"),
      )
      .collect();

    return {
      followerCount: followers.length,
      followingCount: following.length,
    };
  },
});

/** Get list of followers with optional pagination */
export const getFollowers = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  handler: async (ctx, { userId, limit, cursor }) => {
    const pageSize = limit ?? 50;

    let query = ctx.db
      .query("follows")
      .withIndex("by_following_status", (q) =>
        q.eq("followingId", userId).eq("status", "active"),
      );

    const follows = await query.take(pageSize);

    // Fetch follower user details
    const followerUsers = await Promise.all(
      follows.map(async (follow) => {
        const user = await ctx.db.get(follow.followerId);
        return user && !userHiddenFromPublicDiscovery(user)
          ? {
              _id: user._id,
              username: user.username,
              fullName: user.fullName,
              profilePictureUrl: user.profilePictureUrl,
              profilePictureKey: user.profilePictureKey,
              profilePictureStorageRegion: user.profilePictureStorageRegion,
              followedAt: follow.createdAt,
              ...verificationTierPayload(user),
            }
          : null;
      }),
    );

    return {
      followers: followerUsers.filter(Boolean),
      nextCursor:
        follows.length === pageSize
          ? follows[follows.length - 1].createdAt
          : null,
    };
  },
});

/** Get list of users being followed */
export const getFollowing = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  handler: async (ctx, { userId, limit, cursor }) => {
    const pageSize = limit ?? 50;

    let query = ctx.db
      .query("follows")
      .withIndex("by_follower_status", (q) =>
        q.eq("followerId", userId).eq("status", "active"),
      );

    const follows = await query.take(pageSize);

    // Fetch following user details
    const followingUsers = await Promise.all(
      follows.map(async (follow) => {
        const user = await ctx.db.get(follow.followingId);
        return user && !userHiddenFromPublicDiscovery(user)
          ? {
              _id: user._id,
              username: user.username,
              fullName: user.fullName,
              profilePictureUrl: user.profilePictureUrl,
              profilePictureKey: user.profilePictureKey,
              profilePictureStorageRegion: user.profilePictureStorageRegion,
              followedAt: follow.createdAt,
              ...verificationTierPayload(user),
            }
          : null;
      }),
    );

    return {
      following: followingUsers.filter(Boolean),
      nextCursor:
        follows.length === pageSize
          ? follows[follows.length - 1].createdAt
          : null,
    };
  },
});

/** Get pending follow requests for a user (for private accounts) */
export const getFollowRequests = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { userId, limit }) => {
    const pageSize = limit ?? 50;

    const requests = await ctx.db
      .query("follows")
      .withIndex("by_following_status", (q) =>
        q.eq("followingId", userId).eq("status", "pending"),
      )
      .take(pageSize);

    // Fetch requester details
    const requesters = await Promise.all(
      requests.map(async (request) => {
        const user = await ctx.db.get(request.followerId);
        return user
          ? {
              _id: user._id,
              username: user.username,
              fullName: user.fullName,
              profilePictureUrl: user.profilePictureUrl,
              profilePictureKey: user.profilePictureKey,
              requestedAt: request.createdAt,
              followId: request._id,
            }
          : null;
      }),
    );

    return {
      requests: requesters.filter(Boolean),
      count: requests.length,
    };
  },
});

/** Follow or request to follow a user */
export const followUser = mutation({
  args: {
    followerId: v.id("users"),
    followingId: v.id("users"),
  },
  handler: async (ctx, { followerId, followingId }) => {
    await assertUserCanMutate(ctx, followerId);
    // Validate
    if (followerId === followingId) {
      throw new Error("Cannot follow yourself");
    }

    // Get both users
    const [follower, targetUser] = await Promise.all([
      ctx.db.get(followerId),
      ctx.db.get(followingId),
    ]);

    if (!follower || !targetUser) {
      throw new Error("User not found");
    }

    if (await usersBlockedEitherWay(ctx, followerId, followingId)) {
      throw new Error("Cannot follow this user");
    }

    // Check if relationship already exists
    const existing = await ctx.db
      .query("follows")
      .withIndex("by_follower_following", (q) =>
        q.eq("followerId", followerId).eq("followingId", followingId),
      )
      .unique();

    if (existing) {
      return {
        success: false,
        status: existing.status,
        message:
          existing.status === "pending"
            ? "Follow request already pending"
            : "Already following",
      };
    }

    const isPrivate = targetUser.isPrivate ?? false;
    const now = Date.now();

    // Create the follow relationship
    const followId = await ctx.db.insert("follows", {
      followerId,
      followingId,
      status: isPrivate ? "pending" : "active",
      createdAt: now,
      acceptedAt: isPrivate ? undefined : now,
    });

    // If public account: increment counts immediately
    if (!isPrivate) {
      await Promise.all([
        ctx.runMutation(internal.follows.incrementFollowerCount, {
          userId: followingId,
        }),
        ctx.runMutation(internal.follows.incrementFollowingCount, {
          userId: followerId,
        }),
        // Create follow notification
        ctx.runMutation(internal.follows.createFollowNotification, {
          followerId,
          followingId,
          isRequest: false,
        }),
      ]);
    } else {
      // Private account: create follow request notification
      await ctx.runMutation(internal.follows.createFollowNotification, {
        followerId,
        followingId,
        isRequest: true,
      });

      // Update pending request count on target user
      const currentPending = targetUser.pendingFollowRequests ?? 0;
      await ctx.db.patch(followingId, {
        pendingFollowRequests: currentPending + 1,
      });
    }

    return {
      success: true,
      status: isPrivate ? "pending" : "active",
      followId,
      isPrivate,
    };
  },
});

/** Unfollow a user */
export const unfollowUser = mutation({
  args: {
    followerId: v.id("users"),
    followingId: v.id("users"),
  },
  handler: async (ctx, { followerId, followingId }) => {
    await assertUserCanMutate(ctx, followerId);
    const existing = await ctx.db
      .query("follows")
      .withIndex("by_follower_following", (q) =>
        q.eq("followerId", followerId).eq("followingId", followingId),
      )
      .unique();

    if (!existing) {
      return { success: false, message: "Not following" };
    }

    const wasActive = existing.status === "active";

    // Delete the relationship
    await ctx.db.delete(existing._id);

    // Decrement counts if it was an active follow
    if (wasActive) {
      await Promise.all([
        ctx.runMutation(internal.follows.decrementFollowerCount, {
          userId: followingId,
        }),
        ctx.runMutation(internal.follows.decrementFollowingCount, {
          userId: followerId,
        }),
        // Remove follow activity if follow is removed
        ctx.runMutation(internal.follows.removeFollowNotification, {
          followerId,
          followingId,
        }),
      ]);
    }

    return { success: true, wasActive };
  },
});

/** Accept a follow request (for private accounts) */
export const acceptFollowRequest = mutation({
  args: {
    userId: v.id("users"), // The private account owner
    requesterId: v.id("users"), // The user who requested to follow
  },
  handler: async (ctx, { userId, requesterId }) => {
    await assertUserCanMutate(ctx, userId);
    // Find the pending request
    const request = await ctx.db
      .query("follows")
      .withIndex("by_follower_following", (q) =>
        q.eq("followerId", requesterId).eq("followingId", userId),
      )
      .unique();

    if (!request || request.status !== "pending") {
      return { success: false, message: "Request not found" };
    }

    // Update to active
    await ctx.db.patch(request._id, {
      status: "active",
      acceptedAt: Date.now(),
    });

    // Increment counts
    await Promise.all([
      ctx.runMutation(internal.follows.incrementFollowerCount, {
        userId,
      }),
      ctx.runMutation(internal.follows.incrementFollowingCount, {
        userId: requesterId,
      }),
    ]);

    // Decrement pending request count
    const targetUser = await ctx.db.get(userId);
    if (targetUser?.pendingFollowRequests) {
      await ctx.db.patch(userId, {
        pendingFollowRequests: Math.max(
          0,
          targetUser.pendingFollowRequests - 1,
        ),
      });
    }

    // Notify requester that their request was accepted
    await ctx.runMutation(internal.follows.createFollowAcceptedNotification, {
      accepterId: userId,
      requesterId,
    });

    return { success: true };
  },
});

/** Decline a follow request */
export const declineFollowRequest = mutation({
  args: {
    userId: v.id("users"),
    requesterId: v.id("users"),
  },
  handler: async (ctx, { userId, requesterId }) => {
    await assertUserCanMutate(ctx, userId);
    // Find the pending request
    const request = await ctx.db
      .query("follows")
      .withIndex("by_follower_following", (q) =>
        q.eq("followerId", requesterId).eq("followingId", userId),
      )
      .unique();

    if (!request || request.status !== "pending") {
      return { success: false, message: "Request not found" };
    }

    // Delete the request
    await ctx.db.delete(request._id);

    // Decrement pending request count
    const targetUser = await ctx.db.get(userId);
    if (targetUser?.pendingFollowRequests) {
      await ctx.db.patch(userId, {
        pendingFollowRequests: Math.max(
          0,
          targetUser.pendingFollowRequests - 1,
        ),
      });
    }

    return { success: true };
  },
});

/** Remove a follower (for private accounts) */
export const removeFollower = mutation({
  args: {
    userId: v.id("users"),
    followerId: v.id("users"),
  },
  handler: async (ctx, { userId, followerId }) => {
    await assertUserCanMutate(ctx, userId);
    const existing = await ctx.db
      .query("follows")
      .withIndex("by_follower_following", (q) =>
        q.eq("followerId", followerId).eq("followingId", userId),
      )
      .unique();

    if (!existing || existing.status !== "active") {
      return { success: false, message: "Follower not found" };
    }

    // Delete the relationship
    await ctx.db.delete(existing._id);

    // Decrement counts
    await Promise.all([
      ctx.runMutation(internal.follows.decrementFollowerCount, {
        userId,
      }),
      ctx.runMutation(internal.follows.decrementFollowingCount, {
        userId: followerId,
      }),
    ]);

    return { success: true };
  },
});

// ============================================
// Internal Mutations (for count management)
// ============================================

export const incrementFollowerCount = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) return;
    const current = user.followerCount ?? 0;
    await ctx.db.patch(userId, { followerCount: current + 1 });
  },
});

export const decrementFollowerCount = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) return;
    const current = user.followerCount ?? 0;
    await ctx.db.patch(userId, { followerCount: Math.max(0, current - 1) });
  },
});

export const incrementFollowingCount = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) return;
    const current = user.followingCount ?? 0;
    await ctx.db.patch(userId, { followingCount: current + 1 });
  },
});

export const decrementFollowingCount = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) return;
    const current = user.followingCount ?? 0;
    await ctx.db.patch(userId, { followingCount: Math.max(0, current - 1) });
  },
});

// ============================================
// Notification System
// ============================================

export const createFollowNotification = internalMutation({
  args: {
    followerId: v.id("users"),
    followingId: v.id("users"),
    isRequest: v.boolean(),
  },
  handler: async (ctx, { followerId, followingId, isRequest }) => {
    const type = isRequest ? "follow_request" : "follow";
    const FOLLOW_NOTIFICATION_COOLDOWN_MS = 60_000;

    if (
      await notificationSuppressedBetween(ctx, followingId, followerId)
    ) {
      return;
    }

    // Get follower details
    const follower = await ctx.db.get(followerId);
    if (!follower) return;

    // Check if we should group this notification
    const existingGroup = await ctx.db
      .query("notificationGroups")
      .withIndex("by_receiver_target", (q) =>
        q
          .eq("receiverId", followingId)
          .eq("type", type)
          .eq("targetType", "user")
          .eq("targetId", String(followerId)),
      )
      .unique();

    const now = Date.now();
    if (existingGroup) {
      // Anti-spam: don't keep bumping this notification too frequently.
      if (now - existingGroup.updatedAt < FOLLOW_NOTIFICATION_COOLDOWN_MS) {
        return;
      }
      await ctx.db.patch(existingGroup._id, {
        count: 1,
        latestSenderIds: [followerId],
        updatedAt: now,
        readAt: undefined,
      });
    } else {
      // Create new group
      await ctx.db.insert("notificationGroups", {
        receiverId: followingId,
        type,
        targetType: "user",
        targetId: String(followerId),
        count: 1,
        latestSenderIds: [followerId],
        updatedAt: now,
      });
    }

    // TODO: Send push notification if enabled
    // This would call an internal action to send push
  },
});

/** Remove follow/follow-request notifications when follow is removed */
export const removeFollowNotification = internalMutation({
  args: {
    followerId: v.id("users"),
    followingId: v.id("users"),
  },
  handler: async (ctx, { followerId, followingId }) => {
    const [followGroup, requestGroup] = await Promise.all([
      ctx.db
        .query("notificationGroups")
        .withIndex("by_receiver_target", (q) =>
          q
            .eq("receiverId", followingId)
            .eq("type", "follow")
            .eq("targetType", "user")
            .eq("targetId", String(followerId)),
        )
        .unique(),
      ctx.db
        .query("notificationGroups")
        .withIndex("by_receiver_target", (q) =>
          q
            .eq("receiverId", followingId)
            .eq("type", "follow_request")
            .eq("targetType", "user")
            .eq("targetId", String(followerId)),
        )
        .unique(),
    ]);

    if (followGroup) await ctx.db.delete(followGroup._id);
    if (requestGroup) await ctx.db.delete(requestGroup._id);
  },
});

export const createFollowAcceptedNotification = internalMutation({
  args: {
    accepterId: v.id("users"),
    requesterId: v.id("users"),
  },
  handler: async (ctx, { accepterId, requesterId }) => {
    // Get accepter details
    const accepter = await ctx.db.get(accepterId);
    if (!accepter) return;

    if (await notificationSuppressedBetween(ctx, requesterId, accepterId)) {
      return;
    }

    // Check if we should group
    const existingGroup = await ctx.db
      .query("notificationGroups")
      .withIndex("by_receiver_target", (q) =>
        q
          .eq("receiverId", requesterId)
          .eq("type", "follow_request_accepted")
          .eq("targetType", "user")
          .eq("targetId", String(accepterId)),
      )
      .unique();

    if (existingGroup) {
      await ctx.db.patch(existingGroup._id, {
        count: existingGroup.count + 1,
        latestSenderIds: [accepterId],
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("notificationGroups", {
        receiverId: requesterId,
        type: "follow_request_accepted",
        targetType: "user",
        targetId: String(accepterId),
        count: 1,
        latestSenderIds: [accepterId],
        updatedAt: Date.now(),
      });
    }

    // TODO: Send push notification if enabled
  },
});

// ============================================
// Close Friends (Favorites) System
// ============================================

export const getCloseFriends = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { userId, limit }) => {
    const maxResults = limit ?? 100;
    const friends = await ctx.db
      .query("closeFriends")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(maxResults);

    const friendUsers = await Promise.all(
      friends.map(async (f) => {
        const user = await ctx.db.get(f.friendId);
        return user
          ? {
              _id: user._id,
              username: user.username,
              fullName: user.fullName,
              profilePictureUrl: user.profilePictureUrl,
              profilePictureKey: user.profilePictureKey,
              addedAt: f.createdAt,
            }
          : null;
      }),
    );

    return friendUsers.filter(Boolean);
  },
});

export const isCloseFriend = query({
  args: {
    userId: v.id("users"),
    friendId: v.id("users"),
  },
  handler: async (ctx, { userId, friendId }) => {
    const existing = await ctx.db
      .query("closeFriends")
      .withIndex("by_user_friend", (q) =>
        q.eq("userId", userId).eq("friendId", friendId),
      )
      .unique();
    return !!existing;
  },
});

export const addToCloseFriends = mutation({
  args: {
    userId: v.id("users"),
    friendId: v.id("users"),
  },
  handler: async (ctx, { userId, friendId }) => {
    await assertUserCanMutate(ctx, userId);
    const existing = await ctx.db
      .query("closeFriends")
      .withIndex("by_user_friend", (q) =>
        q.eq("userId", userId).eq("friendId", friendId),
      )
      .unique();

    if (existing) {
      return { alreadyAdded: true };
    }

    await ctx.db.insert("closeFriends", {
      userId,
      friendId,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

export const removeFromCloseFriends = mutation({
  args: {
    userId: v.id("users"),
    friendId: v.id("users"),
  },
  handler: async (ctx, { userId, friendId }) => {
    await assertUserCanMutate(ctx, userId);
    const existing = await ctx.db
      .query("closeFriends")
      .withIndex("by_user_friend", (q) =>
        q.eq("userId", userId).eq("friendId", friendId),
      )
      .unique();

    if (!existing) {
      return { notFound: true };
    }

    await ctx.db.delete(existing._id);
    return { success: true };
  },
});

// ============================================
// Mute System
// ============================================

export const getMutedStatus = query({
  args: {
    userId: v.id("users"),
    mutedId: v.id("users"),
  },
  handler: async (ctx, { userId, mutedId }) => {
    const existing = await ctx.db
      .query("mutes")
      .withIndex("by_user_muted", (q) =>
        q.eq("userId", userId).eq("mutedId", mutedId),
      )
      .unique();

    if (!existing) {
      return { isMuted: false };
    }

    return {
      isMuted: true,
      muteStories: existing.muteStories ?? false,
      mutePosts: existing.mutePosts ?? false,
    };
  },
});

export const muteUser = mutation({
  args: {
    userId: v.id("users"),
    mutedId: v.id("users"),
    muteStories: v.optional(v.boolean()),
    mutePosts: v.optional(v.boolean()),
  },
  handler: async (ctx, { userId, mutedId, muteStories, mutePosts }) => {
    await assertUserCanMutate(ctx, userId);
    if (await usersBlockedEitherWay(ctx, userId, mutedId)) {
      throw new Error("Cannot mute this user");
    }

    const existing = await ctx.db
      .query("mutes")
      .withIndex("by_user_muted", (q) =>
        q.eq("userId", userId).eq("mutedId", mutedId),
      )
      .unique();

    if (existing) {
      // Update existing mute settings
      await ctx.db.patch(existing._id, {
        muteStories: muteStories ?? existing.muteStories,
        mutePosts: mutePosts ?? existing.mutePosts,
      });
    } else {
      await ctx.db.insert("mutes", {
        userId,
        mutedId,
        muteStories: muteStories ?? true,
        mutePosts: mutePosts ?? true,
        createdAt: Date.now(),
      });
    }

    return { success: true };
  },
});

export const unmuteUser = mutation({
  args: {
    userId: v.id("users"),
    mutedId: v.id("users"),
  },
  handler: async (ctx, { userId, mutedId }) => {
    await assertUserCanMutate(ctx, userId);
    const existing = await ctx.db
      .query("mutes")
      .withIndex("by_user_muted", (q) =>
        q.eq("userId", userId).eq("mutedId", mutedId),
      )
      .unique();

    if (!existing) {
      return { notFound: true };
    }

    await ctx.db.delete(existing._id);
    return { success: true };
  },
});

async function removeFollowEdgeIfPresent(
  ctx: MutationCtx,
  followerId: Id<"users">,
  followingId: Id<"users">,
): Promise<void> {
  const existing = await ctx.db
    .query("follows")
    .withIndex("by_follower_following", (q) =>
      q.eq("followerId", followerId).eq("followingId", followingId),
    )
    .unique();
  if (!existing) return;

  const wasActive = existing.status === "active";
  const wasPending = existing.status === "pending";
  await ctx.db.delete(existing._id);

  if (wasActive) {
    await Promise.all([
      ctx.runMutation(internal.follows.decrementFollowerCount, {
        userId: followingId,
      }),
      ctx.runMutation(internal.follows.decrementFollowingCount, {
        userId: followerId,
      }),
      ctx.runMutation(internal.follows.removeFollowNotification, {
        followerId,
        followingId,
      }),
    ]);
  } else if (wasPending) {
    const targetUser = await ctx.db.get(followingId);
    if (targetUser?.pendingFollowRequests) {
      await ctx.db.patch(followingId, {
        pendingFollowRequests: Math.max(
          0,
          targetUser.pendingFollowRequests - 1,
        ),
      });
    }
  }
}

/** Block removes both follow edges and conflicting mutes. */
export const blockUser = mutation({
  args: {
    userId: v.id("users"),
    blockedId: v.id("users"),
  },
  handler: async (ctx, { userId, blockedId }) => {
    await assertUserCanMutate(ctx, userId);
    if (userId === blockedId) throw new Error("Invalid");

    const [u1, u2] = await Promise.all([
      ctx.db.get(userId),
      ctx.db.get(blockedId),
    ]);
    if (!u1 || !u2) throw new Error("User not found");

    const existing = await ctx.db
      .query("userBlocks")
      .withIndex("by_blocker_blocked", (q) =>
        q.eq("blockerId", userId).eq("blockedId", blockedId),
      )
      .unique();
    if (existing) return { success: true };

    await ctx.db.insert("userBlocks", {
      blockerId: userId,
      blockedId,
      createdAt: Date.now(),
    });

    await Promise.all([
      removeFollowEdgeIfPresent(ctx, userId, blockedId),
      removeFollowEdgeIfPresent(ctx, blockedId, userId),
    ]);

    const muteAB = await ctx.db
      .query("mutes")
      .withIndex("by_user_muted", (q) =>
        q.eq("userId", userId).eq("mutedId", blockedId),
      )
      .unique();
    if (muteAB) await ctx.db.delete(muteAB._id);

    const muteBA = await ctx.db
      .query("mutes")
      .withIndex("by_user_muted", (q) =>
        q.eq("userId", blockedId).eq("mutedId", userId),
      )
      .unique();
    if (muteBA) await ctx.db.delete(muteBA._id);

    return { success: true };
  },
});

export const unblockUser = mutation({
  args: {
    userId: v.id("users"),
    blockedId: v.id("users"),
  },
  handler: async (ctx, { userId, blockedId }) => {
    await assertUserCanMutate(ctx, userId);
    const existing = await ctx.db
      .query("userBlocks")
      .withIndex("by_blocker_blocked", (q) =>
        q.eq("blockerId", userId).eq("blockedId", blockedId),
      )
      .unique();
    if (!existing) return { success: false };
    await ctx.db.delete(existing._id);
    return { success: true };
  },
});

// ============================================
// Restrict System
// ============================================

export const getRestrictedStatus = query({
  args: {
    userId: v.id("users"),
    restrictedId: v.id("users"),
  },
  handler: async (ctx, { userId, restrictedId }) => {
    const existing = await ctx.db
      .query("restricts")
      .withIndex("by_user_restricted", (q) =>
        q.eq("userId", userId).eq("restrictedId", restrictedId),
      )
      .unique();

    return { isRestricted: !!existing };
  },
});

export const restrictUser = mutation({
  args: {
    userId: v.id("users"),
    restrictedId: v.id("users"),
  },
  handler: async (ctx, { userId, restrictedId }) => {
    await assertUserCanMutate(ctx, userId);
    const existing = await ctx.db
      .query("restricts")
      .withIndex("by_user_restricted", (q) =>
        q.eq("userId", userId).eq("restrictedId", restrictedId),
      )
      .unique();

    if (existing) {
      return { alreadyRestricted: true };
    }

    await ctx.db.insert("restricts", {
      userId,
      restrictedId,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

export const unrestrictUser = mutation({
  args: {
    userId: v.id("users"),
    restrictedId: v.id("users"),
  },
  handler: async (ctx, { userId, restrictedId }) => {
    await assertUserCanMutate(ctx, userId);
    const existing = await ctx.db
      .query("restricts")
      .withIndex("by_user_restricted", (q) =>
        q.eq("userId", userId).eq("restrictedId", restrictedId),
      )
      .unique();

    if (!existing) {
      return { notFound: true };
    }

    await ctx.db.delete(existing._id);
    return { success: true };
  },
});

/**
 * Batched follow metadata query - fetches follow data for multiple users at once
 * Reduces N individual queries into just 5 queries total
 * Returns array of follow metadata in the same order as input targetIds
 */
export const getFollowMetaBatch = query({
  args: {
    viewerId: v.id("users"),
    targetIds: v.array(v.id("users")),
  },
  returns: v.array(
    v.object({
      targetId: v.id("users"),
      isSelf: v.boolean(),
      status: v.string(),
      isFollowing: v.boolean(),
      isPending: v.boolean(),
      followsYou: v.boolean(),
      isCloseFriend: v.boolean(),
      isMuted: v.boolean(),
      muteStories: v.boolean(),
      mutePosts: v.boolean(),
      isRestricted: v.boolean(),
    }),
  ),
  handler: async (ctx, { viewerId, targetIds }) => {
    // Handle empty array case
    if (targetIds.length === 0) {
      return [];
    }

    // Batch fetch ALL follow data in just 5 queries
    const [
      viewerToTargets,
      targetsToViewer,
      closeFriendsEntries,
      mutesEntries,
      restrictsEntries,
    ] = await Promise.all([
      // 1. All follows where viewer is the follower (viewer -> targets)
      ctx.db
        .query("follows")
        .withIndex("by_follower_status", (q) => q.eq("followerId", viewerId))
        .collect(),
      // 2. All follows where viewer is the following (targets -> viewer)
      ctx.db
        .query("follows")
        .withIndex("by_following_status", (q) => q.eq("followingId", viewerId))
        .collect(),
      // 3. All close friends entries for viewer
      ctx.db
        .query("closeFriends")
        .withIndex("by_user", (q) => q.eq("userId", viewerId))
        .collect(),
      // 4. All mutes entries for viewer
      ctx.db
        .query("mutes")
        .withIndex("by_user", (q) => q.eq("userId", viewerId))
        .collect(),
      // 5. All restricts entries for viewer
      ctx.db
        .query("restricts")
        .withIndex("by_user", (q) => q.eq("userId", viewerId))
        .collect(),
    ]);

    // Build lookup maps for O(1) access
    const viewerToTargetMap = new Map<string, (typeof viewerToTargets)[0]>();
    for (const follow of viewerToTargets) {
      viewerToTargetMap.set(follow.followingId, follow);
    }

    const targetToViewerMap = new Map<string, (typeof targetsToViewer)[0]>();
    for (const follow of targetsToViewer) {
      targetToViewerMap.set(follow.followerId, follow);
    }

    const closeFriendSet = new Set<string>();
    for (const entry of closeFriendsEntries) {
      closeFriendSet.add(entry.friendId);
    }

    const muteMap = new Map<string, (typeof mutesEntries)[0]>();
    for (const entry of mutesEntries) {
      muteMap.set(entry.mutedId, entry);
    }

    const restrictSet = new Set<string>();
    for (const entry of restrictsEntries) {
      restrictSet.add(entry.restrictedId);
    }

    // Map over targetIds and build results from the fetched data
    return targetIds.map((targetId) => {
      // Self check
      if (viewerId === targetId) {
        return {
          targetId,
          isSelf: true,
          status: "self",
          isFollowing: false,
          isPending: false,
          followsYou: false,
          isCloseFriend: false,
          isMuted: false,
          muteStories: false,
          mutePosts: false,
          isRestricted: false,
        };
      }

      const viewerToTarget = viewerToTargetMap.get(targetId);
      const targetToViewer = targetToViewerMap.get(targetId);
      const muteEntry = muteMap.get(targetId);

      const status = viewerToTarget?.status ?? "not_following";

      return {
        targetId,
        isSelf: false,
        status, // "active" | "pending" | "not_following"
        isFollowing: status === "active",
        isPending: status === "pending",
        followsYou: targetToViewer?.status === "active",
        isCloseFriend: closeFriendSet.has(targetId),
        isMuted: !!muteEntry,
        muteStories: muteEntry?.muteStories ?? false,
        mutePosts: muteEntry?.mutePosts ?? false,
        isRestricted: restrictSet.has(targetId),
      };
    });
  },
});
