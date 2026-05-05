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

/**
 * User document — stored in Convex.
 * _id, email, username (optional), provider, createdAt.
 */
export default defineSchema({
  users: defineTable({
    email: v.string(),
    username: v.optional(v.string()),
    provider: v.string(), // 'google' | 'email'
    createdAt: v.number(),
    passwordHash: v.optional(v.string()),
    phone: v.optional(v.string()),
    countryCode: v.optional(v.string()),
    // Onboarding fields
    gender: v.optional(v.string()),
    fullName: v.optional(v.string()),
    dob: v.optional(v.string()),
    country: v.optional(v.string()),
    interests: v.optional(v.array(v.string())),
    profilePictureUrl: v.optional(v.string()),
    profilePictureKey: v.optional(v.string()),
    /** AWS region where the profile picture object was written (fallback upload). */
    profilePictureStorageRegion: v.optional(v.string()),
    profilePictureStorageId: v.optional(v.id("_storage")),
    /** Full-width cover image (S3 key + optional legacy URL / Convex storage). */
    bannerUrl: v.optional(v.string()),
    bannerKey: v.optional(v.string()),
    bannerStorageRegion: v.optional(v.string()),
    bannerStorageId: v.optional(v.id("_storage")),
    bio: v.optional(v.string()),
    bioLink: v.optional(v.string()),
    bioLinks: v.optional(
      v.array(
        v.object({
          id: v.string(),
          title: v.string(),
          url: v.string(),
          position: v.number(),
          createdAt: v.number(),
        }),
      ),
    ),
    preferredLang: v.optional(v.string()), // 'en' | 'ar'
    isPrivate: v.optional(v.boolean()), // Private account flag
    followerCount: v.optional(v.number()), // Cached follower count
    followingCount: v.optional(v.number()), // Cached following count
    pendingFollowRequests: v.optional(v.number()), // Cached pending request count
    /** Denormalized: other users opened this profile (product analytics). */
    profileViewsCount: v.optional(v.number()),
    /** Sum of qualified `view_post` on author’s image posts. */
    totalPostViews: v.optional(v.number()),
    /** Sum of qualified `view_video` on author’s video posts. */
    totalVideoViews: v.optional(v.number()),
    /** Set via dashboard or admin tooling — gates `moderation.*` mutations. */
    staffRole: v.optional(v.union(v.literal("admin"), v.literal("moderator"))),
    /** Account-level moderation (login / write enforcement can use this later). */
    accountModerationStatus: v.optional(
      v.union(v.literal("active"), v.literal("suspended"), v.literal("banned")),
    ),
    /** Unix ms when a suspension ends (temporary bans only). */
    suspensionEnd: v.optional(v.number()),
    /** Human-readable reason shown on the suspended screen. */
    suspensionReason: v.optional(v.string()),
    /** Human-readable reason shown on the banned screen. */
    banReason: v.optional(v.string()),
    /** Progressive strikes (warnings / auto-escalation). */
    strikeCount: v.optional(v.number()),
    /**
     * Public verification badge (at most one tier). Assigned by staff; omitted until approved.
     * `verificationPending`: under review — badge hidden everywhere.
     */
    verificationTier: v.optional(
      v.union(v.literal("blue"), v.literal("gold"), v.literal("gray")),
    ),
    verificationPending: v.optional(v.boolean()),
    /**
     * When false, suspended users cannot submit appeals (default: appeals allowed).
     */
    appealAllowedWhileSuspended: v.optional(v.boolean()),
    /** Web auth / admin (existing Next.js flows). */
    onboardingCompleted: v.optional(v.boolean()),
    isAdmin: v.optional(v.boolean()),
    role: v.optional(v.string()),
    totpEnabled: v.optional(v.boolean()),
    totpSecret: v.optional(v.string()),
    mustChangePassword: v.optional(v.boolean()),
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
  stories: defineTable({
    userId: v.id("users"),
    mediaKey: v.string(),
    /** AWS region of the story media object when uploaded to a non-primary bucket. */
    mediaStorageRegion: v.optional(v.string()),
    mediaType: v.union(v.literal("image"), v.literal("video")),
    mimeType: v.string(),
    caption: v.optional(v.string()),
    /**
     * Best-effort: false when we know the capture had no mic (e.g. camera w/o permission).
     * Omitted / true for legacy stories and gallery picks (unknown until server probe).
     */
    hasAudioTrack: v.optional(v.boolean()),
    /**
     * Author preference: viewers should start with sound off until they unmute (editor mute toggle).
     */
    defaultPlaybackMuted: v.optional(v.boolean()),
    /** Optional place line shown on story (from device reverse-geocode). */
    locationLabel: v.optional(v.string()),
    locationLat: v.optional(v.number()),
    locationLng: v.optional(v.number()),
    /** Optional shared post metadata for story preview CTA. */
    sharedPostId: v.optional(v.id("posts")),
    sharedPostCaption: v.optional(v.string()),
    sharedPostAuthorUsername: v.optional(v.string()),
    sharedPostThumbUrl: v.optional(v.string()),
    /**
     * Duration in seconds for video stories.
     * Used by viewer to set story duration to match video length.
     */
    duration: v.optional(v.number()),
    /** Denormalized for fast UI; reconciled in `toggleStoryLike`. */
    likeCount: v.optional(v.number()),
    /** Quick reaction totals; keys are ASCII ids (`joy`, `fire`, …) from `story-reactions-constants`. */
    emojiReactionCounts: v.optional(v.record(v.string(), v.number())),
    /**
     * Optional interactive poll sticker (counts are updated by `voteStoryPoll`).
     * Layout is normalized center + scale in the 9:16 story frame.
     */
    poll: v.optional(
      v.object({
        question: v.string(),
        options: v.array(
          v.object({
            id: v.string(),
            text: v.string(),
            votes: v.number(),
          }),
        ),
        totalVotes: v.number(),
        layout: v.optional(
          v.object({
            cx: v.number(),
            cy: v.number(),
            scale: v.number(),
          }),
        ),
      }),
    ),
    /**
     * Ask-me-anything style sticker: viewers submit free-text; counts + inbox on `storyQuestionResponses`.
     */
    questionSticker: v.optional(
      v.object({
        question: v.string(),
        viewerPlaceholder: v.optional(v.string()),
        responsesCount: v.number(),
        layout: v.optional(
          v.object({
            cx: v.number(),
            cy: v.number(),
            scale: v.number(),
          }),
        ),
      }),
    ),
    /**
     * Instagram-style countdown sticker (target time + theme).
     * `reminderCount` = viewers who tapped “Remind me” (Convex row in `storyCountdownReminders`).
     */
    countdownSticker: v.optional(
      v.object({
        title: v.string(),
        targetAt: v.number(),
        theme: v.string(),
        reminderCount: v.number(),
        layout: v.optional(
          v.object({
            cx: v.number(),
            cy: v.number(),
            scale: v.number(),
          }),
        ),
      }),
    ),
    /**
     * Multiple-choice quiz with one correct answer (`storyQuizAnswers` per viewer).
     * `correctOptionId` is omitted for non-owners in feed payloads (see `stories.ts` mappers).
     */
    quizSticker: v.optional(
      v.object({
        question: v.string(),
        options: v.array(
          v.object({
            id: v.string(),
            text: v.string(),
          }),
        ),
        correctOptionId: v.string(),
        totalAnswers: v.number(),
        correctAnswers: v.number(),
        layout: v.optional(
          v.object({
            cx: v.number(),
            cy: v.number(),
            scale: v.number(),
          }),
        ),
      }),
    ),
    /**
     * Instagram-style “Add yours” prompt; chain root is `storyPrompts` (`promptId`).
     */
    promptSticker: v.optional(
      v.object({
        promptId: v.id("storyPrompts"),
        text: v.string(),
        responsesCount: v.number(),
        layout: v.optional(
          v.object({
            cx: v.number(),
            cy: v.number(),
            scale: v.number(),
          }),
        ),
      }),
    ),
    /**
     * When set, the story is only visible to accounts the author added to **their**
     * Close Friends list (plus the author). Omitted = everyone who could already see this author’s stories.
     */
    audience: v.optional(v.literal("close_friends")),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_expiresAt", ["expiresAt"]),
  /** One vote per viewer per story; drives poll integrity with `stories.poll` aggregates. */
  storyPollVotes: defineTable({
    storyId: v.id("stories"),
    voterId: v.id("users"),
    optionId: v.string(),
    votedAt: v.number(),
  })
    .index("by_story_voter", ["storyId", "voterId"])
    .index("by_story", ["storyId"]),
  /** Free-text answers to a story `questionSticker` (AMA). */
  storyQuestionResponses: defineTable({
    storyId: v.id("stories"),
    storyOwnerId: v.id("users"),
    responderId: v.id("users"),
    text: v.string(),
    createdAt: v.number(),
  })
    .index("by_story_created", ["storyId", "createdAt"])
    .index("by_story_responder", ["storyId", "responderId"]),
  /** Per-viewer “remind me” for a story countdown (push delivery TBD; local scheduling on client). */
  storyCountdownReminders: defineTable({
    storyId: v.id("stories"),
    userId: v.id("users"),
    targetAt: v.number(),
    titleSnapshot: v.string(),
    createdAt: v.number(),
  })
    .index("by_story", ["storyId"])
    .index("by_story_user", ["storyId", "userId"])
    .index("by_user", ["userId", "createdAt"]),
  /** One quiz attempt per viewer per story. */
  storyQuizAnswers: defineTable({
    storyId: v.id("stories"),
    userId: v.id("users"),
    optionId: v.string(),
    isCorrect: v.boolean(),
    answeredAt: v.number(),
  })
    .index("by_story_user", ["storyId", "userId"])
    .index("by_story", ["storyId"]),
  /** Root record for an “Add yours” prompt (created when the source story is posted). */
  storyPrompts: defineTable({
    text: v.string(),
    creatorUserId: v.id("users"),
    sourceStoryId: v.id("stories"),
    responsesCount: v.number(),
    createdAt: v.number(),
  }).index("by_source_story", ["sourceStoryId"]),
  /** Links a responder’s story to a prompt (one row per user per prompt). */
  storyPromptResponses: defineTable({
    promptId: v.id("storyPrompts"),
    userId: v.id("users"),
    storyId: v.id("stories"),
    createdAt: v.number(),
  })
    .index("by_prompt_created", ["promptId", "createdAt"])
    .index("by_prompt_user", ["promptId", "userId"])
    .index("by_story", ["storyId"]),
  storyViews: defineTable({
    storyId: v.id("stories"),
    viewerId: v.id("users"),
    viewedAt: v.number(),
  })
    .index("by_story", ["storyId"])
    .index("by_story_viewer", ["storyId", "viewerId"])
    .index("by_viewer", ["viewerId", "viewedAt"]),
  /** Ephemeral-style quick emoji reactions on a story (viewer-only; real-time overlay). */
  storyEmojiReactions: defineTable({
    storyId: v.id("stories"),
    userId: v.id("users"),
    emoji: v.string(),
    createdAt: v.number(),
  })
    .index("by_story_created", ["storyId", "createdAt"])
    .index("by_story_user", ["storyId", "userId"]),
  /** @deprecated Prefer `likes` — run `internal.migrations.migrateLegacyStoryLikes` once, then remove this table. */
  storyLikes: defineTable({
    storyId: v.id("stories"),
    userId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_story", ["storyId"])
    .index("by_story_user", ["storyId", "userId"]),
  /** Unified likes (stories today; posts when feed ships). */
  likes: defineTable({
    userId: v.id("users"),
    targetType: v.union(v.literal("post"), v.literal("story")),
    targetId: v.string(),
    /** Post only: `"down"` = dislike; omit/`undefined` = up-vote (legacy rows count as up). */
    reaction: v.optional(v.union(v.literal("down"))),
    createdAt: v.number(),
  })
    .index("by_user_target", ["userId", "targetType", "targetId"])
    .index("by_target", ["targetType", "targetId", "createdAt"]),
  /**
   * Grouped in-app notifications (e.g. "user and N others liked your story").
   * Push outbox can key off the same grouping later.
   */
  notificationGroups: defineTable({
    receiverId: v.id("users"),
    type: v.union(
      v.literal("like_post"),
      v.literal("like_story"),
      v.literal("like_comment"),
      v.literal("comment_post"),
      v.literal("reply_comment"),
      v.literal("tag_post"),
      v.literal("mention_post"),
      v.literal("mention_comment"),
      v.literal("follow"),
      v.literal("follow_request"),
      v.literal("follow_request_accepted"),
      v.literal("message_new"),
      v.literal("like_count_visible"),
      v.literal("like_count_hidden"),
      v.literal("dislike_count_visible"),
      v.literal("dislike_count_hidden"),
      v.literal("comments_enabled"),
      v.literal("comments_disabled"),
    ),
    targetType: v.union(
      v.literal("post"),
      v.literal("story"),
      v.literal("user"),
      v.literal("comment"),
    ),
    targetId: v.string(),
    count: v.number(),
    latestSenderIds: v.array(v.id("users")),
    updatedAt: v.number(),
    readAt: v.optional(v.number()),
  })
    .index("by_receiver_updated", ["receiverId", "updatedAt"])
    .index("by_receiver_target", [
      "receiverId",
      "type",
      "targetType",
      "targetId",
    ]),
  userNotificationSettings: defineTable({
    userId: v.id("users"),
    // In-app notification settings
    likePostInApp: v.optional(v.boolean()),
    /** In-app activity when someone tags you in a post (independent from like notifications). */
    tagPostInApp: v.optional(v.boolean()),
    likeStoryInApp: v.optional(v.boolean()),
    followInApp: v.optional(v.boolean()),
    followRequestInApp: v.optional(v.boolean()),
    followAcceptInApp: v.optional(v.boolean()),
    messageInApp: v.optional(v.boolean()),
    // Push notification settings
    pushEnabled: v.optional(v.boolean()),
    likePostPush: v.optional(v.boolean()),
    likeStoryPush: v.optional(v.boolean()),
    followPush: v.optional(v.boolean()),
    followRequestPush: v.optional(v.boolean()),
    followAcceptPush: v.optional(v.boolean()),
    messagePush: v.optional(v.boolean()),
    // Push behavior settings
    pushSound: v.optional(v.boolean()),
    pushVibration: v.optional(v.boolean()),
    onlyFromFollowing: v.optional(v.boolean()),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),
  /** Device tokens for future Expo / FCM push — register from app. */
  pushDeviceTokens: defineTable({
    userId: v.id("users"),
    token: v.string(),
    platform: v.union(v.literal("ios"), v.literal("android"), v.literal("web")),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_token", ["token"]),
  storyReplies: defineTable({
    storyId: v.id("stories"),
    authorId: v.id("users"),
    text: v.string(),
    createdAt: v.number(),
  })
    .index("by_story", ["storyId"])
    .index("by_story_created", ["storyId", "createdAt"]),
  /** Message thread shell with denormalized preview metadata. */
  conversations: defineTable({
    type: v.union(v.literal("primary"), v.literal("general")),
    isGroup: v.boolean(),
    title: v.optional(v.string()),
    avatarKey: v.optional(v.string()),
    participants: v.array(v.id("users")),
    lastMessageId: v.optional(v.id("messages")),
    lastMessageType: v.optional(
      v.union(
        v.literal("text"),
        v.literal("image"),
        v.literal("video"),
        v.literal("voice"),
        v.literal("post_share"),
        v.literal("story_reply"),
        v.literal("gif"),
        v.literal("location"),
      ),
    ),
    lastMessagePreview: v.optional(v.string()),
    lastSenderId: v.optional(v.id("users")),
    lastMessageAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_updatedAt", ["updatedAt"])
    .index("by_lastMessageAt", ["lastMessageAt"]),
  /** Membership + unread/read state (source of truth for inbox retrieval). */
  conversationMembers: defineTable({
    conversationId: v.id("conversations"),
    userId: v.id("users"),
    role: v.union(v.literal("member"), v.literal("admin")),
    folder: v.union(v.literal("primary"), v.literal("general")),
    lastReadMessageAt: v.optional(v.number()),
    lastReadAt: v.optional(v.number()),
    unreadCount: v.number(),
    lastInteractionAt: v.number(),
    joinedAt: v.number(),
    mutedUntil: v.optional(v.number()),
    archivedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_user_updated", ["userId", "updatedAt"])
    .index("by_user_folder_updated", ["userId", "folder", "updatedAt"])
    .index("by_conversation_user", ["conversationId", "userId"])
    .index("by_conversation_joined", ["conversationId", "joinedAt"]),
  /** Conversation messages (all content types). */
  messages: defineTable({
    conversationId: v.id("conversations"),
    senderId: v.id("users"),
    type: v.union(
      v.literal("text"),
      v.literal("image"),
      v.literal("video"),
      v.literal("voice"),
      v.literal("post_share"),
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
    /** If true, recipient can open media only once. */
    viewOnce: v.optional(v.boolean()),
    /** Viewer ids that already consumed this one-time media. */
    viewedOnceBy: v.optional(v.array(v.id("users"))),
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
    status: v.union(
      v.literal("sent"),
      v.literal("failed"),
      v.literal("deleted"),
    ),
    seenBy: v.array(v.id("users")),
    createdAt: v.number(),
    clientMessageId: v.optional(v.string()),
    /** Quoted message (WhatsApp-style reply). */
    replyToMessageId: v.optional(v.id("messages")),
    replySnippet: v.optional(v.string()),
  })
    .index("by_conversation_created", ["conversationId", "createdAt"])
    .index("by_conversation_sender_created", [
      "conversationId",
      "senderId",
      "createdAt",
    ])
    .index("by_client_message_id", ["clientMessageId"]),
  /** Follow relationships with support for private account requests */
  follows: defineTable({
    followerId: v.id("users"),
    followingId: v.id("users"),
    status: v.union(v.literal("active"), v.literal("pending")),
    createdAt: v.number(),
    acceptedAt: v.optional(v.number()), // Set when pending -> active
  })
    .index("by_follower", ["followerId", "createdAt"])
    .index("by_following", ["followingId", "createdAt"])
    .index("by_follower_following", ["followerId", "followingId"])
    .index("by_following_status", ["followingId", "status", "createdAt"])
    .index("by_follower_status", ["followerId", "status", "createdAt"]),
  /** Recent searches for a user */
  recentSearches: defineTable({
    userId: v.id("users"),
    searchedUserId: v.id("users"),
    searchedAt: v.number(),
  })
    .index("by_user", ["userId", "searchedAt"])
    .index("by_user_searched", ["userId", "searchedUserId"]),
  /** Close friends (favorites) - special list for story sharing */
  closeFriends: defineTable({
    userId: v.id("users"),
    friendId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_user_friend", ["userId", "friendId"])
    .index("by_friend", ["friendId"]),
  /** Muted accounts - hide posts/stories from feed */
  mutes: defineTable({
    userId: v.id("users"),
    mutedId: v.id("users"),
    muteStories: v.optional(v.boolean()),
    mutePosts: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_user_muted", ["userId", "mutedId"]),
  /** Restricted accounts - limited interaction */
  restricts: defineTable({
    userId: v.id("users"),
    restrictedId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_user_restricted", ["userId", "restrictedId"]),

  /** User A blocked B — A does not see B; B does not see A; follows removed in `blockUser`. */
  userBlocks: defineTable({
    blockerId: v.id("users"),
    blockedId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_blocker", ["blockerId", "createdAt"])
    .index("by_blocker_blocked", ["blockerId", "blockedId"])
    .index("by_blocked", ["blockedId", "createdAt"]),

  /** Viewer chose to hide a single post from feeds (not global moderation). */
  hiddenPosts: defineTable({
    userId: v.id("users"),
    postId: v.id("posts"),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_user_post", ["userId", "postId"]),

  // ============================================
  // POSTS SYSTEM - Core posting infrastructure
  // ============================================

  /** Posts - the main post entity */
  posts: defineTable({
    userId: v.id("users"),
    caption: v.optional(v.string()),
    // Location data
    locationName: v.optional(v.string()),
    locationId: v.optional(v.string()),
    locationLat: v.optional(v.number()),
    locationLng: v.optional(v.number()),
    // Visibility settings
    visibility: v.union(
      v.literal("public"),
      v.literal("followers_only"),
      v.literal("close_friends"),
      v.literal("private"),
    ),
    // Post configuration
    commentsEnabled: v.optional(v.boolean()),
    likesVisible: v.optional(v.boolean()),
    /** When false, dislike count is hidden from non-owners (owner still sees counts). */
    dislikesVisible: v.optional(v.boolean()),
    /** Creator-controlled download permission for this post. */
    isDownloadEnabled: v.optional(v.boolean()),
    /** Download audience scope (future-ready). */
    downloadType: v.optional(
      v.union(
        v.literal("everyone"),
        v.literal("followers"),
        v.literal("only_me"),
      ),
    ),
    // Metrics (denormalized for performance)
    likeCount: v.optional(v.number()),
    /** Thumbs-down count (YouTube-style; independent from likeCount). */
    dislikeCount: v.optional(v.number()),
    commentCount: v.optional(v.number()),
    /** Qualified views (deduped per viewer session + cooldown). */
    viewsCount: v.optional(v.number()),
    /** Share actions (copy link, DM, system sheet, etc.). */
    sharesCount: v.optional(v.number()),
    /** Repost count (denormalized from reposts table). */
    repostCount: v.optional(v.number()),
    /** Successful device saves initiated from Download action. */
    downloadCount: v.optional(v.number()),
    mediaCount: v.number(),
    // Content analysis
    hashtags: v.optional(v.array(v.string())),
    mentions: v.optional(v.array(v.string())),
    // Status lifecycle
    status: v.union(
      v.literal("draft"),
      v.literal("uploading"),
      v.literal("processing"),
      v.literal("published"),
      v.literal("failed"),
      v.literal("deleted"),
    ),
    /**
     * Content moderation lifecycle (separate from `status` draft/published/deleted).
     * Legacy values `pending` / `approved` / `rejected` are normalized in code to `active`.
     */
    moderationStatus: v.optional(
      v.union(
        v.literal("active"),
        v.literal("flagged"),
        v.literal("restricted"),
        v.literal("removed"),
        v.literal("deleted"),
        v.literal("pending"),
        v.literal("approved"),
        v.literal("rejected"),
      ),
    ),
    /** Moderation visibility: who can see the post in feeds / detail (not author audience). */
    moderationVisibilityStatus: v.optional(
      v.union(
        v.literal("public"),
        v.literal("hidden"),
        v.literal("shadow_hidden"),
      ),
    ),
    moderationReason: v.optional(v.string()),
    /** After this timestamp, feed distribution requires moderationChecked===true once published. */
    moderationChecked: v.optional(v.boolean()),
    /** At most one top-level comment pinned per post (shown first in comment lists). */
    pinnedCommentId: v.optional(v.id("comments")),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
    publishedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
    /** Public permalink for web (joinvibo.com/{shortId}); optional for legacy rows. */
    shortId: v.optional(v.string()),
  })
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_user_status", ["userId", "status", "createdAt"])
    .index("by_status_created", ["status", "createdAt"])
    .index("by_visibility_created", ["visibility", "createdAt"])
    .index("by_user_visibility", ["userId", "visibility", "createdAt"])
    .index("by_short_id", ["shortId"]),

  /** Post media items - supports images and videos */
  postMedia: defineTable({
    postId: v.id("posts"),
    type: v.union(v.literal("image"), v.literal("video")),
    position: v.number(), // 0-indexed for carousel order
    // Storage URLs
    originalStorageId: v.optional(v.id("_storage")),
    originalUrl: v.optional(v.string()),
    displayUrl: v.string(),
    displayStorageRegion: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    thumbnailStorageRegion: v.optional(v.string()),
    // Dimensions
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    // Video-specific
    durationMs: v.optional(v.number()),
    hasAudioTrack: v.optional(v.boolean()),
    // Processing state
    processingStatus: v.union(
      v.literal("pending"),
      v.literal("uploading"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    // Edit data (crop, filters, etc.)
    cropData: v.optional(
      v.object({
        x: v.number(),
        y: v.number(),
        width: v.number(),
        height: v.number(),
        scale: v.number(),
        aspectRatio: v.string(), // e.g., "1:1", "4:5", "16:9"
      }),
    ),
    filterApplied: v.optional(v.string()),
    // Timestamps
    createdAt: v.number(),
    processedAt: v.optional(v.number()),
  })
    .index("by_post", ["postId"])
    .index("by_post_position", ["postId", "position"])
    .index("by_processing", ["processingStatus", "createdAt"]),

  /** Post tags - people tagged on posts */
  postTags: defineTable({
    postId: v.id("posts"),
    mediaId: v.optional(v.id("postMedia")), // null = post-level tag
    taggedUserId: v.id("users"),
    // Position for visual tags (null = post-level tag)
    x: v.optional(v.number()), // 0-1 percentage
    y: v.optional(v.number()), // 0-1 percentage
    // Metadata
    createdAt: v.number(),
    removedAt: v.optional(v.number()),
  })
    .index("by_post", ["postId"])
    .index("by_tagged_user", ["taggedUserId", "createdAt"])
    .index("by_media", ["mediaId"]),

  /** Comments on posts */
  comments: defineTable({
    postId: v.id("posts"),
    authorId: v.id("users"),
    text: v.string(),
    /** Optional GIPHY attachment (text may be empty when only GIF). */
    gifAttachment: v.optional(
      v.object({
        giphyId: v.string(),
        previewUrl: v.string(),
        fullUrl: v.string(),
        width: v.number(),
        height: v.number(),
        kind: v.union(v.literal("gif"), v.literal("sticker")),
      }),
    ),
    /** Resolved @mentions in text (handles → user ids) for profile links. */
    mentions: v.optional(
      v.array(
        v.object({
          userId: v.id("users"),
          username: v.string(),
        }),
      ),
    ),
    // For nested replies
    parentCommentId: v.optional(v.id("comments")),
    replyCount: v.optional(v.number()),
    // Moderation
    isDeleted: v.optional(v.boolean()),
    deletedAt: v.optional(v.number()),
    moderationStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("rejected"),
      ),
    ),
    // Metrics
    likeCount: v.optional(v.number()),
    dislikeCount: v.optional(v.number()),
    /** Legacy post-author pin timestamp (superseded by `posts.pinnedCommentId`). */
    pinnedAt: v.optional(v.number()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_post", ["postId", "createdAt"])
    .index("by_post_parent", ["postId", "parentCommentId", "createdAt"])
    .index("by_post_pinned", ["postId", "pinnedAt"])
    .index("by_author", ["authorId", "createdAt"])
    .index("by_parent", ["parentCommentId", "createdAt"]),

  /** Comment reactions (separate from post likes). Omit `reaction` = thumbs up; `down` = thumbs down. */
  commentLikes: defineTable({
    commentId: v.id("comments"),
    userId: v.id("users"),
    createdAt: v.number(),
    reaction: v.optional(v.union(v.literal("down"))),
  })
    .index("by_comment", ["commentId"])
    .index("by_user", ["userId", "createdAt"])
    .index("by_user_comment", ["userId", "commentId"]),

  /** Saved/bookmarked posts */
  savedPosts: defineTable({
    userId: v.id("users"),
    postId: v.id("posts"),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_user_post", ["userId", "postId"])
    .index("by_post", ["postId"]),

  /** Reposts — one user can repost a given post at most once. */
  reposts: defineTable({
    userId: v.id("users"),
    postId: v.id("posts"),
    caption: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_user_post", ["userId", "postId"])
    .index("by_post", ["postId", "createdAt"]),

  /** User-generated reports (posts, users, comments). */
  reports: defineTable({
    reporterId: v.id("users"),
    targetType: v.union(
      v.literal("post"),
      v.literal("user"),
      v.literal("comment"),
    ),
    /** String id: Convex id for the target table (e.g. posts id). */
    targetId: v.string(),
    reason: v.union(
      v.literal("spam"),
      v.literal("harassment"),
      v.literal("hate_speech"),
      v.literal("violence"),
      v.literal("nudity"),
      v.literal("misinformation"),
      v.literal("copyright"),
      v.literal("other"),
    ),
    description: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("under_review"),
      v.literal("resolved"),
      v.literal("rejected"),
    ),
    priority: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_target", ["targetType", "targetId"])
    .index("by_reporter_created", ["reporterId", "createdAt"])
    .index("by_status_created", ["status", "createdAt"])
    .index("by_created", ["createdAt"]),

  /** User-submitted account ban/suspension appeals. */
  appeals: defineTable({
    userId: v.id("users"),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
    ),
    reason: v.string(),
    details: v.optional(v.string()),
    /** Convex storage ids for screenshots (optional). */
    attachments: v.optional(v.array(v.id("_storage"))),
    createdAt: v.number(),
    /** Set when staff reviews the appeal (dashboard / admin tooling). */
    reviewedAt: v.optional(v.number()),
    reviewedBy: v.optional(v.id("users")),
    adminNote: v.optional(v.string()),
  })
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_status_created", ["status", "createdAt"]),

  /** Audit log of staff decisions (admin panel / tooling). */
  moderationActions: defineTable({
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
    /** Human-readable reason (audit / UI); prefer this over `notes` when reading. */
    reason: v.optional(v.string()),
    notes: v.optional(v.string()),
    /** Optional link to the report row that was acted on. */
    reportId: v.optional(v.id("reports")),
    createdAt: v.number(),
  })
    .index("by_target", ["targetType", "targetId"])
    .index("by_admin_created", ["adminId", "createdAt"]),

  /**
   * Structured product events (views, shares, profile) + engagement audit trail.
   * UI reads aggregated fields on `posts` / `users` — never scan this table for counts.
   */
  productEvents: defineTable({
    userId: v.optional(v.id("users")),
    type: v.union(
      v.literal("view_post"),
      v.literal("view_video"),
      v.literal("like_post"),
      v.literal("comment_post"),
      v.literal("share_post"),
      v.literal("profile_view"),
    ),
    /** Post id or profile user id as string. */
    targetId: v.string(),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_user_time", ["userId", "createdAt"])
    .index("by_type_time", ["type", "createdAt"])
    .index("by_target_type", ["targetId", "type"]),

  /**
   * Dedupes qualified post/video views: one count per app session, then 30m cooldown
   * before the same viewer can increment again for that post.
   */
  productViewDedupe: defineTable({
    viewerId: v.id("users"),
    postId: v.id("posts"),
    sessionId: v.string(),
    lastCountedAt: v.number(),
  }).index("by_viewer_post", ["viewerId", "postId"]),

  /** Download policy decisions + attempts (audit + abuse controls). */
  downloadEvents: defineTable({
    userId: v.id("users"),
    postId: v.id("posts"),
    decision: v.union(v.literal("allow"), v.literal("deny")),
    reason: v.string(),
    ipHash: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_post_created", ["postId", "createdAt"]),

  /** Download processing jobs (queue + ready URL handoff). */
  postDownloadJobs: defineTable({
    userId: v.id("users"),
    postId: v.id("posts"),
    mediaType: v.union(v.literal("image"), v.literal("video")),
    status: v.union(
      v.literal("queued"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("failed"),
    ),
    outputUrl: v.optional(v.string()),
    watermarkVersion: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    expiresAt: v.optional(v.number()),
  })
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_user_post_created", ["userId", "postId", "createdAt"])
    .index("by_status_updated", ["status", "updatedAt"]),

  /** Dedupe profile views (session + 30m cooldown). */
  productProfileViewDedupe: defineTable({
    viewerId: v.id("users"),
    profileUserId: v.id("users"),
    sessionId: v.string(),
    lastCountedAt: v.number(),
  }).index("by_viewer_profile", ["viewerId", "profileUserId"]),

  /**
   * Client analytics events (mirrors PostHog; powers feed ranking + future ads).
   * No PII in `properties` — IDs, metrics, coarse categories only.
   */
  userEvents: defineTable({
    userId: v.optional(v.id("users")),
    eventName: v.string(),
    properties: v.any(),
    timestamp: v.number(),
  })
    .index("by_user_time", ["userId", "timestamp"])
    .index("by_time", ["timestamp"]),

  /** Rolling engagement totals per user (updated from high-signal events only). */
  userEngagementScores: defineTable({
    userId: v.id("users"),
    videoWatchMsTotal: v.optional(v.number()),
    postImpressions: v.optional(v.number()),
    likesGiven: v.optional(v.number()),
    lastActiveAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  /** Coarse interest weights (e.g. category → weighted watch time). */
  userContentPreferences: defineTable({
    userId: v.id("users"),
    /** category / hashtag key — intelligence layer keeps values in ~0–1 after normalize */
    categoryWeights: v.any(),
    /** creator user id string → affinity weight */
    creatorWeights: v.optional(v.any()),
    /** `{ video: number, post: number }` — implicit watch/engage counts by type */
    contentTypeWeights: v.optional(v.any()),
    /**
     * Session / fatigue: `{ consecutiveFastSkips, boredUntil, lastVideosWatched, lastAvgWatchPct, lastFastSkips }`
     */
    feedSessionSignals: v.optional(v.any()),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  /**
   * Derived post performance for ranking / distribution (updated from analytics).
   */
  postPerformance: defineTable({
    postId: v.id("posts"),
    authorId: v.id("users"),
    avgWatchPercentage: v.number(),
    avgViewDurationMs: v.number(),
    engagementRate: v.number(),
    skipRate: v.number(),
    totalViews: v.number(),
    explicitSkipCount: v.number(),
    completeCount: v.number(),
    /** Lifecycle stage (new names); legacy growing/viral kept for existing rows. */
    distributionStage: v.union(
      v.literal("test"),
      v.literal("expand"),
      v.literal("accelerate"),
      v.literal("throttle"),
      v.literal("dead"),
      v.literal("growing"),
      v.literal("viral"),
    ),
    lastUpdatedAt: v.number(),
  }).index("by_post", ["postId"]),

  /**
   * Denormalized per-post signals for ranking (updated from analytics events).
   * Keeps feed reads fast vs scanning userEvents.
   */
  postFeedStats: defineTable({
    postId: v.id("posts"),
    authorId: v.id("users"),
    contentKind: v.union(v.literal("video"), v.literal("post")),
    impressions: v.number(),
    sumViewDurationMs: v.number(),
    sumWatchMs: v.number(),
    watchSamples: v.number(),
    sumWatchPct: v.number(),
    /** Fast abandons from impression exits + skip_post (legacy aggregate). */
    fastSkips: v.number(),
    /** Explicit `skip_post` events (total). */
    skipCount: v.optional(v.number()),
    /** skip_post with time_to_skip_ms < 1500 */
    fastSkipCount: v.optional(v.number()),
    /** skip_post with time_to_skip_ms < 500 */
    veryFastSkipCount: v.optional(v.number()),
    /** Impressions counted while post is young / low-exposure (testing pool). */
    testImpressions: v.number(),
    /**
     * Distribution lifecycle — drives `distributionMultiplier`.
     * test → expand → accelerate | throttle | dead
     */
    distributionStage: v.optional(
      v.union(
        v.literal("test"),
        v.literal("expand"),
        v.literal("accelerate"),
        v.literal("throttle"),
        v.literal("dead"),
      ),
    ),
    /** Denormalized metrics (refreshed from analytics path; keeps ranking reads light). */
    avgWatchPct: v.optional(v.number()),
    avgViewDurationMs: v.optional(v.number()),
    completionRate: v.optional(v.number()),
    skipRate: v.optional(v.number()),
    engagementRate: v.optional(v.number()),
    /** Server-side distribution throttle/boost (0.15–1.8), derived from stage + fine-tune. */
    distributionMultiplier: v.number(),
    lastUpdated: v.number(),
  })
    .index("by_post", ["postId"])
    .index("by_author_updated", ["authorId", "lastUpdated"]),

  /**
   * Real-time session slice for adaptive ranking (one row per user, upserted).
   */
  sessionFeedState: defineTable({
    userId: v.id("users"),
    startedAt: v.number(),
    fastSkipsInRow: v.number(),
    totalSkips: v.number(),
    videosWatched: v.number(),
    postsViewed: v.number(),
    avgRecentWatchPercentage: v.number(),
    avgRecentViewDurationMs: v.number(),
    recentCategories: v.array(v.string()),
    recentCreators: v.array(v.string()),
    recentContentTypes: v.array(v.string()),
    consecutiveVideoSkips: v.optional(v.number()),
    consecutivePostSkips: v.optional(v.number()),
    boredomLevel: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
    ),
    lastUpdatedAt: v.number(),
  }).index("by_user", ["userId"]),

  /**
   * Precomputed candidate pools (cron every few minutes). Ranking merges pools for scale.
   */
  feedCandidatePool: defineTable({
    pool: v.string(),
    postId: v.id("posts"),
    statsHint: v.optional(v.any()),
    lastUpdatedAt: v.number(),
  })
    .index("by_pool_updated", ["pool", "lastUpdatedAt"])
    .index("by_pool_post", ["pool", "postId"]),

  /** Creator-level quality for ranking boosts / penalties. */
  creatorTrust: defineTable({
    userId: v.id("users"),
    /** 0.5 (low) — 1.0 (high); default when row missing = derived from strikes. */
    trust: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  /** Upload sessions for tracking multi-part uploads */
  uploadSessions: defineTable({
    userId: v.id("users"),
    postId: v.optional(v.id("posts")), // null for orphaned uploads
    mediaCount: v.number(),
    status: v.union(
      v.literal("active"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("abandoned"),
    ),
    expiresAt: v.number(),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_post", ["postId"])
    .index("by_expires", ["expiresAt"]),

  // ============================================
  // AI CONTENT MODERATION
  // ============================================

  /** AI moderation scores per post (one row per moderation run). */
  postModerationScores: defineTable({
    postId: v.id("posts"),
    provider: v.string(),
    nudity: v.number(),
    sexual: v.optional(v.number()),
    suggestive: v.optional(v.number()),
    violence: v.number(),
    hate: v.number(),
    spam: v.number(),
    safe: v.number(),
    decision: v.union(
      v.literal("allow"),
      v.literal("block"),
      v.literal("flag_sensitive"),
      v.literal("flag_spam"),
    ),
    reason: v.string(),
    durationMs: v.number(),
    /** "publish" = at upload time; "report" = re-run after reports. */
    trigger: v.union(v.literal("publish"), v.literal("report")),
    createdAt: v.number(),
  })
    .index("by_post", ["postId"])
    .index("by_post_trigger", ["postId", "trigger"]),

  /** Content hashes for duplicate detection (per user). */
  contentHashes: defineTable({
    userId: v.id("users"),
    postId: v.id("posts"),
    hash: v.string(),
    /** "media" for image/video hash, "caption" for text hash. */
    hashType: v.union(v.literal("media"), v.literal("caption")),
    createdAt: v.number(),
  })
    .index("by_user_hash", ["userId", "hash"])
    .index("by_user_type", ["userId", "hashType", "createdAt"])
    .index("by_post", ["postId"]),

  /** Per-user posting rate tracker (lightweight; one row per user, upserted). */
  userPostRateLimit: defineTable({
    userId: v.id("users"),
    /** Timestamps of recent posts within the rate-limit window. */
    recentTimestamps: v.array(v.number()),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  /**
   * Moderation policy thresholds (singleton per config key).
   * Allows tuning thresholds without redeploy — A/B test, per-country, etc.
   */
  moderationConfig: defineTable({
    key: v.string(),
    nudityBlock: v.number(),
    violenceSensitive: v.number(),
    hateBlock: v.number(),
    spamFlag: v.number(),
    ratePostsPerHour: v.number(),
    /** 0–1: initial distribution multiplier for unmoderated posts. */
    preModThrottle: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  /** Cross-user hash index for coordinated spam detection. */
  globalContentHashes: defineTable({
    hash: v.string(),
    hashType: v.union(v.literal("media"), v.literal("caption")),
    userId: v.id("users"),
    postId: v.id("posts"),
    createdAt: v.number(),
  })
    .index("by_hash", ["hash", "createdAt"])
    .index("by_hash_type", ["hash", "hashType"]),

  /** Structured moderation audit events (MODERATION_RUN, DISTRIBUTION_CHANGE). */
  moderationEvents: defineTable({
    eventType: v.string(),
    postId: v.optional(v.id("posts")),
    userId: v.optional(v.id("users")),
    payload: v.any(),
    createdAt: v.number(),
  })
    .index("by_post", ["postId", "createdAt"])
    .index("by_type", ["eventType", "createdAt"]),

  blogs: defineTable({
    slug: v.string(),
    title: v.string(),
    excerpt: v.string(),
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
    .index("by_url_tag", ["url", "tag"]),
});