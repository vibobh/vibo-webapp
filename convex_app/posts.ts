import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import {
  assertUserCanMutate,
  canViewerSeeTargetUserProfile,
  getEffectiveAccountStatus,
  viewerCannotAccessAppContent,
} from "./accountModeration";
import { rankPostsUnified } from "./feedRanking";
import { buildPublicMediaUrl } from "./mediaUrl";
import {
  MODERATION_DISTRIBUTION_CHECK_REQUIRED_AFTER_MS,
  moderationStatusBadge,
  moderationUnavailableForViewer,
  normalizeModerationStatus,
  normalizeModerationVisibility,
  postExcludedFromBroadDiscovery,
  postHiddenFromNonOwner,
  postShouldOmitFromAllSurfaces,
  postVisibleInFollowingSlice,
  profileGridModerationForPost
} from "./postModeration";
import { userHiddenFromPublicDiscovery } from "./staffVisibility";
import {
  type VerificationTier,
  verificationTierPayload,
} from "./verificationTier";
import {
  loadViewerFeedExclusions,
  postAuthorExcludedForViewerFeed,
  usersBlockedEitherWay,
  viewerPostContentHidden,
} from "./viewerContentFilters";
import {
  appendOutboundChatMessage,
  getOrCreateDirectConversationId,
} from "./messages";

async function inactiveAuthorIdSet(
  ctx: {
    db: {
      get: (id: Id<"users">) => Promise<Doc<"users"> | null>;
    };
  },
  userIds: Id<"users">[],
): Promise<Set<string>> {
  const uniqStr = [...new Set(userIds.map((x) => String(x)))];
  const docs = await Promise.all(
    uniqStr.map((s) => ctx.db.get(s as Id<"users">)),
  );
  const inactive = new Set<string>();
  for (let i = 0; i < uniqStr.length; i++) {
    if (getEffectiveAccountStatus(docs[i]) !== "active") {
      inactive.add(uniqStr[i]);
    }
  }
  return inactive;
}

function feedAuthorPublicFields(
  author: Doc<"users">,
  profilePictureUrl: string | null | undefined,
  profilePictureKey: string | null | undefined,
  extra?: Record<string, unknown>,
) {
  return {
    _id: author._id,
    username: author.username,
    fullName: author.fullName,
    profilePictureUrl: profilePictureUrl ?? undefined,
    profilePictureKey: profilePictureKey ?? undefined,
    ...extra,
    ...(author.verificationPending === true
      ? { verificationPending: true as const }
      : {}),
    ...verificationTierPayload(author),
  };
}

/** Inactive or staff/moderator — omit from public feeds / discovery surfaces. */
async function feedExcludedAuthorIds(
  ctx: {
    db: {
      get: (id: Id<"users">) => Promise<Doc<"users"> | null>;
    };
  },
  userIds: Id<"users">[],
): Promise<Set<string>> {
  const excluded = await inactiveAuthorIdSet(ctx, userIds);
  const uniqStr = [...new Set(userIds.map((x) => String(x)))];
  const docs = await Promise.all(
    uniqStr.map((s) => ctx.db.get(s as Id<"users">)),
  );
  for (let i = 0; i < uniqStr.length; i++) {
    if (userHiddenFromPublicDiscovery(docs[i])) {
      excluded.add(uniqStr[i]);
    }
  }
  return excluded;
}

// ============================================
// TYPES
// ============================================

export type PostVisibility =
  | "public"
  | "followers_only"
  | "close_friends"
  | "private";
export type PostDownloadType = "everyone" | "followers" | "only_me";
export type PostStatus =
  | "draft"
  | "uploading"
  | "processing"
  | "published"
  | "failed"
  | "deleted";
export type MediaType = "image" | "video";
export type MediaProcessingStatus =
  | "pending"
  | "uploading"
  | "processing"
  | "completed"
  | "failed";

export interface PostMediaInput {
  type: MediaType;
  position: number;
  displayUrl: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  durationMs?: number;
  hasAudioTrack?: boolean;
  cropData?: {
    x: number;
    y: number;
    width: number;
    height: number;
    scale: number;
    aspectRatio: string;
  };
  filterApplied?: string;
}

export interface PostTagInput {
  taggedUserId: Id<"users">;
  mediaId?: Id<"postMedia">;
  x?: number;
  y?: number;
}

// ============================================
// HELPERS
// ============================================

/** Parse hashtags and mentions from caption */
function parseCaptionContent(caption: string): {
  hashtags: string[];
  mentions: string[];
} {
  const hashtags: string[] = [];
  const mentions: string[] = [];

  // Parse hashtags (#hashtag)
  const hashtagRegex = /#(\w+)/g;
  let match;
  while ((match = hashtagRegex.exec(caption)) !== null) {
    hashtags.push(match[1].toLowerCase());
  }

  // Parse mentions (@username)
  const mentionRegex = /@(\w+)/g;
  while ((match = mentionRegex.exec(caption)) !== null) {
    mentions.push(match[1].toLowerCase());
  }

  return { hashtags, mentions };
}

function viewerPostVoteFromLike(
  like: Doc<"likes"> | null | undefined,
): "none" | "up" | "down" {
  if (!like || like.targetType !== "post") return "none";
  return like.reaction === "down" ? "down" : "up";
}

/** Feed preview is text-only; GIPHY rows have nothing useful to show under the post. */
function commentEligibleForFeedInlinePreview(c: Doc<"comments">): boolean {
  return c.gifAttachment == null;
}

/** Stacked avatars + “Liked by…” on the feed (batch-loaded per page). */
async function loadFeedEngagementPreviewsForPosts(
  ctx: { db: any },
  posts: Doc<"posts">[],
  viewerId: Id<"users"> | null,
  resolveProfilePic: (user: Doc<"users"> | null | undefined) => {
    url: string | null;
    key: string | null;
  },
): Promise<
  {
    likerPreview: Array<{
      _id: Id<"users">;
      username: string;
      profilePictureUrl: string | null;
      profilePictureKey: string | null;
    }>;
    commentPreviews: Array<{
      _id: Id<"comments">;
      text: string;
      likeCount: number;
      author: {
        _id: Id<"users">;
        username: string;
        verificationTier?: VerificationTier;
      };
    }>;
  }[]
> {
  return Promise.all(
    posts.map(async (post) => {
      const likeTotal = post.likeCount ?? 0;
      const isOwner = viewerId != null && post.userId === viewerId;
      const likesVisibleToViewer = isOwner || (post.likesVisible ?? true);

      let likerPreview: {
        _id: Id<"users">;
        username: string;
        profilePictureUrl: string | null;
        profilePictureKey: string | null;
      }[] = [];

      if (likeTotal > 0 && likesVisibleToViewer) {
        const rawLikes = await ctx.db
          .query("likes")
          .withIndex("by_target", (q: any) =>
            q.eq("targetType", "post").eq("targetId", String(post._id)),
          )
          .order("desc")
          .take(16);
        const upOnly = rawLikes.filter(
          (l: Doc<"likes">) => l.reaction !== "down",
        );
        const slice = upOnly.slice(0, 3);
        const userDocs = await Promise.all(
          slice.map((l: Doc<"likes">) => ctx.db.get(l.userId)),
        );
        likerPreview = userDocs
          .filter((u): u is Doc<"users"> => u != null)
          .map((u) => {
            const pic = resolveProfilePic(u);
            return {
              _id: u._id,
              username: u.username || "user",
              profilePictureUrl: pic.url,
              profilePictureKey: pic.key,
            };
          });
      }

      const commentPreviews: Array<{
        _id: Id<"comments">;
        text: string;
        likeCount: number;
        author: { _id: Id<"users">; username: string };
      }> = [];

      const commentTotal = post.commentCount ?? 0;
      const commentsOn = post.commentsEnabled ?? true;
      // Feed inline preview: at most one comment, only if the viewer follows the commenter.
      if (commentTotal > 0 && commentsOn && viewerId != null) {
        const rows = await ctx.db
          .query("comments")
          .withIndex("by_post_parent", (q: any) =>
            q.eq("postId", post._id).eq("parentCommentId", undefined),
          )
          .filter((q: any) => q.neq(q.field("isDeleted"), true))
          .order("desc")
          .take(30);
        const commentRows = rows as Doc<"comments">[];
        const authorIds: Id<"users">[] = commentRows.map(
          (c) => c.authorId as Id<"users">,
        );
        const uniqueAuthors = [...new Set(authorIds)].filter(
          (aid) => aid !== viewerId,
        );
        const followPairs = await Promise.all(
          uniqueAuthors.map(async (followingId) => {
            const f = await ctx.db
              .query("follows")
              .withIndex("by_follower_following", (q: any) =>
                q.eq("followerId", viewerId).eq("followingId", followingId),
              )
              .first();
            return [String(followingId), f?.status === "active"] as const;
          }),
        );
        const viewerFollows = new Map<string, boolean>(followPairs);
        let chosen: Doc<"comments"> | null = null;
        for (const c of commentRows) {
          if (viewerFollows.get(String(c.authorId)) !== true) continue;
          if (!commentEligibleForFeedInlinePreview(c)) continue;
          chosen = c;
          break;
        }
        if (chosen) {
          const author = await ctx.db.get(chosen.authorId);
          if (author) {
            commentPreviews.push({
              _id: chosen._id,
              text: chosen.text,
              likeCount: chosen.likeCount ?? 0,
              author: {
                _id: author._id,
                username: author.username || "user",
                ...(author.verificationPending === true
                  ? { verificationPending: true as const }
                  : {}),
                ...verificationTierPayload(author),
              },
            });
          }
        }
      }

      return { likerPreview, commentPreviews };
    }),
  );
}

/** Check if user can view a post based on visibility and relationships */
async function canViewPost(
  ctx: any,
  post: Doc<"posts">,
  viewerId: Id<"users"> | null,
): Promise<boolean> {
  // Deleted posts are not viewable
  if (post.status === "deleted") return false;

  const isOwner = viewerId !== null && post.userId === viewerId;

  // Moderation: hidden / removed from non-owners; author can still open published quarantine rows
  if (!isOwner && postShouldOmitFromAllSurfaces(post)) return false;
  if (isOwner) {
    const ms = normalizeModerationStatus(post.moderationStatus);
    if (ms === "removed" || ms === "deleted") return false;
  }
  if (postHiddenFromNonOwner(post, viewerId)) return false;

  // Draft/uploading posts only visible to owner
  if (post.status === "draft" || post.status === "uploading") {
    return isOwner;
  }

  // Published: owner sees unless moderation already blocked above
  if (isOwner) return true;

  if (viewerId && (await usersBlockedEitherWay(ctx, viewerId, post.userId))) {
    return false;
  }

  // Check visibility settings
  switch (post.visibility) {
    case "public":
      return true;

    case "followers_only":
    case "private":
      if (!viewerId) return false;
      // Check if viewer follows the author
      const follow = await ctx.db
        .query("follows")
        .withIndex("by_follower_following", (q: any) =>
          q.eq("followerId", viewerId).eq("followingId", post.userId),
        )
        .first();
      return follow?.status === "active";

    case "close_friends":
      if (!viewerId) return false;
      // Check if viewer is in close friends list
      const closeFriend = await ctx.db
        .query("closeFriends")
        .withIndex("by_user_friend", (q: any) =>
          q.eq("userId", post.userId).eq("friendId", viewerId),
        )
        .first();
      return !!closeFriend;

    default:
      return false;
  }
}

/** Check if user follows another user */
async function isFollowing(
  ctx: any,
  followerId: Id<"users">,
  followingId: Id<"users">,
): Promise<boolean> {
  const follow = await ctx.db
    .query("follows")
    .withIndex("by_follower_following", (q: any) =>
      q.eq("followerId", followerId).eq("followingId", followingId),
    )
    .first();
  return follow?.status === "active";
}

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a new post draft
 * This is the entry point for post creation
 */
export const createPost = mutation({
  args: {
    userId: v.id("users"),
    caption: v.optional(v.string()),
    locationName: v.optional(v.string()),
    locationId: v.optional(v.string()),
    locationLat: v.optional(v.number()),
    locationLng: v.optional(v.number()),
    musicTitle: v.optional(v.string()),
    visibility: v.optional(
      v.union(
        v.literal("public"),
        v.literal("followers_only"),
        v.literal("close_friends"),
        v.literal("private"),
      ),
    ),
    commentsEnabled: v.optional(v.boolean()),
    likesVisible: v.optional(v.boolean()),
    dislikesVisible: v.optional(v.boolean()),
    isDownloadEnabled: v.optional(v.boolean()),
    downloadType: v.optional(
      v.union(
        v.literal("everyone"),
        v.literal("followers"),
        v.literal("only_me"),
      ),
    ),
  },
  returns: v.id("posts"),
  handler: async (ctx, args): Promise<Id<"posts">> => {
    const { userId } = args;
    if (!userId) throw new Error("Unauthorized");

    await assertUserCanMutate(ctx, userId);

    const { hashtags, mentions } = args.caption
      ? parseCaptionContent(args.caption)
      : { hashtags: [], mentions: [] };

    const now = Date.now();

    const visibility = args.visibility ?? "public";
    const defaultDownloadEnabled = visibility === "public";
    const defaultDownloadType: PostDownloadType =
      visibility === "public" ? "everyone" : "only_me";

    const musicTrimmed = args.musicTitle?.trim();
    const postId = await ctx.db.insert("posts", {
      userId,
      caption: args.caption,
      locationName: args.locationName,
      locationId: args.locationId,
      locationLat: args.locationLat,
      locationLng: args.locationLng,
      ...(musicTrimmed ? { musicTitle: musicTrimmed } : {}),
      visibility,
      commentsEnabled: args.commentsEnabled ?? true,
      likesVisible: args.likesVisible ?? true,
      dislikesVisible: args.dislikesVisible ?? true,
      isDownloadEnabled: args.isDownloadEnabled ?? defaultDownloadEnabled,
      downloadType: args.downloadType ?? defaultDownloadType,
      likeCount: 0,
      dislikeCount: 0,
      commentCount: 0,
      viewsCount: 0,
      sharesCount: 0,
      mediaCount: 0,
      hashtags,
      mentions,
      status: "draft",
      moderationStatus: "pending",
      moderationVisibilityStatus: "public",
      createdAt: now,
      updatedAt: now,
    });

    return postId;
  },
});

/**
 * After media is attached: invite one user to co-publish. Sends a DM with Accept / Decline.
 * Post stays draft until they accept (`acceptPostCollaboration` publishes).
 */
export const invitePostCollaborator = mutation({
  args: {
    userId: v.id("users"),
    postId: v.id("posts"),
    inviteeUserId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const { userId, postId, inviteeUserId } = args;
    if (!userId) throw new Error("Unauthorized");
    await assertUserCanMutate(ctx, userId);
    if (String(userId) === String(inviteeUserId)) {
      throw new Error("Cannot invite yourself");
    }

    const post = await ctx.db.get(postId);
    if (!post) throw new Error("Post not found");
    if (post.userId !== userId) throw new Error("Unauthorized");
    if (post.status !== "draft" && post.status !== "uploading") {
      throw new Error("Only drafts can receive a collaboration invite");
    }

    await ctx.db.patch(postId, {
      collaborationInviteeId: inviteeUserId,
      collaborationStatus: "pending",
      updatedAt: Date.now(),
    });

    const conversationId = await getOrCreateDirectConversationId(
      ctx,
      userId,
      inviteeUserId,
    );
    const inviter = await ctx.db.get(userId);
    const handle = inviter?.username ?? "someone";
    await appendOutboundChatMessage(ctx, {
      viewerId: userId,
      conversationId,
      type: "collab_invite",
      text: `@${handle} invited you to collaborate on a post`,
      postId,
    });

    return null;
  },
});

/** Invitee accepts — post is published (same side-effects as `publishPost`). */
export const acceptPostCollaboration = mutation({
  args: {
    userId: v.id("users"),
    postId: v.id("posts"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const { userId, postId } = args;
    await assertUserCanMutate(ctx, userId);

    const post = await ctx.db.get(postId);
    if (!post) throw new Error("Post not found");
    if (post.collaborationInviteeId !== userId) {
      throw new Error("Not authorized to accept this invite");
    }
    if (post.collaborationStatus !== "pending") {
      throw new Error("No pending collaboration for this post");
    }

    const now = Date.now();
    await ctx.db.patch(postId, {
      collaborationStatus: "accepted",
      status: "published",
      moderationStatus: "pending",
      moderationVisibilityStatus: "public",
      ...(post.createdAt >= MODERATION_DISTRIBUTION_CHECK_REQUIRED_AFTER_MS
        ? { moderationChecked: false }
        : {}),
      publishedAt: now,
      updatedAt: now,
    });

    const authorId = post.userId;
    const tags = await ctx.db
      .query("postTags")
      .withIndex("by_post", (q) => q.eq("postId", postId))
      .collect();

    for (const tag of tags) {
      await ctx.scheduler.runAfter(
        0,
        internal.notifications.internalCreateTagNotification,
        {
          postId,
          taggedUserId: tag.taggedUserId,
          taggerId: authorId,
        },
      );
    }

    if (post.mentions && post.mentions.length > 0) {
      for (const username of post.mentions) {
        await ctx.scheduler.runAfter(
          0,
          internal.notifications.internalCreateMentionNotification,
          {
            postId,
            username,
            mentionerId: authorId,
          },
        );
      }
    }

    await ctx.scheduler.runAfter(
      0,
      internal.contentModeration.moderatePublishedPost,
      { postId, trigger: "publish" as const },
    );

    return null;
  },
});

/** Invitee declines — draft is removed from grids. */
export const declinePostCollaboration = mutation({
  args: {
    userId: v.id("users"),
    postId: v.id("posts"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const { userId, postId } = args;
    await assertUserCanMutate(ctx, userId);

    const post = await ctx.db.get(postId);
    if (!post) throw new Error("Post not found");
    if (post.collaborationInviteeId !== userId) {
      throw new Error("Not authorized to decline this invite");
    }
    if (post.collaborationStatus !== "pending") {
      throw new Error("No pending collaboration for this post");
    }

    const now = Date.now();
    await ctx.db.patch(postId, {
      collaborationStatus: "declined",
      status: "deleted",
      deletedAt: now,
      updatedAt: now,
    });

    return null;
  },
});

/** Viewer hides a single post from all feeds (server-side; not author moderation). */
export const hidePostForViewer = mutation({
  args: {
    userId: v.id("users"),
    postId: v.id("posts"),
  },
  returns: v.null(),
  handler: async (ctx, { userId, postId }): Promise<null> => {
    await assertUserCanMutate(ctx, userId);
    const post = await ctx.db.get(postId);
    if (!post) throw new Error("Post not found");
    if (String(post.userId) === String(userId)) {
      throw new Error("Use post settings to manage your own post");
    }

    const dup = await ctx.db
      .query("hiddenPosts")
      .withIndex("by_user_post", (q) =>
        q.eq("userId", userId).eq("postId", postId),
      )
      .unique();
    if (dup) return null;

    await ctx.db.insert("hiddenPosts", {
      userId,
      postId,
      createdAt: Date.now(),
    });
    return null;
  },
});

export const unhidePostForViewer = mutation({
  args: {
    userId: v.id("users"),
    postId: v.id("posts"),
  },
  returns: v.null(),
  handler: async (ctx, { userId, postId }): Promise<null> => {
    await assertUserCanMutate(ctx, userId);
    const row = await ctx.db
      .query("hiddenPosts")
      .withIndex("by_user_post", (q) =>
        q.eq("userId", userId).eq("postId", postId),
      )
      .unique();
    if (row) await ctx.db.delete(row._id);
    return null;
  },
});

/**
 * Add media to a post
 */
export const addPostMedia = mutation({
  args: {
    userId: v.id("users"),
    postId: v.id("posts"),
    media: v.array(
      v.object({
        type: v.union(v.literal("image"), v.literal("video")),
        position: v.number(),
        displayUrl: v.string(),
        displayStorageRegion: v.optional(v.string()),
        thumbnailUrl: v.optional(v.string()),
        thumbnailStorageRegion: v.optional(v.string()),
        width: v.optional(v.number()),
        height: v.optional(v.number()),
        durationMs: v.optional(v.number()),
        hasAudioTrack: v.optional(v.boolean()),
        cropData: v.optional(
          v.object({
            x: v.number(),
            y: v.number(),
            width: v.number(),
            height: v.number(),
            scale: v.number(),
            aspectRatio: v.string(),
          }),
        ),
        filterApplied: v.optional(v.string()),
      }),
    ),
  },
  returns: v.array(v.id("postMedia")),
  handler: async (ctx, args): Promise<Id<"postMedia">[]> => {
    const { userId } = args;
    if (!userId) throw new Error("Unauthorized");
    await assertUserCanMutate(ctx, userId);

    // Verify post exists and belongs to user
    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error("Post not found");
    if (post.userId !== userId) throw new Error("Unauthorized");
    if (post.status !== "draft" && post.status !== "uploading") {
      throw new Error("Cannot add media to published post");
    }

    const now = Date.now();
    const mediaIds: Id<"postMedia">[] = [];

    for (const item of args.media) {
      const isCdnUrl = item.displayUrl.startsWith("https://");
      const mediaId = await ctx.db.insert("postMedia", {
        postId: args.postId,
        type: item.type,
        position: item.position,
        displayUrl: item.displayUrl,
        ...(item.displayStorageRegion?.trim()
          ? { displayStorageRegion: item.displayStorageRegion.trim() }
          : {}),
        thumbnailUrl: item.thumbnailUrl,
        ...(item.thumbnailStorageRegion?.trim()
          ? { thumbnailStorageRegion: item.thumbnailStorageRegion.trim() }
          : {}),
        width: item.width,
        height: item.height,
        durationMs: item.durationMs,
        hasAudioTrack: item.hasAudioTrack,
        processingStatus: isCdnUrl ? "completed" : "pending",
        processedAt: isCdnUrl ? now : undefined,
        cropData: item.cropData,
        filterApplied: item.filterApplied,
        createdAt: now,
      });
      mediaIds.push(mediaId);
    }

    // Update post media count
    const existingMedia = await ctx.db
      .query("postMedia")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();

    await ctx.db.patch(args.postId, {
      mediaCount: existingMedia.length,
      updatedAt: now,
    });

    return mediaIds;
  },
});

/**
 * Tag users on a post
 */
export const addPostTags = mutation({
  args: {
    userId: v.id("users"),
    postId: v.id("posts"),
    tags: v.array(
      v.object({
        taggedUserId: v.id("users"),
        mediaId: v.optional(v.id("postMedia")),
        x: v.optional(v.number()),
        y: v.optional(v.number()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const { userId } = args;
    if (!userId) throw new Error("Unauthorized");
    await assertUserCanMutate(ctx, userId);

    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error("Post not found");
    if (post.userId !== userId) throw new Error("Unauthorized");

    const now = Date.now();
    const newlyTaggedUserIds: Id<"users">[] = [];

    for (const tag of args.tags) {
      const existing = await ctx.db
        .query("postTags")
        .withIndex("by_post", (q) => q.eq("postId", args.postId))
        .filter((q) => q.eq(q.field("taggedUserId"), tag.taggedUserId))
        .first();

      if (!existing) {
        await ctx.db.insert("postTags", {
          postId: args.postId,
          mediaId: tag.mediaId,
          taggedUserId: tag.taggedUserId,
          x: tag.x,
          y: tag.y,
          createdAt: now,
        });
        newlyTaggedUserIds.push(tag.taggedUserId);
      }
    }

    if (post.status === "published" && newlyTaggedUserIds.length > 0) {
      for (const taggedUserId of newlyTaggedUserIds) {
        await ctx.scheduler.runAfter(
          0,
          internal.notifications.internalCreateTagNotification,
          {
            postId: args.postId,
            taggedUserId,
            taggerId: userId,
          },
        );
      }
    }

    return null;
  },
});

/**
 * Remove a tag from a post
 */
export const removePostTag = mutation({
  args: {
    userId: v.id("users"),
    postId: v.id("posts"),
    taggedUserId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const { userId } = args;
    if (!userId) throw new Error("Unauthorized");
    await assertUserCanMutate(ctx, userId);

    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error("Post not found");
    if (post.userId !== userId) throw new Error("Unauthorized");

    const tag = await ctx.db
      .query("postTags")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .filter((q) => q.eq(q.field("taggedUserId"), args.taggedUserId))
      .first();

    if (tag) {
      await ctx.db.delete(tag._id);
    }

    return null;
  },
});

/**
 * Update post details (caption, location, visibility, etc.)
 */
export const updatePost = mutation({
  args: {
    userId: v.id("users"),
    postId: v.id("posts"),
    caption: v.optional(v.string()),
    locationName: v.optional(v.string()),
    locationId: v.optional(v.string()),
    locationLat: v.optional(v.number()),
    locationLng: v.optional(v.number()),
    musicTitle: v.optional(v.string()),
    visibility: v.optional(
      v.union(
        v.literal("public"),
        v.literal("followers_only"),
        v.literal("close_friends"),
        v.literal("private"),
      ),
    ),
    commentsEnabled: v.optional(v.boolean()),
    likesVisible: v.optional(v.boolean()),
    dislikesVisible: v.optional(v.boolean()),
    isDownloadEnabled: v.optional(v.boolean()),
    downloadType: v.optional(
      v.union(
        v.literal("everyone"),
        v.literal("followers"),
        v.literal("only_me"),
      ),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const { userId } = args;
    if (!userId) throw new Error("Unauthorized");
    await assertUserCanMutate(ctx, userId);

    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error("Post not found");
    if (post.userId !== userId) throw new Error("Unauthorized");
    if (post.status === "deleted")
      throw new Error("Cannot update deleted post");

    const updateData: Partial<Doc<"posts">> = {
      updatedAt: Date.now(),
    };

    if (args.caption !== undefined) {
      updateData.caption = args.caption;
      const { hashtags, mentions } = parseCaptionContent(args.caption);
      updateData.hashtags = hashtags;
      updateData.mentions = mentions;
    }

    if (args.locationName !== undefined)
      updateData.locationName = args.locationName;
    if (args.locationId !== undefined) updateData.locationId = args.locationId;
    if (args.locationLat !== undefined)
      updateData.locationLat = args.locationLat;
    if (args.locationLng !== undefined)
      updateData.locationLng = args.locationLng;
    if (args.musicTitle !== undefined) {
      const mt = args.musicTitle.trim();
      updateData.musicTitle = mt.length > 0 ? mt : undefined;
    }
    if (args.visibility !== undefined) updateData.visibility = args.visibility;
    if (args.commentsEnabled !== undefined)
      updateData.commentsEnabled = args.commentsEnabled;
    if (args.likesVisible !== undefined)
      updateData.likesVisible = args.likesVisible;
    if (args.dislikesVisible !== undefined)
      updateData.dislikesVisible = args.dislikesVisible;
    if (args.isDownloadEnabled !== undefined)
      updateData.isDownloadEnabled = args.isDownloadEnabled;
    if (args.downloadType !== undefined)
      updateData.downloadType = args.downloadType;

    await ctx.db.patch(args.postId, updateData);

    return null;
  },
});

export const getPostDownloadEligibility = query({
  args: {
    postId: v.id("posts"),
    viewerUserId: v.optional(v.id("users")),
  },
  returns: v.object({
    allowed: v.boolean(),
    reason: v.string(),
    isDownloadEnabled: v.boolean(),
    downloadType: v.union(
      v.literal("everyone"),
      v.literal("followers"),
      v.literal("only_me"),
    ),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    allowed: boolean;
    reason: string;
    isDownloadEnabled: boolean;
    downloadType: "everyone" | "followers" | "only_me";
  }> => {
    const post = await ctx.db.get(args.postId);
    if (!post || post.status !== "published") {
      return {
        allowed: false,
        reason: "post_unavailable",
        isDownloadEnabled: false,
        downloadType: "only_me",
      };
    }

    const visibility = post.visibility;
    const isDownloadEnabled = post.isDownloadEnabled ?? visibility === "public";
    const rawDownloadType = (post as { downloadType?: unknown }).downloadType;
    const downloadType: PostDownloadType =
      rawDownloadType === "everyone" ||
      rawDownloadType === "followers" ||
      rawDownloadType === "only_me"
        ? rawDownloadType
        : visibility === "public"
          ? "everyone"
          : "only_me";
    const viewerId = args.viewerUserId ?? null;
    if (!viewerId) {
      return {
        allowed: false,
        reason: "auth_required",
        isDownloadEnabled,
        downloadType,
      };
    }
    if (!isDownloadEnabled) {
      return {
        allowed: false,
        reason: "creator_disabled",
        isDownloadEnabled,
        downloadType,
      };
    }
    if (!(await canViewPost(ctx, post, viewerId))) {
      return {
        allowed: false,
        reason: "not_allowed_to_view",
        isDownloadEnabled,
        downloadType,
      };
    }
    if (
      downloadType === "only_me" &&
      String(post.userId) !== String(viewerId)
    ) {
      return {
        allowed: false,
        reason: "creator_only",
        isDownloadEnabled,
        downloadType,
      };
    }
    if (
      downloadType === "followers" &&
      String(post.userId) !== String(viewerId) &&
      !(await isFollowing(ctx, viewerId, post.userId))
    ) {
      return {
        allowed: false,
        reason: "followers_only",
        isDownloadEnabled,
        downloadType,
      };
    }

    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const recentAllowedAttempts = (
      await ctx.db
        .query("downloadEvents")
        .withIndex("by_user_created", (q) => q.eq("userId", viewerId))
        .order("desc")
        .take(40)
    ).filter((row) => row.createdAt >= oneHourAgo && row.decision === "allow");

    if (recentAllowedAttempts.length >= 20) {
      return {
        allowed: false,
        reason: "rate_limited",
        isDownloadEnabled,
        downloadType,
      };
    }

    return {
      allowed: true,
      reason: "ok",
      isDownloadEnabled,
      downloadType,
    };
  },
});

export const logPostDownloadAttempt = mutation({
  args: {
    userId: v.id("users"),
    postId: v.id("posts"),
    decision: v.union(v.literal("allow"), v.literal("deny")),
    reason: v.string(),
    ipHash: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertUserCanMutate(ctx, args.userId);
    await ctx.db.insert("downloadEvents", {
      userId: args.userId,
      postId: args.postId,
      decision: args.decision,
      reason: args.reason,
      ipHash: args.ipHash,
      createdAt: Date.now(),
    });
    return null;
  },
});

export const requestPostDownload = mutation({
  args: {
    userId: v.id("users"),
    postId: v.id("posts"),
  },
  returns: v.object({
    status: v.union(
      v.literal("ready"),
      v.literal("queued"),
      v.literal("processing"),
      v.literal("failed"),
    ),
    jobId: v.optional(v.id("postDownloadJobs")),
    downloadUrl: v.optional(v.string()),
    mediaType: v.union(v.literal("image"), v.literal("video")),
    reason: v.string(),
  }),
  handler: async (ctx, args) => {
    await assertUserCanMutate(ctx, args.userId);
    const post = await ctx.db.get(args.postId);
    if (!post || post.status !== "published") {
      await ctx.db.insert("downloadEvents", {
        userId: args.userId,
        postId: args.postId,
        decision: "deny",
        reason: "post_unavailable",
        createdAt: Date.now(),
      });
      return {
        status: "failed" as const,
        mediaType: "image" as const,
        reason: "post_unavailable",
      };
    }

    const visibility = post.visibility;
    const isDownloadEnabled = post.isDownloadEnabled ?? visibility === "public";
    const rawDownloadType = (post as { downloadType?: unknown }).downloadType;
    const downloadType: PostDownloadType =
      rawDownloadType === "everyone" ||
      rawDownloadType === "followers" ||
      rawDownloadType === "only_me"
        ? rawDownloadType
        : visibility === "public"
          ? "everyone"
          : "only_me";

    if (!isDownloadEnabled) {
      await ctx.db.insert("downloadEvents", {
        userId: args.userId,
        postId: args.postId,
        decision: "deny",
        reason: "creator_disabled",
        createdAt: Date.now(),
      });
      return {
        status: "failed" as const,
        mediaType: "image" as const,
        reason: "creator_disabled",
      };
    }
    if (!(await canViewPost(ctx, post, args.userId))) {
      await ctx.db.insert("downloadEvents", {
        userId: args.userId,
        postId: args.postId,
        decision: "deny",
        reason: "not_allowed_to_view",
        createdAt: Date.now(),
      });
      return {
        status: "failed" as const,
        mediaType: "image" as const,
        reason: "not_allowed_to_view",
      };
    }
    if (
      downloadType === "only_me" &&
      String(post.userId) !== String(args.userId)
    ) {
      await ctx.db.insert("downloadEvents", {
        userId: args.userId,
        postId: args.postId,
        decision: "deny",
        reason: "creator_only",
        createdAt: Date.now(),
      });
      return {
        status: "failed" as const,
        mediaType: "image" as const,
        reason: "creator_only",
      };
    }
    if (
      downloadType === "followers" &&
      String(post.userId) !== String(args.userId) &&
      !(await isFollowing(ctx, args.userId, post.userId))
    ) {
      await ctx.db.insert("downloadEvents", {
        userId: args.userId,
        postId: args.postId,
        decision: "deny",
        reason: "followers_only",
        createdAt: Date.now(),
      });
      return {
        status: "failed" as const,
        mediaType: "image" as const,
        reason: "followers_only",
      };
    }

    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const recentAllowedAttempts = (
      await ctx.db
        .query("downloadEvents")
        .withIndex("by_user_created", (q) => q.eq("userId", args.userId))
        .order("desc")
        .take(40)
    ).filter((row) => row.createdAt >= oneHourAgo && row.decision === "allow");
    if (recentAllowedAttempts.length >= 20) {
      await ctx.db.insert("downloadEvents", {
        userId: args.userId,
        postId: args.postId,
        decision: "deny",
        reason: "rate_limited",
        createdAt: Date.now(),
      });
      return {
        status: "failed" as const,
        mediaType: "image" as const,
        reason: "rate_limited",
      };
    }

    const media = await ctx.db
      .query("postMedia")
      .withIndex("by_post_position", (q) => q.eq("postId", args.postId))
      .collect();
    const primaryMedia = media[0];
    if (!primaryMedia?.displayUrl) {
      await ctx.db.insert("downloadEvents", {
        userId: args.userId,
        postId: args.postId,
        decision: "deny",
        reason: "media_unavailable",
        createdAt: Date.now(),
      });
      return {
        status: "failed" as const,
        mediaType: "image" as const,
        reason: "media_unavailable",
      };
    }

    const now = Date.now();
    const mediaType = primaryMedia.type;

    // Phase 3 foundation: normalize downloads through a job row even when instantly ready.
    const jobId = await ctx.db.insert("postDownloadJobs", {
      userId: args.userId,
      postId: args.postId,
      mediaType,
      status: "ready",
      outputUrl: primaryMedia.displayUrl,
      watermarkVersion: "v1",
      createdAt: now,
      updatedAt: now,
      expiresAt: now + 10 * 60 * 1000,
    });

    await ctx.db.insert("downloadEvents", {
      userId: args.userId,
      postId: args.postId,
      decision: "allow",
      reason: mediaType === "video" ? "video_job_ready" : "image_job_ready",
      createdAt: now,
    });

    return {
      status: "ready" as const,
      jobId,
      downloadUrl: primaryMedia.displayUrl,
      mediaType,
      reason: "ok",
    };
  },
});

export const getPostDownloadJobStatus = query({
  args: {
    userId: v.id("users"),
    jobId: v.id("postDownloadJobs"),
  },
  returns: v.object({
    status: v.union(
      v.literal("queued"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("failed"),
    ),
    downloadUrl: v.optional(v.string()),
    mediaType: v.union(v.literal("image"), v.literal("video")),
    reason: v.string(),
  }),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || String(job.userId) !== String(args.userId)) {
      return {
        status: "failed" as const,
        mediaType: "image" as const,
        reason: "job_not_found",
      };
    }
    if (job.expiresAt && job.expiresAt < Date.now()) {
      return {
        status: "failed" as const,
        mediaType: job.mediaType,
        reason: "job_expired",
      };
    }
    return {
      status: job.status,
      downloadUrl: job.outputUrl,
      mediaType: job.mediaType,
      reason: job.error ?? "ok",
    };
  },
});

export const getPostDownloadCount = query({
  args: {
    postId: v.id("posts"),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post || post.status !== "published") return 0;
    return post.downloadCount ?? 0;
  },
});

export const recordPostDownloadCompleted = mutation({
  args: {
    userId: v.id("users"),
    postId: v.id("posts"),
  },
  returns: v.object({
    downloadCount: v.number(),
  }),
  handler: async (ctx, args) => {
    await assertUserCanMutate(ctx, args.userId);
    const post = await ctx.db.get(args.postId);
    if (!post || post.status !== "published") {
      throw new Error("Post not available");
    }
    if (!(await canViewPost(ctx, post, args.userId))) {
      throw new Error("Not allowed");
    }

    const nextDownloadCount = (post.downloadCount ?? 0) + 1;
    await ctx.db.patch(args.postId, {
      downloadCount: nextDownloadCount,
      updatedAt: Date.now(),
    });

    await ctx.db.insert("downloadEvents", {
      userId: args.userId,
      postId: args.postId,
      decision: "allow",
      reason: "saved_to_device",
      createdAt: Date.now(),
    });

    return { downloadCount: nextDownloadCount };
  },
});

/**
 * Toggle post likes visibility (Hide/Unhide like count)
 */
export const togglePostLikesVisibility = mutation({
  args: {
    userId: v.id("users"),
    postId: v.id("posts"),
  },
  returns: v.object({
    likesVisible: v.boolean(),
  }),
  handler: async (ctx, args): Promise<{ likesVisible: boolean }> => {
    const { userId } = args;
    if (!userId) throw new Error("Unauthorized");
    await assertUserCanMutate(ctx, userId);

    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error("Post not found");
    if (post.userId !== userId) throw new Error("Unauthorized");

    const currentValue = post.likesVisible ?? true;
    const newValue = !currentValue;

    await ctx.db.patch(args.postId, {
      likesVisible: newValue,
      updatedAt: Date.now(),
    });

    return { likesVisible: newValue };
  },
});

/**
 * Toggle post dislikes visibility (Hide/Unhide dislike count)
 */
export const togglePostDislikesVisibility = mutation({
  args: {
    userId: v.id("users"),
    postId: v.id("posts"),
  },
  returns: v.object({
    dislikesVisible: v.boolean(),
  }),
  handler: async (ctx, args): Promise<{ dislikesVisible: boolean }> => {
    const { userId } = args;
    if (!userId) throw new Error("Unauthorized");
    await assertUserCanMutate(ctx, userId);

    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error("Post not found");
    if (post.userId !== userId) throw new Error("Unauthorized");

    const currentValue = post.dislikesVisible ?? true;
    const newValue = !currentValue;

    await ctx.db.patch(args.postId, {
      dislikesVisible: newValue,
      updatedAt: Date.now(),
    });

    return { dislikesVisible: newValue };
  },
});

/**
 * Toggle post comments (Enable/Disable commenting)
 */
export const togglePostComments = mutation({
  args: {
    userId: v.id("users"),
    postId: v.id("posts"),
  },
  returns: v.object({
    commentsEnabled: v.boolean(),
  }),
  handler: async (ctx, args): Promise<{ commentsEnabled: boolean }> => {
    const { userId } = args;
    if (!userId) throw new Error("Unauthorized");
    await assertUserCanMutate(ctx, userId);

    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error("Post not found");
    if (post.userId !== userId) throw new Error("Unauthorized");

    const currentValue = post.commentsEnabled ?? true;
    const newValue = !currentValue;

    await ctx.db.patch(args.postId, {
      commentsEnabled: newValue,
      updatedAt: Date.now(),
    });

    return { commentsEnabled: newValue };
  },
});

/**
 * Publish a post (transition from draft/uploading to published)
 */
export const publishPost = mutation({
  args: {
    userId: v.id("users"),
    postId: v.id("posts"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const { userId } = args;
    if (!userId) throw new Error("Unauthorized");
    await assertUserCanMutate(ctx, userId);

    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error("Post not found");
    if (post.userId !== userId) throw new Error("Unauthorized");
    if (post.collaborationStatus === "pending") {
      throw new Error(
        "This post is waiting for a collaborator to accept in messages",
      );
    }

    const now = Date.now();

    await ctx.db.patch(args.postId, {
      status: "published",
      moderationStatus: "pending",
      moderationVisibilityStatus: "public",
      ...(post.createdAt >= MODERATION_DISTRIBUTION_CHECK_REQUIRED_AFTER_MS
        ? { moderationChecked: false }
        : {}),
      publishedAt: now,
      updatedAt: now,
    });

    // Schedule notification for tagged users
    const tags = await ctx.db
      .query("postTags")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();

    for (const tag of tags) {
      await ctx.scheduler.runAfter(
        0,
        internal.notifications.internalCreateTagNotification,
        {
          postId: args.postId,
          taggedUserId: tag.taggedUserId,
          taggerId: userId,
        },
      );
    }

    if (post.mentions && post.mentions.length > 0) {
      for (const username of post.mentions) {
        await ctx.scheduler.runAfter(
          0,
          internal.notifications.internalCreateMentionNotification,
          {
            postId: args.postId,
            username,
            mentionerId: userId,
          },
        );
      }
    }

    // Schedule async AI content moderation (does not block publish)
    await ctx.scheduler.runAfter(
      0,
      internal.contentModeration.moderatePublishedPost,
      { postId: args.postId, trigger: "publish" as const },
    );

    return null;
  },
});

/**
 * Update post status (for internal use)
 */
export const updatePostStatus = internalMutation({
  args: {
    postId: v.id("posts"),
    status: v.union(
      v.literal("draft"),
      v.literal("uploading"),
      v.literal("processing"),
      v.literal("published"),
      v.literal("failed"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await ctx.db.patch(args.postId, {
      status: args.status,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Soft delete a post
 */
export const deletePost = mutation({
  args: {
    postId: v.id("posts"),
    userId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await assertUserCanMutate(ctx, args.userId);
    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error("Post not found");
    if (post.userId !== args.userId) throw new Error("Unauthorized");

    const now = Date.now();

    await ctx.db.patch(args.postId, {
      status: "deleted",
      deletedAt: now,
      updatedAt: now,
    });

    return null;
  },
});

/**
 * Permanently delete a post (internal use for cleanup)
 */
export const permanentlyDeletePost = internalMutation({
  args: {
    postId: v.id("posts"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    // Delete all related data
    const media = await ctx.db
      .query("postMedia")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();

    for (const item of media) {
      await ctx.db.delete(item._id);
    }

    const tags = await ctx.db
      .query("postTags")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();

    for (const tag of tags) {
      await ctx.db.delete(tag._id);
    }

    const comments = await ctx.db
      .query("comments")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();

    for (const comment of comments) {
      await ctx.db.delete(comment._id);
    }

    const likes = await ctx.db
      .query("likes")
      .withIndex("by_target", (q) =>
        q.eq("targetType", "post").eq("targetId", args.postId),
      )
      .collect();

    for (const like of likes) {
      await ctx.db.delete(like._id);
    }

    await ctx.db.delete(args.postId);

    return null;
  },
});

// ============================================
// QUERIES
// ============================================

/**
 * Get a single post by ID with full details
 */
export const getPost = query({
  args: {
    postId: v.id("posts"),
    viewerUserId: v.optional(v.id("users")),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const userId =
      args.viewerUserId ?? ((ctx as any).userId as Id<"users"> | undefined);
    if (userId) {
      const vu = await ctx.db.get(userId);
      if (viewerCannotAccessAppContent(vu)) return undefined;
    }
    const post = await ctx.db.get(args.postId);

    if (!post) return undefined;

    const moderationUnavailable = moderationUnavailableForViewer(
      post,
      userId ?? null,
    );

    // Owner exception: if the moderated post belongs to the viewer, we
    // surface the post + media + reason so the author can see *what* was
    // hidden and *why* — without ever exposing it to anyone else (the
    // post stays hidden from public surfaces).
    const isOwner = userId != null && post.userId === userId;
    const moderationOwnerView = moderationUnavailable && isOwner;
    const hideMediaForViewer = moderationUnavailable && !moderationOwnerView;

    const moderationStatusNorm = normalizeModerationStatus(post.moderationStatus);
    const moderationVisibilityNorm = normalizeModerationVisibility(
      post.moderationVisibilityStatus,
    );
    const moderationBadge = moderationStatusBadge(
      moderationStatusNorm,
      moderationVisibilityNorm,
    );

    // Check visibility permissions
    const canView = await canViewPost(ctx, post, userId ?? null);

    // Get author info
    const author = await ctx.db.get(post.userId);
    const viewerDoc = userId ? await ctx.db.get(userId) : null;
    if (
      author &&
      !canViewerSeeTargetUserProfile(author, userId ?? null, viewerDoc)
    ) {
      return undefined;
    }

    // Get media
    const media = hideMediaForViewer
      ? []
      : await ctx.db
          .query("postMedia")
          .withIndex("by_post_position", (q) => q.eq("postId", args.postId))
          .collect();

    // Get tags with user info
    const tags = hideMediaForViewer
      ? []
      : await ctx.db
          .query("postTags")
          .withIndex("by_post", (q) => q.eq("postId", args.postId))
          .collect();

    const tagsWithUsers = await Promise.all(
      tags.map(async (tag) => {
        const taggedUser = await ctx.db.get(tag.taggedUserId);
        return {
          ...tag,
          taggedUser: taggedUser
            ? {
                _id: taggedUser._id,
                username: taggedUser.username,
                fullName: taggedUser.fullName,
                profilePictureUrl: taggedUser.profilePictureUrl,
              }
            : null,
        };
      }),
    );

    let isLiked = false;
    let isDisliked = false;
    if (userId) {
      const like = await ctx.db
        .query("likes")
        .withIndex("by_user_target", (q) =>
          q
            .eq("userId", userId)
            .eq("targetType", "post")
            .eq("targetId", args.postId),
        )
        .first();
      const v = viewerPostVoteFromLike(like ?? null);
      isLiked = v === "up";
      isDisliked = v === "down";
    }

    // Check if saved by current user
    let isSaved = false;
    if (userId) {
      const saved = await ctx.db
        .query("savedPosts")
        .withIndex("by_user_post", (q) =>
          q.eq("userId", userId).eq("postId", args.postId),
        )
        .first();
      isSaved = !!saved;
    }

    let isReposted = false;
    if (userId) {
      const repost = await ctx.db
        .query("reposts")
        .withIndex("by_user_post", (q) =>
          q.eq("userId", userId).eq("postId", args.postId),
        )
        .first();
      isReposted = !!repost;
    }

    return {
      post: {
        ...post,
        caption: hideMediaForViewer ? undefined : post.caption,
        author: author
          ? feedAuthorPublicFields(
              author,
              author.profilePictureUrl,
              author.profilePictureKey,
              { isPrivate: author.isPrivate },
            )
          : null,
        // Surface moderation context to the UI. Note: when the viewer is
        // not the owner, `moderationReason` is intentionally NOT leaked —
        // we still want non-owners to see only the generic "unavailable"
        // copy so they can't reverse-engineer what got someone removed.
        moderationReason: moderationOwnerView ? post.moderationReason : undefined,
        moderationStatusNormalized: moderationStatusNorm,
        moderationVisibilityNormalized: moderationVisibilityNorm,
        moderationBadgeLabel: moderationOwnerView ? moderationBadge.label : undefined,
        moderationBadgeTone: moderationOwnerView ? moderationBadge.tone : undefined,
      },
      media,
      tags: tagsWithUsers,
      isLiked,
      isDisliked,
      isSaved,
      isReposted,
      canView,
      // Existing flag — true when the post is hidden from this viewer with
      // NO content surfaced. Owners see their own moderated posts so this
      // remains false for them; the new `moderationOwnerView` carries the
      // owner-only "yes you can see your own removed post" signal.
      moderationUnavailable: hideMediaForViewer,
      moderationOwnerView,
    };
  },
});

/**
 * Get posts by a user (profile grid)
 */
export const getUserPosts = query({
  args: {
    userId: v.id("users"),
    viewerUserId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  returns: v.object({
    posts: v.array(v.any()),
    nextCursor: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const currentUserId =
      args.viewerUserId ?? ((ctx as any).userId as Id<"users"> | undefined);
    if (currentUserId) {
      const vu = await ctx.db.get(currentUserId);
      if (viewerCannotAccessAppContent(vu)) {
        return { posts: [] };
      }
    }
    const targetUser = await ctx.db.get(args.userId);

    if (!targetUser) {
      return { posts: [] };
    }

    const viewerDoc = currentUserId ? await ctx.db.get(currentUserId) : null;
    if (
      !canViewerSeeTargetUserProfile(
        targetUser,
        currentUserId ?? null,
        viewerDoc,
      )
    ) {
      return { posts: [], nextCursor: undefined };
    }

    // Check if we can view this user's posts
    let canViewAll = false;
    if (currentUserId === args.userId) {
      canViewAll = true;
    } else if (!targetUser.isPrivate) {
      canViewAll = true;
    } else if (currentUserId) {
      canViewAll = await isFollowing(ctx, currentUserId, args.userId);
    }

    if (!canViewAll) {
      return { posts: [] };
    }

    const feedEx = currentUserId
      ? await loadViewerFeedExclusions(ctx, currentUserId)
      : null;

    const limit = args.limit ?? 12;
    const cursor = args.cursor;

    let query = ctx.db
      .query("posts")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", args.userId).eq("status", "published"),
      );

    if (cursor) {
      query = query.filter((q) => q.lt(q.field("createdAt"), cursor));
    }

    const posts = await query.order("desc").take(limit + 1);

    let nextCursor: number | undefined;
    if (posts.length > limit) {
      nextCursor = posts[limit - 1].createdAt;
      posts.pop();
    }

    const visible: typeof posts = [];
    for (const post of posts) {
      const mode = profileGridModerationForPost(
        post,
        args.userId,
        currentUserId ?? null,
      );
      if (mode === "omit") continue;
      visible.push(post);
    }

    // Get first media thumbnail for each post.
    //
    // Author-on-own-profile gets real thumbnails for their moderated posts so
    // they can recognize *which* post is hidden, plus a friendly status
    // badge. Non-owners (or the rare "unavailable to owner" case) still get
    // the placeholder.
    const postsWithThumbnails = await Promise.all(
      visible.map(async (post) => {
        const mode = profileGridModerationForPost(
          post,
          args.userId,
          currentUserId ?? null,
        );
        const msNorm = normalizeModerationStatus(post.moderationStatus);
        const mvNorm = normalizeModerationVisibility(post.moderationVisibilityStatus);
        const badge = moderationStatusBadge(msNorm, mvNorm);
        const isOwnerViewing =
          currentUserId != null && currentUserId === post.userId;

        if (mode === "unavailable" && !isOwnerViewing) {
          return {
            ...post,
            moderationGridUnavailable: true,
            moderationOwnerVisible: false as const,
            moderationBadgeLabel: badge.label,
            moderationBadgeTone: badge.tone,
            thumbnail: null as string | null,
            mediaType: undefined as "image" | "video" | undefined,
            mediaCount: post.mediaCount,
            viewerContentHidden:
              feedEx && currentUserId
                ? viewerPostContentHidden(post, currentUserId, feedEx)
                : false,
          };
        }
        const media = await ctx.db
          .query("postMedia")
          .withIndex("by_post_position", (q) => q.eq("postId", post._id))
          .take(1);

        const isOwnerModeratedView = mode === "unavailable" && isOwnerViewing;

        return {
          ...post,
          moderationGridUnavailable: false,
          // True when the author is looking at their own moderated post —
          // the grid should overlay a status badge so they can tell at a
          // glance which posts are limited / hidden.
          moderationOwnerVisible: isOwnerModeratedView,
          moderationBadgeLabel: isOwnerModeratedView ? badge.label : undefined,
          moderationBadgeTone: isOwnerModeratedView ? badge.tone : undefined,
          thumbnail: media[0]?.thumbnailUrl || media[0]?.displayUrl,
          mediaType: media[0]?.type,
          mediaCount: post.mediaCount,
          viewerContentHidden:
            feedEx && currentUserId
              ? viewerPostContentHidden(post, currentUserId, feedEx)
              : false,
        };
      }),
    );

    return {
      posts: postsWithThumbnails,
      nextCursor,
    };
  },
});

/**
 * Published posts whose first media is video (profile "Videos" tab).
 * Same visibility rules as `getUserPosts`.
 */
export const getUserVideoPosts = query({
  args: {
    userId: v.id("users"),
    viewerUserId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  returns: v.object({
    posts: v.array(v.any()),
    nextCursor: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const currentUserId =
      args.viewerUserId ?? ((ctx as any).userId as Id<"users"> | undefined);
    if (currentUserId) {
      const vu = await ctx.db.get(currentUserId);
      if (viewerCannotAccessAppContent(vu)) {
        return { posts: [] };
      }
    }
    const targetUser = await ctx.db.get(args.userId);

    if (!targetUser) {
      return { posts: [] };
    }

    const viewerDoc = currentUserId ? await ctx.db.get(currentUserId) : null;
    if (
      !canViewerSeeTargetUserProfile(
        targetUser,
        currentUserId ?? null,
        viewerDoc,
      )
    ) {
      return { posts: [] };
    }

    let canViewAll = false;
    if (currentUserId === args.userId) {
      canViewAll = true;
    } else if (!targetUser.isPrivate) {
      canViewAll = true;
    } else if (currentUserId) {
      canViewAll = await isFollowing(ctx, currentUserId, args.userId);
    }

    if (!canViewAll) {
      return { posts: [] };
    }

    const feedEx = currentUserId
      ? await loadViewerFeedExclusions(ctx, currentUserId)
      : null;

    const limit = args.limit ?? 24;
    let batchCursor: number | undefined = args.cursor;
    const out: any[] = [];
    let safety = 0;

    while (out.length < limit && safety < 25) {
      safety += 1;
      let q = ctx.db
        .query("posts")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", args.userId).eq("status", "published"),
        );
      if (batchCursor !== undefined) {
        const beforeCreatedAt = batchCursor;
        q = q.filter((q) => q.lt(q.field("createdAt"), beforeCreatedAt));
      }

      const batch = await q.order("desc").take(48);
      if (batch.length === 0) break;

      batchCursor = batch[batch.length - 1].createdAt;

      for (const post of batch) {
        if (out.length >= limit) break;
        const mode = profileGridModerationForPost(
          post,
          args.userId,
          currentUserId ?? null,
        );
        if (mode === "omit") continue;
        const media = await ctx.db
          .query("postMedia")
          .withIndex("by_post_position", (q) => q.eq("postId", post._id))
          .take(1);
        const hidden =
          feedEx && currentUserId
            ? viewerPostContentHidden(post, currentUserId, feedEx)
            : false;
        if (mode === "unavailable") {
          out.push({
            ...post,
            moderationGridUnavailable: true,
            thumbnail: null as string | null,
            mediaType: "video" as const,
            mediaCount: post.mediaCount,
            viewerContentHidden: hidden,
          });
          continue;
        }
        if (media[0]?.type !== "video") continue;

        out.push({
          ...post,
          moderationGridUnavailable: false,
          thumbnail: media[0]?.thumbnailUrl || media[0]?.displayUrl,
          mediaType: "video" as const,
          mediaCount: post.mediaCount,
          viewerContentHidden: hidden,
        });
      }

      if (batch.length < 48) break;
    }

    const nextCursor =
      out.length >= limit ? out[out.length - 1].createdAt : undefined;

    return { posts: out, nextCursor };
  },
});

/**
 * Posts where `taggedUserId` appears in tags (profile "Tagged" tab).
 * Respects post visibility via `canViewPost`; dedupes by post.
 */
export const getPostsWhereUserIsTagged = query({
  args: {
    taggedUserId: v.id("users"),
    viewerUserId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  returns: v.object({
    posts: v.array(v.any()),
    nextCursor: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const viewerId =
      args.viewerUserId ??
      ((ctx as any).userId as Id<"users"> | undefined) ??
      null;
    const taggedUser = await ctx.db.get(args.taggedUserId);
    const viewerDoc = viewerId ? await ctx.db.get(viewerId) : null;
    if (
      !taggedUser ||
      !canViewerSeeTargetUserProfile(taggedUser, viewerId, viewerDoc)
    ) {
      return { posts: [], nextCursor: undefined };
    }

    const limit = args.limit ?? 24;
    const cursor = args.cursor;

    let q = ctx.db
      .query("postTags")
      .withIndex("by_tagged_user", (q) =>
        q.eq("taggedUserId", args.taggedUserId),
      );
    if (cursor !== undefined) {
      q = q.filter((q) => q.lt(q.field("createdAt"), cursor));
    }

    const tags = await q.order("desc").take(180);

    const seen = new Set<string>();
    const posts: any[] = [];
    let lastTagCreatedAt: number | undefined;

    for (const tag of tags) {
      if (tag.removedAt !== undefined) continue;
      const post = await ctx.db.get(tag.postId);
      if (!post || post.status !== "published") continue;
      if (seen.has(post._id)) continue;
      if (!(await canViewPost(ctx, post, viewerId))) continue;

      seen.add(post._id);
      lastTagCreatedAt = tag.createdAt;

      const media = await ctx.db
        .query("postMedia")
        .withIndex("by_post_position", (q) => q.eq("postId", post._id))
        .take(1);

      posts.push({
        ...post,
        thumbnail: media[0]?.thumbnailUrl || media[0]?.displayUrl,
        mediaType: media[0]?.type,
        mediaCount: post.mediaCount,
      });

      if (posts.length >= limit) break;
    }

    const nextCursor =
      posts.length >= limit && lastTagCreatedAt !== undefined
        ? lastTagCreatedAt
        : undefined;

    return { posts, nextCursor };
  },
});

/**
 * Profile grid → full feed: same post shape as `getFeed` (author, media, tags, isLiked, isSaved).
 */
export const getUserPostsFeed = query({
  args: {
    userId: v.id("users"),
    viewerUserId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  returns: v.object({
    posts: v.array(v.any()),
    nextCursor: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const currentUserId =
      args.viewerUserId ?? ((ctx as any).userId as Id<"users"> | undefined);
    if (currentUserId) {
      const vu = await ctx.db.get(currentUserId);
      if (viewerCannotAccessAppContent(vu)) {
        return { posts: [] };
      }
    }
    const targetUser = await ctx.db.get(args.userId);

    if (!targetUser) {
      return { posts: [] };
    }

    const viewerDoc = currentUserId ? await ctx.db.get(currentUserId) : null;
    if (
      !canViewerSeeTargetUserProfile(
        targetUser,
        currentUserId ?? null,
        viewerDoc,
      )
    ) {
      return { posts: [], nextCursor: undefined };
    }

    let canViewAll = false;
    if (currentUserId === args.userId) {
      canViewAll = true;
    } else if (!targetUser.isPrivate) {
      canViewAll = true;
    } else if (currentUserId) {
      canViewAll = await isFollowing(ctx, currentUserId, args.userId);
    }

    if (!canViewAll) {
      return { posts: [] };
    }

    const limit = Math.min(Math.max(args.limit ?? 15, 1), 40);
    const cursor = args.cursor;

    let pendingCollabPosts: Doc<"posts">[] = [];
    if (!cursor && currentUserId === args.userId) {
      const draftRows = await ctx.db
        .query("posts")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", args.userId).eq("status", "draft"),
        )
        .order("desc")
        .take(24);
      pendingCollabPosts = draftRows.filter(
        (p) => p.collaborationStatus === "pending",
      );
    }

    let q = ctx.db
      .query("posts")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", args.userId).eq("status", "published"),
      );

    if (cursor) {
      q = q.filter((q) => q.lt(q.field("createdAt"), cursor));
    }

    const rawPublished = await q.order("desc").take((limit + 1) * 4);
    const rawPosts = cursor
      ? rawPublished
      : [...pendingCollabPosts, ...rawPublished];
    const posts: Doc<"posts">[] = [];
    for (const p of rawPosts) {
      const collabPendingDraft =
        p.status === "draft" && p.collaborationStatus === "pending";
      const mode = collabPendingDraft
        ? ("show" as const)
        : profileGridModerationForPost(
            p,
            args.userId,
            currentUserId ?? null,
          );
      if (mode === "omit") continue;
      posts.push(p);
      if (posts.length >= limit + 1) break;
    }

    let nextCursor: number | undefined;
    if (posts.length > limit) {
      nextCursor = posts[limit - 1].createdAt;
      posts.pop();
    }

    if (posts.length === 0) {
      return { posts: [], nextCursor };
    }

    const viewerId = currentUserId ?? null;
    const feedEx =
      viewerId != null ? await loadViewerFeedExclusions(ctx, viewerId) : null;

    const authorIds = [...new Set(posts.map((p) => p.userId))];
    const [authorsMap, allMedia, likeRows, saveRows, repostRows] =
      await Promise.all([
        Promise.all(
          authorIds.map(async (id) => {
            const author = await ctx.db.get(id);
            return [id, author] as const;
          }),
        ).then((pairs) => new Map(pairs)),
        Promise.all(
          posts.map((post) =>
            ctx.db
              .query("postMedia")
              .withIndex("by_post_position", (q) => q.eq("postId", post._id))
              .collect(),
          ),
        ),
        viewerId
          ? Promise.all(
              posts.map((post) =>
                ctx.db
                  .query("likes")
                  .withIndex("by_user_target", (q) =>
                    q
                      .eq("userId", viewerId)
                      .eq("targetType", "post")
                      .eq("targetId", String(post._id)),
                  )
                  .unique(),
              ),
            )
          : Promise.resolve(posts.map(() => null)),
        viewerId
          ? Promise.all(
              posts.map((post) =>
                ctx.db
                  .query("savedPosts")
                  .withIndex("by_user_post", (q) =>
                    q.eq("userId", viewerId).eq("postId", post._id),
                  )
                  .unique(),
              ),
            )
          : Promise.resolve(posts.map(() => null)),
        viewerId
          ? Promise.all(
              posts.map((post) =>
                ctx.db
                  .query("reposts")
                  .withIndex("by_user_post", (q) =>
                    q.eq("userId", viewerId).eq("postId", post._id),
                  )
                  .unique(),
              ),
            )
          : Promise.resolve(posts.map(() => null)),
      ]);

    const allTags = await Promise.all(
      posts.map((post) =>
        ctx.db
          .query("postTags")
          .withIndex("by_post", (q) => q.eq("postId", post._id))
          .collect(),
      ),
    );

    const taggedUserIds = [
      ...new Set(allTags.flat().map((t) => t.taggedUserId)),
    ];
    const taggedUsersMap = await Promise.all(
      taggedUserIds.map(async (id) => {
        const user = await ctx.db.get(id);
        return [id, user] as const;
      }),
    ).then((pairs) => new Map(pairs));

    const resolveProfilePic = (
      user: Doc<"users"> | undefined | null,
    ): { url: string | null; key: string | null } => {
      if (!user) return { url: null, key: null };
      if (user.profilePictureUrl) {
        return {
          url: user.profilePictureUrl,
          key: user.profilePictureKey ?? null,
        };
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
    };

    const engagementPreviews = await loadFeedEngagementPreviewsForPosts(
      ctx,
      posts,
      viewerId,
      resolveProfilePic,
    );

    const enrichedPosts = posts.map((post, index) => {
      const author = authorsMap.get(post.userId);
      const media = allMedia[index];
      const tags = allTags[index];
      const collaborationPending =
        post.status === "draft" && post.collaborationStatus === "pending";
      const gridMode = profileGridModerationForPost(
        post,
        args.userId,
        currentUserId ?? null,
      );
      const isOwnerViewing = viewerId != null && viewerId === post.userId;
      const rawUnavailable =
        gridMode === "unavailable" ||
        moderationUnavailableForViewer(post, viewerId);
      // Owner exception: the author can see their own moderated post + the
      // pipeline's reason via the in-canvas banner. Non-owners stay blocked.
      const moderationOwnerView = rawUnavailable && isOwnerViewing;
      const moderationUnavailable = rawUnavailable && !moderationOwnerView;

      const msNorm = normalizeModerationStatus(post.moderationStatus);
      const mvNorm = normalizeModerationVisibility(post.moderationVisibilityStatus);
      const badge = moderationStatusBadge(msNorm, mvNorm);

      const authorPic = resolveProfilePic(author);

      const tagsWithUsers = tags.map((tag) => {
        const taggedUser = taggedUsersMap.get(tag.taggedUserId);
        const taggedUserPic = resolveProfilePic(taggedUser);
        return {
          ...tag,
          taggedUser: taggedUser
            ? {
                _id: taggedUser._id,
                username: taggedUser.username,
                fullName: taggedUser.fullName,
                profilePictureUrl: taggedUserPic.url,
                profilePictureKey: taggedUserPic.key,
              }
            : null,
        };
      });

      const preview = engagementPreviews[index]!;

      return {
        ...post,
        collaborationPending,
        author: author
          ? feedAuthorPublicFields(author, authorPic.url, authorPic.key)
          : null,
        // Owner-of-moderated-post keeps media; non-owner gets nothing.
        media: moderationUnavailable ? [] : media,
        tags: moderationUnavailable ? [] : tagsWithUsers,
        caption: moderationUnavailable ? undefined : post.caption,
        isLiked: viewerPostVoteFromLike(likeRows[index] ?? null) === "up",
        isDisliked: viewerPostVoteFromLike(likeRows[index] ?? null) === "down",
        isSaved: saveRows[index] != null,
        isReposted: repostRows[index] != null,
        moderationUnavailable,
        moderationOwnerView,
        moderationReason: moderationOwnerView ? post.moderationReason : undefined,
        moderationStatusNormalized: msNorm,
        moderationVisibilityNormalized: mvNorm,
        moderationBadgeLabel: moderationOwnerView ? badge.label : undefined,
        moderationBadgeTone: moderationOwnerView ? badge.tone : undefined,
        viewerContentHidden:
          feedEx && viewerId
            ? viewerPostContentHidden(post, viewerId, feedEx)
            : false,
        likerPreview: preview.likerPreview,
        commentPreviews: preview.commentPreviews,
      };
    });

    return {
      posts: enrichedPosts,
      nextCursor,
    };
  },
});

/**
 * Get feed posts for the current user - OPTIMIZED VERSION
 *
 * Performance improvements:
 * 1. Batch fetch candidate posts using by_status_created index
 * 2. Parallel authors + media + per-post like/save (indexed lookups — not full-table user likes)
 * 3. Discover fill-in only when following feed is thin
 * 4. Supports cursor pagination for small first pages + infinite scroll
 */
export const getFeed = query({
  args: {
    userId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
    ranking: v.optional(
      v.union(
        v.literal("chronological"),
        v.literal("engagement_v1"),
        v.literal("unified_v1"),
      ),
    ),
    /** Client-only: bump to re-subscribe and fetch a fresh first page (Instagram-style pull/tab refresh). */
    refreshNonce: v.optional(v.number()),
    /**
     * When false, never backfills from public “discover” when the following slice is thin —
     * used for the Following-only home tab (people you follow, chronological).
     */
    allowDiscoverFill: v.optional(v.boolean()),
  },
  returns: v.object({
    posts: v.array(v.any()),
    nextCursor: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const viewerId =
      args.userId ?? ((ctx as any).userId as Id<"users"> | undefined);
    if (!viewerId) {
      return { posts: [], nextCursor: undefined };
    }

    const viewerUser = await ctx.db.get(viewerId);
    if (viewerCannotAccessAppContent(viewerUser)) {
      return { posts: [], nextCursor: undefined };
    }

    const limit = Math.min(args.limit ?? 10, 50); // Cap max limit
    const cursor = args.cursor;
    const rankingMode = args.ranking ?? "chronological";
    const allowDiscoverFill = args.allowDiscoverFill !== false;

    // Follow graph + server-side mute/block/hide (not client-only)
    const [follows, feedEx] = await Promise.all([
      ctx.db
        .query("follows")
        .withIndex("by_follower_status", (q) =>
          q.eq("followerId", viewerId).eq("status", "active"),
        )
        .collect(),
      loadViewerFeedExclusions(ctx, viewerId),
    ]);

    const followingIds = new Set([
      viewerId,
      ...follows.map((f) => f.followingId),
    ]);

    // Fetch posts from all followed users + self in a single efficient query
    // Use a larger take to account for filtering + ranking pool
    const fetchLimit =
      rankingMode === "unified_v1"
        ? Math.min(140, Math.max(limit * 10, 56))
        : Math.max(limit * 3, 30);

    let postsQuery = ctx.db
      .query("posts")
      .withIndex("by_status_created", (q) => q.eq("status", "published"));

    if (cursor !== undefined) {
      postsQuery = postsQuery.filter((q) => q.lt(q.field("createdAt"), cursor));
    }

    // Fetch recent posts and filter in memory (more efficient than multiple queries)
    const allRecentPosts = await postsQuery.order("desc").take(fetchLimit);

    // Filter posts: from followed users (or self), mute/block (hidden posts stay — blurred in UI)
    let posts = allRecentPosts.filter((post) => {
      if (postAuthorExcludedForViewerFeed(post, viewerId, feedEx)) return false;
      if (!followingIds.has(post.userId)) return false;
      return postVisibleInFollowingSlice(post, viewerId);
    });

    // If we don't have enough posts from following, add discover posts from public accounts
    const minPostsForDiscover = Math.max(limit, 5);
    if (allowDiscoverFill && posts.length < minPostsForDiscover) {
      const existingIds = new Set(posts.map((p) => String(p._id)));
      const discoverNeeded = minPostsForDiscover - posts.length;

      for (const post of allRecentPosts) {
        if (posts.length >= minPostsForDiscover) break;
        if (existingIds.has(String(post._id))) continue;
        if (postAuthorExcludedForViewerFeed(post, viewerId, feedEx)) continue;
        if (post.visibility !== "public") continue; // Only public for discover
        if (postExcludedFromBroadDiscovery(post)) continue;
        if (!postVisibleInFollowingSlice(post, viewerId)) continue;

        posts.push(post);
      }
    }

    /**
     * Inactive / staff / hidden-from-public authors are filtered AFTER
     * hydration using the same `authorsMap` we'll need anyway — saves one
     * full pass of `ctx.db.get(userId)` per unique author on the hot path.
     * The over-fetch by 1–2 rows is negligible vs. duplicate doc reads.
     */
    // Sort / rank
    if (rankingMode === "unified_v1") {
      const { ranked } = await rankPostsUnified(ctx, {
        posts,
        viewerId,
        followingIds,
        now: Date.now(),
        feedEx,
      });
      if (ranked.length > 0) {
        posts = ranked;
      } else {
        posts.sort((a, b) => b.createdAt - a.createdAt);
      }
    } else if (rankingMode === "engagement_v1") {
      const now = Date.now();
      posts.sort((a, b) => {
        const aHours = Math.max(0, (now - a.createdAt) / (1000 * 60 * 60));
        const bHours = Math.max(0, (now - b.createdAt) / (1000 * 60 * 60));
        const aEngagement = (a.likeCount ?? 0) + (a.commentCount ?? 0) * 2;
        const bEngagement = (b.likeCount ?? 0) + (b.commentCount ?? 0) * 2;
        let aScore = aEngagement * (1 / (aHours + 2));
        let bScore = bEngagement * (1 / (bHours + 2));
        if (viewerPostContentHidden(a, viewerId, feedEx)) aScore *= 0.2;
        if (viewerPostContentHidden(b, viewerId, feedEx)) bScore *= 0.2;
        if (aScore === bScore) return b.createdAt - a.createdAt;
        return bScore - aScore;
      });
    } else {
      posts.sort((a, b) => b.createdAt - a.createdAt);
    }


    // Take limit + 1 for pagination detection
    posts = posts.slice(0, limit + 1);

    let nextCursor: number | undefined;
    if (posts.length > limit) {
      nextCursor = posts[limit - 1].createdAt;
      posts.pop();
    }

    /**
     * Phase 1: every read whose key is known up front (post id or viewer id)
     * fans out in a single `Promise.all`. `allTags` was previously awaited
     * after the rest — moved in here to overlap with the viewer-state probes
     * (likes / saves / reposts) and the per-post media collect. Tagged-user
     * lookups can't join phase 1 because their ids depend on `allTags`.
     */
    const authorIds = [...new Set(posts.map((p) => p.userId))];
    const [authorsMap, allMedia, allTags, likeRows, saveRows, repostRows] =
      await Promise.all([
        Promise.all(
          authorIds.map(async (id) => {
            const author = await ctx.db.get(id);
            return [id, author] as const;
          }),
        ).then((pairs) => new Map(pairs)),
        Promise.all(
          posts.map((post) =>
            ctx.db
              .query("postMedia")
              .withIndex("by_post_position", (q) => q.eq("postId", post._id))
              .collect(),
          ),
        ),
        Promise.all(
          posts.map((post) =>
            ctx.db
              .query("postTags")
              .withIndex("by_post", (q) => q.eq("postId", post._id))
              .collect(),
          ),
        ),
        Promise.all(
          posts.map((post) =>
            ctx.db
              .query("likes")
              .withIndex("by_user_target", (q) =>
                q
                  .eq("userId", viewerId)
                  .eq("targetType", "post")
                  .eq("targetId", String(post._id)),
              )
              .unique(),
          ),
        ),
        Promise.all(
          posts.map((post) =>
            ctx.db
              .query("savedPosts")
              .withIndex("by_user_post", (q) =>
                q.eq("userId", viewerId).eq("postId", post._id),
              )
              .unique(),
          ),
        ),
        Promise.all(
          posts.map((post) =>
            ctx.db
              .query("reposts")
              .withIndex("by_user_post", (q) =>
                q.eq("userId", viewerId).eq("postId", post._id),
              )
              .unique(),
          ),
        ),
      ]);


    // Phase 2: tagged-user docs (id set known only after `allTags` resolves).
    const taggedUserIds = [
      ...new Set(allTags.flat().map((t) => t.taggedUserId)),
    ];
    const taggedUsersMap = await Promise.all(
      taggedUserIds.map(async (id) => {
        const user = await ctx.db.get(id);
        return [id, user] as const;
      }),
    ).then((pairs) => new Map(pairs));


    /**
     * Author moderation filter (B): drop posts whose author is inactive,
     * staff, or hidden from public discovery. Uses the `authorsMap` we
     * already fetched — replaces the prior `feedExcludedAuthorIds` call
     * which independently re-read every author doc.
     */
    const excludedAuthorIdxs = new Set<number>();
    posts.forEach((p, i) => {
      const author = authorsMap.get(p.userId) ?? null;
      if (
        getEffectiveAccountStatus(author) !== "active" ||
        userHiddenFromPublicDiscovery(author)
      ) {
        excludedAuthorIdxs.add(i);
      }
    });

    // Helper to resolve profile picture URL (prefers direct URL, falls back to key-based)
    const resolveProfilePic = (
      user: Doc<"users"> | undefined | null,
    ): { url: string | null; key: string | null } => {
      if (!user) return { url: null, key: null };
      // If direct URL exists, use it
      if (user.profilePictureUrl) {
        return {
          url: user.profilePictureUrl,
          key: user.profilePictureKey ?? null,
        };
      }
      // Otherwise construct from key
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
    };

    /**
     * Engagement previews (liker avatars + inline "follower commented" line)
     * are intentionally NOT computed here. They were the single biggest cost
     * in this query (per-post `likes.take(16)` + `comments.take(30)` + an
     * O(commenters) follow-edge probe per post → ~50–150 extra indexed reads
     * on the hot path for a 10-row page) and reactively re-fired on every
     * like/comment to any of the 10 posts. The client now subscribes to
     * `getFeedEngagementPreviews` after first paint and merges the result
     * into each post by id (Instagram-style pop-in). Field shape is preserved
     * (empty arrays) so `FeedPost` reads them transparently — no UI fallback
     * branch needed.
     */
    const enrichedPosts = posts
      .map((post, index) => {
        if (excludedAuthorIdxs.has(index)) return null;
        const author = authorsMap.get(post.userId);
        const media = allMedia[index];
        const tags = allTags[index];

        const authorPic = resolveProfilePic(author);

        const tagsWithUsers = tags.map((tag) => {
          const taggedUser = taggedUsersMap.get(tag.taggedUserId);
          const taggedUserPic = resolveProfilePic(taggedUser);
          return {
            ...tag,
            taggedUser: taggedUser
              ? {
                  _id: taggedUser._id,
                  username: taggedUser.username,
                  fullName: taggedUser.fullName,
                  profilePictureUrl: taggedUserPic.url,
                  profilePictureKey: taggedUserPic.key,
                }
              : null,
          };
        });

        return {
          ...post,
          author: author
            ? feedAuthorPublicFields(author, authorPic.url, authorPic.key)
            : null,
          media,
          tags: tagsWithUsers,
          isLiked: viewerPostVoteFromLike(likeRows[index] ?? null) === "up",
          isDisliked:
            viewerPostVoteFromLike(likeRows[index] ?? null) === "down",
          isSaved: saveRows[index] != null,
          isReposted: repostRows[index] != null,
          moderationUnavailable: false,
          viewerContentHidden: viewerPostContentHidden(post, viewerId, feedEx),
          likerPreview: [] as Array<{
            _id: Id<"users">;
            username: string;
            profilePictureUrl: string | null;
            profilePictureKey: string | null;
          }>,
          commentPreviews: [] as Array<{
            _id: Id<"comments">;
            text: string;
            likeCount: number;
            author: { _id: Id<"users">; username: string };
          }>,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p != null);

    return {
      posts: enrichedPosts,
      nextCursor,
    };
  },
});

/**
 * Engagement previews (liker avatars + at most one inline "follower commented"
 * line) for a batch of post ids — split out of `getFeed` so first-page latency
 * isn't gated on the per-post `likes.take(16)` + `comments.take(30)` + per-
 * commenter follow-edge probes that this requires.
 *
 * Client subscribes to this *after* `getFeed` rows have painted, so the avatars
 * + inline comment line pop in ~150–300ms after the post (Instagram-style).
 * Reactivity is also cheaper: a like/comment on any post in the page only
 * re-runs *this* query, not the full `getFeed` hydration.
 *
 * Capped at 24 ids per call so the payload stays bounded; the home feed first
 * page is 10. Pass `[]` to short-circuit.
 */
export const getFeedEngagementPreviews = query({
  args: {
    postIds: v.array(v.id("posts")),
    viewerId: v.optional(v.id("users")),
  },
  returns: v.array(
    v.object({
      postId: v.id("posts"),
      likerPreview: v.array(
        v.object({
          _id: v.id("users"),
          username: v.string(),
          profilePictureUrl: v.union(v.string(), v.null()),
          profilePictureKey: v.union(v.string(), v.null()),
        }),
      ),
      commentPreviews: v.array(v.any()),
    }),
  ),
  handler: async (ctx, args) => {
    if (args.postIds.length === 0) return [];
    const viewerId = args.viewerId ?? null;
    const ids = args.postIds.slice(0, 24);

    const posts = (await Promise.all(ids.map((id) => ctx.db.get(id)))).filter(
      (p): p is Doc<"posts"> => p != null,
    );
    if (posts.length === 0) return [];

    const resolveProfilePic = (
      user: Doc<"users"> | undefined | null,
    ): { url: string | null; key: string | null } => {
      if (!user) return { url: null, key: null };
      if (user.profilePictureUrl) {
        return {
          url: user.profilePictureUrl,
          key: user.profilePictureKey ?? null,
        };
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
    };

    const previews = await loadFeedEngagementPreviewsForPosts(
      ctx,
      posts,
      viewerId,
      resolveProfilePic,
    );

    return posts.map((p, i) => ({
      postId: p._id,
      likerPreview: previews[i]!.likerPreview,
      commentPreviews: previews[i]!.commentPreviews,
    }));
  },
});

/**
 * Get saved posts for current user
 */
export const getSavedPosts = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
    /** Prefer passing from client; `ctx.userId` is not wired in this app. */
    viewerUserId: v.optional(v.id("users")),
  },
  returns: v.object({
    posts: v.array(v.any()),
    nextCursor: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const userId =
      args.viewerUserId ?? ((ctx as any).userId as Id<"users"> | undefined);
    if (!userId) {
      return { posts: [] };
    }

    const vu = await ctx.db.get(userId);
    if (viewerCannotAccessAppContent(vu)) {
      return { posts: [] };
    }

    const feedEx = await loadViewerFeedExclusions(ctx, userId);

    const limit = args.limit ?? 12;

    let query = ctx.db
      .query("savedPosts")
      .withIndex("by_user", (q) => q.eq("userId", userId));

    const cursor = args.cursor;
    if (cursor !== undefined) {
      query = query.filter((q) => q.lt(q.field("createdAt"), cursor));
    }

    const saved = await query.order("desc").take(limit + 1);

    let nextCursor: number | undefined;
    if (saved.length > limit) {
      nextCursor = saved[limit - 1].createdAt;
      saved.pop();
    }

    // Get full post data
    const postsWithData = await Promise.all(
      saved.map(async (save) => {
        const post = await ctx.db.get(save.postId);
        if (!post || post.status !== "published") return null;

        const author = await ctx.db.get(post.userId);
        const modUnavailable = moderationUnavailableForViewer(post, userId);
        const media = modUnavailable
          ? []
          : await ctx.db
              .query("postMedia")
              .withIndex("by_post_position", (q) => q.eq("postId", post._id))
              .take(1);

        return {
          ...post,
          caption: modUnavailable ? undefined : post.caption,
          savedAt: save.createdAt,
          author: author
            ? feedAuthorPublicFields(
                author,
                author.profilePictureUrl,
                author.profilePictureKey ?? null,
              )
            : null,
          thumbnail: modUnavailable
            ? null
            : media[0]?.thumbnailUrl || media[0]?.displayUrl,
          mediaType: modUnavailable ? undefined : media[0]?.type,
          moderationUnavailable: modUnavailable,
          viewerContentHidden: viewerPostContentHidden(post, userId, feedEx),
        };
      }),
    );

    return {
      posts: postsWithData.filter(
        (p): p is NonNullable<typeof p> => p !== null,
      ),
      nextCursor,
    };
  },
});

/**
 * Search posts by hashtag
 */
export const searchByHashtag = query({
  args: {
    hashtag: v.string(),
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
    viewerUserId: v.optional(v.id("users")),
  },
  returns: v.object({
    posts: v.array(v.any()),
    nextCursor: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const userId =
      args.viewerUserId ?? ((ctx as any).userId as Id<"users"> | undefined);
    if (userId) {
      const vu = await ctx.db.get(userId);
      if (viewerCannotAccessAppContent(vu)) {
        return { posts: [], nextCursor: undefined };
      }
    }
    const normalizedTag = args.hashtag.toLowerCase().replace(/^#/, "");
    const limit = args.limit ?? 12;

    const feedEx = userId ? await loadViewerFeedExclusions(ctx, userId) : null;

    // Get all public posts with this hashtag
    let query = ctx.db
      .query("posts")
      .withIndex("by_visibility_created", (q) => q.eq("visibility", "public"))
      .filter((q) => q.eq(q.field("status"), "published"));

    const cursor = args.cursor;
    if (cursor !== undefined) {
      query = query.filter((q) => q.lt(q.field("createdAt"), cursor));
    }

    const allPosts = await query.order("desc").collect();

    // Filter by hashtag + broad-discovery moderation (no restricted / shadow / removed)
    const filtered = allPosts.filter((post) => {
      if (!post.hashtags?.includes(normalizedTag)) return false;
      if (postExcludedFromBroadDiscovery(post)) return false;
      if (
        userId &&
        feedEx &&
        postAuthorExcludedForViewerFeed(post, userId, feedEx)
      ) {
        return false;
      }
      return true;
    });

    const excludedAuthors = await feedExcludedAuthorIds(
      ctx,
      filtered.map((p) => p.userId),
    );
    const filteredActive = filtered.filter(
      (p) => !excludedAuthors.has(String(p.userId)),
    );

    const posts = filteredActive.slice(0, limit + 1);

    let nextCursor: number | undefined;
    if (posts.length > limit) {
      nextCursor = posts[limit - 1].createdAt;
      posts.pop();
    }

    // Enrich posts
    const enrichedPosts = await Promise.all(
      posts.map(async (post) => {
        const [author, media, like, saved] = await Promise.all([
          ctx.db.get(post.userId),
          ctx.db
            .query("postMedia")
            .withIndex("by_post_position", (q) => q.eq("postId", post._id))
            .take(1),
          userId
            ? ctx.db
                .query("likes")
                .withIndex("by_user_target", (q) =>
                  q
                    .eq("userId", userId)
                    .eq("targetType", "post")
                    .eq("targetId", post._id),
                )
                .first()
            : null,
          userId
            ? ctx.db
                .query("savedPosts")
                .withIndex("by_user_post", (q) =>
                  q.eq("userId", userId).eq("postId", post._id),
                )
                .first()
            : null,
        ]);

        return {
          ...post,
          author: author
            ? feedAuthorPublicFields(
                author,
                author.profilePictureUrl,
                author.profilePictureKey ?? null,
              )
            : null,
          thumbnail: media[0]?.thumbnailUrl || media[0]?.displayUrl,
          mediaType: media[0]?.type,
          isLiked: viewerPostVoteFromLike(like ?? null) === "up",
          isDisliked: viewerPostVoteFromLike(like ?? null) === "down",
          isSaved: !!saved,
          viewerContentHidden:
            userId && feedEx
              ? viewerPostContentHidden(post, userId, feedEx)
              : false,
        };
      }),
    );

    return {
      posts: enrichedPosts,
      nextCursor,
    };
  },
});

/**
 * Get post upload status
 */
export const getPostUploadStatus = query({
  args: {
    postId: v.id("posts"),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const userId = (ctx as any).userId as Id<"users"> | undefined;
    if (!userId) return undefined;

    const post = await ctx.db.get(args.postId);
    if (!post || post.userId !== userId) return undefined;

    const media = await ctx.db
      .query("postMedia")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();

    return {
      status: post.status,
      media: media.map((m) => ({
        id: m._id,
        processingStatus: m.processingStatus,
      })),
    };
  },
});

// ============================================
// INTERNALS
// ============================================

/**
 * Update media processing status
 */
export const updateMediaStatus = internalMutation({
  args: {
    mediaId: v.id("postMedia"),
    status: v.union(
      v.literal("pending"),
      v.literal("uploading"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    displayUrl: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const update: Partial<Doc<"postMedia">> = {
      processingStatus: args.status,
    };

    if (args.displayUrl) update.displayUrl = args.displayUrl;
    if (args.thumbnailUrl) update.thumbnailUrl = args.thumbnailUrl;
    if (args.width) update.width = args.width;
    if (args.height) update.height = args.height;

    if (args.status === "completed") {
      update.processedAt = Date.now();
    }

    await ctx.db.patch(args.mediaId, update);
    return null;
  },
});

/**
 * Update post metrics (like count, comment count)
 */
export const updatePostMetrics = internalMutation({
  args: {
    postId: v.id("posts"),
    likeCount: v.optional(v.number()),
    dislikeCount: v.optional(v.number()),
    commentCount: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const update: Partial<Doc<"posts">> = {};
    if (args.likeCount !== undefined) update.likeCount = args.likeCount;
    if (args.dislikeCount !== undefined)
      update.dislikeCount = args.dislikeCount;
    if (args.commentCount !== undefined)
      update.commentCount = args.commentCount;

    await ctx.db.patch(args.postId, update);
    return null;
  },
});

/**
 * Check and auto-publish post when all media is ready
 */
export const checkAndPublishPost = internalMutation({
  args: {
    postId: v.id("posts"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const post = await ctx.db.get(args.postId);
    if (!post) return null;
    if (post.status !== "processing") return null;

    // Check if all media is processed
    const media = await ctx.db
      .query("postMedia")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();

    const allCompleted = media.every((m) => m.processingStatus === "completed");
    const anyFailed = media.some((m) => m.processingStatus === "failed");

    if (allCompleted) {
      await ctx.db.patch(args.postId, {
        status: "published",
        moderationStatus: "pending",
        moderationVisibilityStatus: "public",
        ...(post.createdAt >= MODERATION_DISTRIBUTION_CHECK_REQUIRED_AFTER_MS
          ? { moderationChecked: false }
          : {}),
        publishedAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.scheduler.runAfter(0, internal.contentModeration.moderatePublishedPost, {
        postId: args.postId,
        trigger: "publish",
      });
    } else if (anyFailed) {
      await ctx.db.patch(args.postId, {
        status: "failed",
        updatedAt: Date.now(),
      });
    }

    return null;
  },
});

/**
 * Repairs legacy rows: `published` + `moderationStatus: "pending"` + `moderationVisibility: "hidden"`
 * were invisible to followers. New publishes use `public` during pending review; run once per
 * deployment if the feed looks empty:
 * `npx convex run internal/posts/backfillPublishedPendingHiddenToPublic --arg limit=500`
 */
export const backfillPublishedPendingHiddenToPublic = internalMutation({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.object({ patched: v.number() }),
  handler: async (ctx, args) => {
    const maxPatch = Math.min(Math.max(args.limit ?? 200, 1), 500);
    const batch = await ctx.db
      .query("posts")
      .withIndex("by_status_created", (q) => q.eq("status", "published"))
      .order("desc")
      .take(1000);

    let patched = 0;
    for (const p of batch) {
      if (patched >= maxPatch) break;
      if (p.moderationVisibilityStatus !== "hidden") continue;
      if (p.moderationStatus !== "pending") continue;
      await ctx.db.patch(p._id, {
        moderationVisibilityStatus: "public",
        updatedAt: Date.now(),
      });
      patched += 1;
    }
    return { patched };
  },
});

/**
 * Get video-only posts for Vibes tab (TikTok/Reels style feed)
 * Returns posts that have at least one video media item
 */
export const getVideoPosts = query({
  args: {
    userId: v.optional(v.id("users")),
    /** When set, only this author's video posts (same visibility as profile Videos tab). */
    authorUserId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  returns: v.object({
    posts: v.array(v.any()),
    nextCursor: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const viewerId =
      args.userId ?? ((ctx as any).userId as Id<"users"> | undefined);

    const limit = Math.min(args.limit ?? 10, 50);
    const cursor = args.cursor;

    if (viewerId) {
      const vu = await ctx.db.get(viewerId);
      if (viewerCannotAccessAppContent(vu)) {
        return { posts: [], nextCursor: undefined };
      }
    }

    // Build list of viewable user IDs
    let viewableUserIds: Id<"users">[] = [];

    if (viewerId) {
      // Get following list
      const follows = await ctx.db
        .query("follows")
        .withIndex("by_follower_status", (q) =>
          q.eq("followerId", viewerId).eq("status", "active"),
        )
        .collect();

      viewableUserIds = [viewerId, ...follows.map((f) => f.followingId)];
    }

    const feedEx = viewerId
      ? await loadViewerFeedExclusions(ctx, viewerId)
      : null;

    let videoPosts: Doc<"posts">[] = [];

    if (args.authorUserId) {
      const authorId = args.authorUserId;
      const targetUser = await ctx.db.get(authorId);
      if (!targetUser) {
        return { posts: [], nextCursor: undefined };
      }
      if (
        userHiddenFromPublicDiscovery(targetUser) &&
        (!viewerId || String(viewerId) !== String(authorId))
      ) {
        return { posts: [], nextCursor: undefined };
      }

      const viewerDoc = viewerId ? await ctx.db.get(viewerId) : null;
      if (
        !canViewerSeeTargetUserProfile(targetUser, viewerId ?? null, viewerDoc)
      ) {
        return { posts: [], nextCursor: undefined };
      }

      let canViewAll = false;
      if (viewerId && String(viewerId) === String(authorId)) {
        canViewAll = true;
      } else if (!targetUser.isPrivate) {
        canViewAll = true;
      } else if (viewerId) {
        canViewAll = await isFollowing(ctx, viewerId, authorId);
      }

      if (!canViewAll) {
        return { posts: [], nextCursor: undefined };
      }

      if (
        viewerId &&
        feedEx &&
        feedEx.excludedPostAuthorIds.has(String(authorId))
      ) {
        return { posts: [], nextCursor: undefined };
      }

      let batchCursor: number | undefined = cursor;
      let safety = 0;
      while (videoPosts.length < limit + 1 && safety < 40) {
        safety += 1;
        let q = ctx.db
          .query("posts")
          .withIndex("by_user_status", (q) =>
            q.eq("userId", authorId).eq("status", "published"),
          );
        if (batchCursor !== undefined) {
          const beforeCreatedAt = batchCursor;
          q = q.filter((q) => q.lt(q.field("createdAt"), beforeCreatedAt));
        }
        const batch = await q.order("desc").take(48);
        if (batch.length === 0) break;
        batchCursor = batch[batch.length - 1].createdAt;

        for (const post of batch) {
          if (videoPosts.length >= limit + 1) break;
          if (
            viewerId &&
            feedEx &&
            postAuthorExcludedForViewerFeed(post, viewerId, feedEx)
          ) {
            continue;
          }
          const mode = profileGridModerationForPost(
            post,
            authorId,
            viewerId ?? null,
          );
          if (mode === "omit") continue;
          const media = await ctx.db
            .query("postMedia")
            .withIndex("by_post_position", (q) => q.eq("postId", post._id))
            .take(1);
          if (mode === "unavailable") {
            if (media.length > 0 && media[0].type === "video") {
              (post as any).firstVideoMedia = media[0];
              (post as any).moderationGridUnavailable = true;
              videoPosts.push(post);
            }
            continue;
          }
          if (media.length > 0 && media[0].type === "video") {
            (post as any).firstVideoMedia = media[0];
            (post as any).moderationGridUnavailable = false;
            videoPosts.push(post);
          }
        }
        if (batch.length < 48) break;
      }
    } else {
      // Fetch recent published posts (global Vibes feed)
      let postsQuery = ctx.db
        .query("posts")
        .withIndex("by_status_created", (q) => q.eq("status", "published"));

      if (cursor !== undefined) {
        postsQuery = postsQuery.filter((q) =>
          q.lt(q.field("createdAt"), cursor),
        );
      }

      const fetchLimit = Math.max(limit * 4, 40);
      const allRecentPosts = await postsQuery.order("desc").take(fetchLimit);

      const excludedAuthors = await feedExcludedAuthorIds(
        ctx,
        allRecentPosts.map((p) => p.userId),
      );

      for (const post of allRecentPosts) {
        if (excludedAuthors.has(String(post.userId))) {
          continue;
        }
        if (
          viewerId &&
          feedEx &&
          postAuthorExcludedForViewerFeed(post, viewerId, feedEx)
        ) {
          continue;
        }

        if (postExcludedFromBroadDiscovery(post)) {
          continue;
        }

        // Check visibility
        if (viewerId) {
          const isOwnPost = post.userId === viewerId;
          const isFollowing = viewableUserIds.some(
            (id) => String(id) === String(post.userId),
          );

          if (!isOwnPost) {
            if (
              post.visibility === "private" ||
              post.visibility === "followers_only"
            ) {
              if (!isFollowing) continue;
            } else if (post.visibility === "close_friends") {
              const closeFriend = await ctx.db
                .query("closeFriends")
                .withIndex("by_user_friend", (q) =>
                  q.eq("userId", post.userId).eq("friendId", viewerId),
                )
                .first();
              if (!closeFriend) continue;
            }
          }
        } else {
          if (post.visibility !== "public") continue;
        }

        // Check if post has video media
        const media = await ctx.db
          .query("postMedia")
          .withIndex("by_post_position", (q) => q.eq("postId", post._id))
          .take(1);

        if (media.length > 0 && media[0].type === "video") {
          (post as any).firstVideoMedia = media[0];
          videoPosts.push(post);
        }

        if (videoPosts.length >= limit + 1) break;
      }
    }

    // Slice to limit
    const posts = videoPosts.slice(0, limit + 1);

    let nextCursor: number | undefined;
    if (posts.length > limit) {
      nextCursor = posts[limit - 1].createdAt;
      posts.pop();
    }

    // Enrich posts with full data
    const enrichedPosts = await Promise.all(
      posts.map(async (post: any) => {
        const [author, allMedia, like, saved, tags, followRow, repostRow] =
          await Promise.all([
            ctx.db.get(post.userId),
            ctx.db
              .query("postMedia")
              .withIndex("by_post_position", (q) => q.eq("postId", post._id))
              .collect(),
            viewerId
              ? ctx.db
                  .query("likes")
                  .withIndex("by_user_target", (q) =>
                    q
                      .eq("userId", viewerId)
                      .eq("targetType", "post")
                      .eq("targetId", post._id),
                  )
                  .first()
              : null,
            viewerId
              ? ctx.db
                  .query("savedPosts")
                  .withIndex("by_user_post", (q) =>
                    q.eq("userId", viewerId).eq("postId", post._id),
                  )
                  .first()
              : null,
            ctx.db
              .query("postTags")
              .withIndex("by_post", (q) => q.eq("postId", post._id))
              .collect(),
            viewerId && String(post.userId) !== String(viewerId)
              ? ctx.db
                  .query("follows")
                  .withIndex("by_follower_following", (q) =>
                    q.eq("followerId", viewerId).eq("followingId", post.userId),
                  )
                  .unique()
              : Promise.resolve(null),
            viewerId
              ? ctx.db
                  .query("reposts")
                  .withIndex("by_user_post", (q) =>
                    q.eq("userId", viewerId).eq("postId", post._id),
                  )
                  .first()
              : null,
          ]);

        // Get tagged users
        const tagsWithUsers = await Promise.all(
          tags.map(async (tag) => {
            const taggedUser = await ctx.db.get(tag.taggedUserId);
            return {
              ...tag,
              taggedUser: taggedUser
                ? {
                    _id: taggedUser._id,
                    username: taggedUser.username,
                    fullName: taggedUser.fullName,
                    profilePictureUrl: taggedUser.profilePictureUrl,
                    profilePictureKey: taggedUser.profilePictureKey,
                  }
                : null,
            };
          }),
        );

        const viewerFollowState =
          !viewerId || !author
            ? "none"
            : String(post.userId) === String(viewerId)
              ? "self"
              : followRow?.status === "active"
                ? "following"
                : followRow?.status === "pending"
                  ? "pending"
                  : "none";

        // Type-safe author data extraction
        const authorData = author
          ? {
              _id: author._id,
              username: (author as any).username ?? "",
              fullName: (author as any).fullName,
              profilePictureUrl: (author as any).profilePictureUrl,
              profilePictureKey: (author as any).profilePictureKey,
              isPrivate: (author as any).isPrivate ?? false,
              viewerFollowState,
              ...verificationTierPayload(author as Doc<"users"> | null),
            }
          : null;

        const modUn = post.moderationGridUnavailable === true;

        return {
          ...post,
          author: authorData,
          media: modUn ? [] : allMedia,
          tags: modUn ? [] : tagsWithUsers,
          isLiked: viewerPostVoteFromLike(like ?? null) === "up",
          isDisliked: viewerPostVoteFromLike(like ?? null) === "down",
          isSaved: !!saved,
          isReposted: !!repostRow,
          moderationUnavailable: modUn,
          viewerContentHidden:
            viewerId && feedEx
              ? viewerPostContentHidden(post, viewerId, feedEx)
              : false,
        };
      }),
    );

    return {
      posts: enrichedPosts,
      nextCursor,
    };
  },
});

/**
 * Get a single video post by ID (for direct navigation to video)
 */
export const getVideoPost = query({
  args: {
    postId: v.id("posts"),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const userId = (ctx as any).userId as Id<"users"> | undefined;
    const post = await ctx.db.get(args.postId);

    if (!post) return undefined;

    // Check if post has video
    const media = await ctx.db
      .query("postMedia")
      .withIndex("by_post_position", (q) => q.eq("postId", args.postId))
      .collect();

    const hasVideo = media.some((m) => m.type === "video");
    if (!hasVideo) return undefined;

    // Check visibility
    const canView = await canViewPost(ctx, post, userId ?? null);
    if (!canView) return undefined;

    const author = await ctx.db.get(post.userId);
    const viewerDoc = userId ? await ctx.db.get(userId) : null;
    if (
      author &&
      !canViewerSeeTargetUserProfile(author, userId ?? null, viewerDoc)
    ) {
      return undefined;
    }

    const like = userId
      ? await ctx.db
          .query("likes")
          .withIndex("by_user_target", (q) =>
            q
              .eq("userId", userId)
              .eq("targetType", "post")
              .eq("targetId", args.postId),
          )
          .first()
      : null;

    const saved = userId
      ? await ctx.db
          .query("savedPosts")
          .withIndex("by_user_post", (q) =>
            q.eq("userId", userId).eq("postId", args.postId),
          )
          .first()
      : null;

    const repostRow = userId
      ? await ctx.db
          .query("reposts")
          .withIndex("by_user_post", (q) =>
            q.eq("userId", userId).eq("postId", args.postId),
          )
          .first()
      : null;

    const postTags = await ctx.db
      .query("postTags")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();

    const tagsWithUsers = await Promise.all(
      postTags.map(async (tag) => {
        const taggedUser = await ctx.db.get(tag.taggedUserId);
        return {
          ...tag,
          taggedUser: taggedUser
            ? {
                _id: taggedUser._id,
                username: taggedUser.username,
                fullName: taggedUser.fullName,
                profilePictureUrl: taggedUser.profilePictureUrl,
                profilePictureKey: taggedUser.profilePictureKey,
              }
            : null,
        };
      }),
    );

    const followRow =
      userId && author && String(post.userId) !== String(userId)
        ? await ctx.db
            .query("follows")
            .withIndex("by_follower_following", (q) =>
              q.eq("followerId", userId).eq("followingId", post.userId),
            )
            .unique()
        : null;

    const viewerFollowStateSingle =
      !userId || !author
        ? "none"
        : String(post.userId) === String(userId)
          ? "self"
          : followRow?.status === "active"
            ? "following"
            : followRow?.status === "pending"
              ? "pending"
              : "none";

    return {
      post: {
        ...post,
        author: author
          ? feedAuthorPublicFields(
              author,
              author.profilePictureUrl,
              author.profilePictureKey,
              {
                isPrivate: author.isPrivate,
                viewerFollowState: viewerFollowStateSingle,
              },
            )
          : null,
        tags: tagsWithUsers,
      },
      media,
      isLiked: viewerPostVoteFromLike(like ?? null) === "up",
      isDisliked: viewerPostVoteFromLike(like ?? null) === "down",
      isSaved: !!saved,
      isReposted: !!repostRow,
    };
  },
});

function locationKeyForPost(post: Doc<"posts">): string {
  const id = (post as { locationId?: string }).locationId?.trim();
  if (id) return `id:${id}`;
  const lat = (post as { locationLat?: number }).locationLat;
  const lng = (post as { locationLng?: number }).locationLng;
  if (lat != null && lng != null) {
    return `geo:${lat.toFixed(4)},${lng.toFixed(4)}`;
  }
  const name = (post as { locationName?: string }).locationName?.trim();
  if (name) return `name:${name.toLowerCase()}`;
  return "";
}

/** Posts at the same place as `locationKey` (see `lib/post-location-key.ts`). */
export const getPostsByLocationKey = query({
  args: {
    locationKey: v.string(),
    limit: v.optional(v.number()),
    viewerUserId: v.optional(v.id("users")),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 24, 48);
    const viewerId =
      args.viewerUserId ?? ((ctx as any).userId as Id<"users"> | undefined);
    const feedEx = viewerId
      ? await loadViewerFeedExclusions(ctx, viewerId)
      : null;

    const published = await ctx.db
      .query("posts")
      .withIndex("by_status_created", (q) => q.eq("status", "published"))
      .order("desc")
      .take(500);

    const locationMatched = published.filter((p) => {
      if (locationKeyForPost(p) !== args.locationKey) return false;
      if (postExcludedFromBroadDiscovery(p)) return false;
      if (
        viewerId &&
        feedEx &&
        postAuthorExcludedForViewerFeed(p, viewerId, feedEx)
      ) {
        return false;
      }
      return true;
    });
    const excludedLocAuthors = await feedExcludedAuthorIds(
      ctx,
      locationMatched.map((p) => p.userId),
    );
    const matched = locationMatched
      .filter((p) => !excludedLocAuthors.has(String(p.userId)))
      .slice(0, limit);

    const posts = await Promise.all(
      matched.map(async (post) => {
        const firstMedia = await ctx.db
          .query("postMedia")
          .withIndex("by_post_position", (q) => q.eq("postId", post._id))
          .first();
        const author = await ctx.db.get(post.userId);
        return {
          _id: post._id,
          caption: post.caption,
          locationName: post.locationName,
          thumbnailUrl: firstMedia?.thumbnailUrl ?? firstMedia?.displayUrl,
          mediaType: firstMedia?.type,
          authorUsername: author?.username ?? "",
          viewerContentHidden:
            viewerId && feedEx
              ? viewerPostContentHidden(post, viewerId, feedEx)
              : false,
        };
      }),
    );

    return { posts };
  },
});
