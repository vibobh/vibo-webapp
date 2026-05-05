import { v } from "convex/values";
import {
  assertUserCanMutate,
  canViewerSeeTargetUserProfile,
  viewerCannotAccessAppContent,
} from "./accountModeration";
import { userHiddenFromPublicDiscovery } from "./staffVisibility";
import { loadViewerStoryAuthorExclusions } from "./viewerContentFilters";

import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { buildPublicMediaUrl } from "./mediaUrl";
import {
  appendOutboundChatMessage,
  getOrCreateDirectConversationId,
} from "./messages";
import { sanitizeStoryVideoDurationSeconds } from "./storyDuration";
import {
  onStoryLikedNotification,
  onStoryUnlikedNotification,
} from "./storyLikeNotifications";

const STORY_TTL_MS = 24 * 60 * 60 * 1000;

const STORY_POLL_QUESTION_MAX = 200;
const STORY_POLL_OPTION_MAX = 80;
const STORY_POLL_MIN_OPTIONS = 2;
const STORY_POLL_MAX_OPTIONS = 4;

function sanitizeStoryPollInput(poll: {
  question: string;
  options: { id: string; text: string; votes: number }[];
  totalVotes: number;
  layout?: { cx: number; cy: number; scale: number };
}) {
  const question = poll.question.trim().slice(0, STORY_POLL_QUESTION_MAX);
  if (!question) {
    throw new Error("Poll question is required");
  }
  const rawOpts = poll.options
    .map((o) => ({
      id: String(o.id || "").trim(),
      text: String(o.text || "")
        .trim()
        .slice(0, STORY_POLL_OPTION_MAX),
    }))
    .filter((o) => o.text.length > 0 && o.id.length > 0);
  if (
    rawOpts.length < STORY_POLL_MIN_OPTIONS ||
    rawOpts.length > STORY_POLL_MAX_OPTIONS
  ) {
    throw new Error("Poll needs between 2 and 4 options");
  }
  const seen = new Set<string>();
  for (const o of rawOpts) {
    if (seen.has(o.id)) throw new Error("Duplicate poll option id");
    seen.add(o.id);
  }
  const options = rawOpts.map((o) => ({
    id: o.id,
    text: o.text,
    votes: 0,
  }));
  const layout =
    poll.layout &&
    Number.isFinite(poll.layout.cx) &&
    Number.isFinite(poll.layout.cy) &&
    Number.isFinite(poll.layout.scale)
      ? {
          cx: Math.min(1, Math.max(0, poll.layout.cx)),
          cy: Math.min(1, Math.max(0, poll.layout.cy)),
          scale: Math.min(2.5, Math.max(0.35, poll.layout.scale)),
        }
      : { cx: 0.5, cy: 0.58, scale: 1 };
  return {
    question,
    options,
    totalVotes: 0,
    layout,
  };
}

async function deleteStoryPollVotesForStory(
  ctx: MutationCtx,
  storyId: Id<"stories">,
) {
  const votes = await ctx.db
    .query("storyPollVotes")
    .withIndex("by_story", (q) => q.eq("storyId", storyId))
    .collect();
  for (const row of votes) {
    await ctx.db.delete(row._id);
  }
}

const STORY_QUESTION_TEXT_MAX = 200;
const STORY_QUESTION_PLACEHOLDER_MAX = 80;
const STORY_QUESTION_RESPONSE_MAX = 500;

function sanitizeStoryQuestionStickerInput(qs: {
  question: string;
  viewerPlaceholder?: string;
  responsesCount: number;
  layout?: { cx: number; cy: number; scale: number };
}) {
  const question = qs.question.trim().slice(0, STORY_QUESTION_TEXT_MAX);
  if (!question) {
    throw new Error("Question is required");
  }
  const viewerPlaceholder = qs.viewerPlaceholder?.trim()
    ? qs.viewerPlaceholder.trim().slice(0, STORY_QUESTION_PLACEHOLDER_MAX)
    : undefined;
  const layout =
    qs.layout &&
    Number.isFinite(qs.layout.cx) &&
    Number.isFinite(qs.layout.cy) &&
    Number.isFinite(qs.layout.scale)
      ? {
          cx: Math.min(1, Math.max(0, qs.layout.cx)),
          cy: Math.min(1, Math.max(0, qs.layout.cy)),
          scale: Math.min(2.5, Math.max(0.35, qs.layout.scale)),
        }
      : { cx: 0.5, cy: 0.52, scale: 1 };
  return {
    question,
    ...(viewerPlaceholder ? { viewerPlaceholder } : {}),
    responsesCount: 0,
    layout,
  };
}

async function deleteStoryQuestionResponsesForStory(
  ctx: MutationCtx,
  storyId: Id<"stories">,
) {
  const rows = await ctx.db
    .query("storyQuestionResponses")
    .withIndex("by_story_created", (q) => q.eq("storyId", storyId))
    .collect();
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
}

const STORY_COUNTDOWN_TITLE_MAX = 80;
const STORY_COUNTDOWN_THEMES = new Set([
  "pink",
  "light",
  "orange",
  "blue",
  "green",
  "dark",
]);

function sanitizeStoryCountdownStickerInput(cd: {
  title: string;
  targetAt: number;
  theme: string;
  reminderCount: number;
  layout?: { cx: number; cy: number; scale: number };
}) {
  const title = cd.title.trim().slice(0, STORY_COUNTDOWN_TITLE_MAX);
  if (!title) {
    throw new Error("Countdown title is required");
  }
  const targetAt = Number(cd.targetAt);
  if (!Number.isFinite(targetAt)) {
    throw new Error("Invalid countdown time");
  }
  const theme = STORY_COUNTDOWN_THEMES.has(String(cd.theme).trim())
    ? String(cd.theme).trim()
    : "pink";
  const layout =
    cd.layout &&
    Number.isFinite(cd.layout.cx) &&
    Number.isFinite(cd.layout.cy) &&
    Number.isFinite(cd.layout.scale)
      ? {
          cx: Math.min(1, Math.max(0, cd.layout.cx)),
          cy: Math.min(1, Math.max(0, cd.layout.cy)),
          scale: Math.min(2.5, Math.max(0.35, cd.layout.scale)),
        }
      : { cx: 0.5, cy: 0.5, scale: 1 };
  return {
    title,
    targetAt,
    theme,
    reminderCount: 0,
    layout,
  };
}

async function deleteStoryCountdownRemindersForStory(
  ctx: MutationCtx,
  storyId: Id<"stories">,
) {
  const rows = await ctx.db
    .query("storyCountdownReminders")
    .withIndex("by_story", (q) => q.eq("storyId", storyId))
    .collect();
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
}

const STORY_QUIZ_QUESTION_MAX = 200;
const STORY_QUIZ_OPTION_MAX = 80;
const STORY_QUIZ_MIN_OPTIONS = 2;
const STORY_QUIZ_MAX_OPTIONS = 4;

function sanitizeStoryQuizStickerInput(qz: {
  question: string;
  options: { id: string; text: string }[];
  correctOptionId: string;
  totalAnswers: number;
  correctAnswers: number;
  layout?: { cx: number; cy: number; scale: number };
}) {
  const question = qz.question.trim().slice(0, STORY_QUIZ_QUESTION_MAX);
  if (!question) {
    throw new Error("Quiz question is required");
  }
  const rawOpts = qz.options
    .map((o) => ({
      id: String(o.id || "").trim(),
      text: String(o.text || "")
        .trim()
        .slice(0, STORY_QUIZ_OPTION_MAX),
    }))
    .filter((o) => o.text.length > 0 && o.id.length > 0);
  if (
    rawOpts.length < STORY_QUIZ_MIN_OPTIONS ||
    rawOpts.length > STORY_QUIZ_MAX_OPTIONS
  ) {
    throw new Error("Quiz needs between 2 and 4 options");
  }
  const seen = new Set<string>();
  for (const o of rawOpts) {
    if (seen.has(o.id)) throw new Error("Duplicate quiz option id");
    seen.add(o.id);
  }
  const correctOptionId = String(qz.correctOptionId || "").trim();
  if (!rawOpts.some((o) => o.id === correctOptionId)) {
    throw new Error("Correct answer must match one of the options");
  }
  const layout =
    qz.layout &&
    Number.isFinite(qz.layout.cx) &&
    Number.isFinite(qz.layout.cy) &&
    Number.isFinite(qz.layout.scale)
      ? {
          cx: Math.min(1, Math.max(0, qz.layout.cx)),
          cy: Math.min(1, Math.max(0, qz.layout.cy)),
          scale: Math.min(2.5, Math.max(0.35, qz.layout.scale)),
        }
      : { cx: 0.5, cy: 0.56, scale: 1 };
  return {
    question,
    options: rawOpts,
    correctOptionId,
    totalAnswers: 0,
    correctAnswers: 0,
    layout,
  };
}

async function deleteStoryQuizAnswersForStory(
  ctx: MutationCtx,
  storyId: Id<"stories">,
) {
  const rows = await ctx.db
    .query("storyQuizAnswers")
    .withIndex("by_story", (q) => q.eq("storyId", storyId))
    .collect();
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
}

async function deleteStoryEmojiReactionsForStory(
  ctx: MutationCtx,
  storyId: Id<"stories">,
) {
  const rows = await ctx.db
    .query("storyEmojiReactions")
    .withIndex("by_story_created", (q) => q.eq("storyId", storyId))
    .collect();
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
}

/** Keep in sync with `lib/story-reactions-constants.ts` (emoji + countKey). */
const STORY_QUICK_REACTION_EMOJI_SET = new Set([
  "😂",
  "😮",
  "😍",
  "😢",
  "👏",
  "🔥",
  "🎉",
  "💯",
]);

const EMOJI_TO_REACTION_COUNT_KEY: Record<string, string> = {
  "😂": "joy",
  "😮": "surprise",
  "😍": "hearts",
  "😢": "cry",
  "👏": "clap",
  "🔥": "fire",
  "🎉": "party",
  "💯": "hundred",
};

const STORY_QUICK_REACTION_RATE_WINDOW_MS = 1000;
const STORY_QUICK_REACTION_MAX_PER_WINDOW = 5;

const STORY_PROMPT_TEXT_MAX = 200;

function sanitizeStoryPromptNewInput(input: {
  text: string;
  layout?: { cx: number; cy: number; scale: number };
}) {
  const text = input.text.trim().slice(0, STORY_PROMPT_TEXT_MAX);
  if (!text) {
    throw new Error("Prompt text is required");
  }
  const layout =
    input.layout &&
    Number.isFinite(input.layout.cx) &&
    Number.isFinite(input.layout.cy) &&
    Number.isFinite(input.layout.scale)
      ? {
          cx: Math.min(1, Math.max(0, input.layout.cx)),
          cy: Math.min(1, Math.max(0, input.layout.cy)),
          scale: Math.min(2.5, Math.max(0.35, input.layout.scale)),
        }
      : { cx: 0.5, cy: 0.52, scale: 1 };
  return { text, layout };
}

async function bumpPromptResponseCounts(
  ctx: MutationCtx,
  promptId: Id<"storyPrompts">,
  delta: number,
) {
  const promptRow = await ctx.db.get(promptId);
  if (!promptRow) return;
  const nextCount = Math.max(0, promptRow.responsesCount + delta);
  await ctx.db.patch(promptId, { responsesCount: nextCount });
  const sourceStory = await ctx.db.get(promptRow.sourceStoryId);
  if (
    sourceStory &&
    sourceStory.promptSticker &&
    sourceStory.promptSticker.promptId === promptId
  ) {
    await ctx.db.patch(promptRow.sourceStoryId, {
      promptSticker: {
        ...sourceStory.promptSticker,
        responsesCount: nextCount,
      },
    });
  }
}

async function detachPromptResponseForStory(
  ctx: MutationCtx,
  storyId: Id<"stories">,
) {
  const row = await ctx.db
    .query("storyPromptResponses")
    .withIndex("by_story", (q) => q.eq("storyId", storyId))
    .unique();
  if (!row) return;
  await ctx.db.delete(row._id);
  await bumpPromptResponseCounts(ctx, row.promptId, -1);
}

/** Hide correct answer from non-owners in list payloads. */
function quizStickerForFeedViewer(
  qs: NonNullable<Doc<"stories">["quizSticker"]>,
  storyAuthorId: Id<"users">,
  viewerUserId: Id<"users"> | null | undefined,
) {
  if (viewerUserId != null && viewerUserId === storyAuthorId) return qs;
  const { correctOptionId: _omit, ...pub } = qs;
  return pub;
}

async function countLikesForStory(
  ctx: MutationCtx,
  storyId: Id<"stories">,
): Promise<number> {
  const targetId = String(storyId);
  const [likesLegacy, likesNew] = await Promise.all([
    ctx.db
      .query("storyLikes")
      .withIndex("by_story", (q) => q.eq("storyId", storyId))
      .collect(),
    ctx.db
      .query("likes")
      .withIndex("by_target", (q) =>
        q.eq("targetType", "story").eq("targetId", targetId),
      )
      .collect(),
  ]);
  const likerIds = new Set<string>();
  for (const row of likesLegacy) likerIds.add(String(row.userId));
  for (const row of likesNew) likerIds.add(String(row.userId));
  return likerIds.size;
}

export const create = mutation({
  args: {
    userId: v.id("users"),
    mediaKey: v.string(),
    mediaType: v.union(v.literal("image"), v.literal("video")),
    mimeType: v.string(),
    caption: v.optional(v.string()),
    hasAudioTrack: v.optional(v.boolean()),
    defaultPlaybackMuted: v.optional(v.boolean()),
    locationLabel: v.optional(v.string()),
    locationLat: v.optional(v.number()),
    locationLng: v.optional(v.number()),
    duration: v.optional(v.number()),
    sharedPostId: v.optional(v.id("posts")),
    sharedPostCaption: v.optional(v.string()),
    sharedPostAuthorUsername: v.optional(v.string()),
    sharedPostThumbUrl: v.optional(v.string()),
    mediaStorageRegion: v.optional(v.string()),
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
    /** Creates `storyPrompts` + `stories.promptSticker` after insert. */
    storyPromptNew: v.optional(
      v.object({
        text: v.string(),
        layout: v.optional(
          v.object({
            cx: v.number(),
            cy: v.number(),
            scale: v.number(),
          }),
        ),
      }),
    ),
    /** @mention sticker — tags a single user. */
    mentionSticker: v.optional(
      v.object({
        userId: v.string(),
        username: v.string(),
        displayName: v.string(),
        avatarUri: v.optional(v.string()),
        layout: v.optional(
          v.object({
            cx: v.number(),
            cy: v.number(),
            scale: v.number(),
          }),
        ),
      }),
    ),
    /** Links this new story as a response to an existing prompt. */
    promptResponseTo: v.optional(v.id("storyPrompts")),
    /** "Notify Me" sticker — create sticker + allow viewers to subscribe for post alerts. */
    notifySticker: v.optional(
      v.object({
        layout: v.optional(
          v.object({
            cx: v.number(),
            cy: v.number(),
            scale: v.number(),
          }),
        ),
      }),
    ),
    /** Music sticker — attaches a Spotify track preview clip. */
    musicSticker: v.optional(
      v.object({
        trackId: v.string(),
        provider: v.string(),
        title: v.string(),
        artist: v.string(),
        albumArt: v.string(),
        preview_url: v.optional(v.string()),
        startTime: v.number(),
        duration: v.number(),
        layout: v.optional(
          v.object({
            cx: v.number(),
            cy: v.number(),
            scale: v.number(),
          }),
        ),
      }),
    ),
    /** Emoji Slider sticker. */
    emojiSliderSticker: v.optional(
      v.object({
        prompt: v.string(),
        emoji: v.string(),
        themeIndex: v.number(),
        layout: v.optional(
          v.object({
            cx: v.number(),
            cy: v.number(),
            scale: v.number(),
          }),
        ),
      }),
    ),
    /** Omit for default (all followers / same visibility rules as today). */
    audience: v.optional(v.literal("close_friends")),
  },
  handler: async (ctx, args) => {
    const {
      userId,
      mediaKey,
      mediaType,
      mimeType,
      caption,
      hasAudioTrack,
      defaultPlaybackMuted,
      locationLabel,
      locationLat,
      locationLng,
      duration,
      sharedPostId,
      sharedPostCaption,
      sharedPostAuthorUsername,
      sharedPostThumbUrl,
      mediaStorageRegion,
      poll,
      questionSticker,
      countdownSticker,
      quizSticker,
      storyPromptNew,
      promptResponseTo,
      audience,
      mentionSticker,
      notifySticker,
      musicSticker,
      emojiSliderSticker,
    } = args;
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    await assertUserCanMutate(ctx, userId);

    const sanitizedDuration = sanitizeStoryVideoDurationSeconds(duration);

    const now = Date.now();
    const hasLoc =
      locationLabel !== undefined &&
      locationLat !== undefined &&
      locationLng !== undefined;
    const pollDoc = poll ? sanitizeStoryPollInput(poll) : undefined;
    const questionDoc = questionSticker
      ? sanitizeStoryQuestionStickerInput(questionSticker)
      : undefined;
    const countdownDoc = countdownSticker
      ? sanitizeStoryCountdownStickerInput(countdownSticker)
      : undefined;
    const quizDoc = quizSticker
      ? sanitizeStoryQuizStickerInput(quizSticker)
      : undefined;
    if (storyPromptNew && promptResponseTo) {
      throw new Error(
        "Cannot start a new prompt and respond to one on the same story",
      );
    }
    const promptNewSanitized = storyPromptNew
      ? sanitizeStoryPromptNewInput(storyPromptNew)
      : undefined;
    const storyId = await ctx.db.insert("stories", {
      userId,
      mediaKey,
      ...(mediaStorageRegion?.trim()
        ? { mediaStorageRegion: mediaStorageRegion.trim() }
        : {}),
      mediaType,
      mimeType,
      likeCount: 0,
      ...(caption ? { caption } : {}),
      ...(hasAudioTrack !== undefined ? { hasAudioTrack } : {}),
      ...(defaultPlaybackMuted !== undefined ? { defaultPlaybackMuted } : {}),
      ...(hasLoc
        ? {
            locationLabel,
            locationLat,
            locationLng,
          }
        : {}),
      ...(sanitizedDuration !== undefined
        ? { duration: sanitizedDuration }
        : {}),
      ...(sharedPostId
        ? {
            sharedPostId,
            sharedPostCaption: sharedPostCaption?.trim() || undefined,
            sharedPostAuthorUsername:
              sharedPostAuthorUsername?.trim() || undefined,
            sharedPostThumbUrl: sharedPostThumbUrl?.trim() || undefined,
          }
        : {}),
      ...(pollDoc ? { poll: pollDoc } : {}),
      ...(questionDoc ? { questionSticker: questionDoc } : {}),
      ...(countdownDoc ? { countdownSticker: countdownDoc } : {}),
      ...(quizDoc ? { quizSticker: quizDoc } : {}),
      ...(mentionSticker?.userId?.trim()
        ? {
            mentionSticker: {
              userId: mentionSticker.userId.trim(),
              username: mentionSticker.username.trim(),
              displayName: mentionSticker.displayName.trim(),
              ...(mentionSticker.avatarUri?.trim()
                ? { avatarUri: mentionSticker.avatarUri.trim() }
                : {}),
              ...(mentionSticker.layout ? { layout: mentionSticker.layout } : {}),
            },
          }
        : {}),
      ...(notifySticker
        ? {
            notifySticker: {
              subscriberCount: 0,
              ...(notifySticker.layout ? { layout: notifySticker.layout } : {}),
            },
          }
        : {}),
      ...(emojiSliderSticker
        ? {
            emojiSliderSticker: {
              prompt: emojiSliderSticker.prompt.trim(),
              emoji: emojiSliderSticker.emoji.trim() || "😍",
              voteCount: 0,
              averageValue: 50,
              themeIndex: emojiSliderSticker.themeIndex,
              ...(emojiSliderSticker.layout
                ? { layout: emojiSliderSticker.layout }
                : {}),
            },
          }
        : {}),
      ...(musicSticker?.trackId?.trim()
        ? {
            musicSticker: {
              trackId: musicSticker.trackId.trim(),
              provider: musicSticker.provider,
              title: musicSticker.title.trim(),
              artist: musicSticker.artist.trim(),
              albumArt: musicSticker.albumArt,
              ...(musicSticker.preview_url?.trim()
                ? { preview_url: musicSticker.preview_url.trim() }
                : {}),
              startTime: musicSticker.startTime,
              duration: musicSticker.duration,
              ...(musicSticker.layout ? { layout: musicSticker.layout } : {}),
            },
          }
        : {}),
      ...(audience === "close_friends" ? { audience: "close_friends" } : {}),
      createdAt: now,
      expiresAt: now + STORY_TTL_MS,
    });

    if (promptNewSanitized) {
      const promptId = await ctx.db.insert("storyPrompts", {
        text: promptNewSanitized.text,
        creatorUserId: userId,
        sourceStoryId: storyId,
        responsesCount: 0,
        createdAt: now,
      });
      await ctx.db.patch(storyId, {
        promptSticker: {
          promptId,
          text: promptNewSanitized.text,
          responsesCount: 0,
          layout: promptNewSanitized.layout,
        },
      });
    }

    if (promptResponseTo) {
      const promptRow = await ctx.db.get(promptResponseTo);
      if (!promptRow) {
        throw new Error("Prompt not found");
      }
      if (promptRow.creatorUserId === userId) {
        throw new Error(
          "You started this prompt — open the camera from another account to add yours",
        );
      }
      const dup = await ctx.db
        .query("storyPromptResponses")
        .withIndex("by_prompt_user", (q) =>
          q.eq("promptId", promptResponseTo).eq("userId", userId),
        )
        .unique();
      if (dup) {
        throw new Error("You already added yours for this prompt");
      }
      await ctx.db.insert("storyPromptResponses", {
        promptId: promptResponseTo,
        userId,
        storyId,
        createdAt: now,
      });
      await bumpPromptResponseCounts(ctx, promptResponseTo, 1);
      const promptAfter = await ctx.db.get(promptResponseTo);
      if (promptAfter) {
        await ctx.db.patch(storyId, {
          promptSticker: {
            promptId: promptResponseTo,
            text: promptAfter.text,
            responsesCount: promptAfter.responsesCount,
            layout: { cx: 0.5, cy: 0.48, scale: 1 },
          },
        });
      }
    }

    return storyId;
  },
});

export const listActiveByUser = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
    viewerUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, { userId, limit, viewerUserId }) => {
    const owner = await ctx.db.get(userId);
    const viewer = viewerUserId != null ? await ctx.db.get(viewerUserId) : null;
    if (
      !owner ||
      !canViewerSeeTargetUserProfile(owner, viewerUserId ?? null, viewer)
    ) {
      return [];
    }

    const now = Date.now();
    const rows = await ctx.db
      .query("stories")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit ?? 20);

    const active = rows.filter((story) => story.expiresAt > now);
    // Match home `listFeed`: oldest → newest (progress / viewer order same as feed rail).
    let sorted = active.sort((a, b) => a.createdAt - b.createdAt);
    if (viewerUserId && viewerUserId !== userId) {
      const entry = await ctx.db
        .query("closeFriends")
        .withIndex("by_user_friend", (q) =>
          q.eq("userId", userId).eq("friendId", viewerUserId),
        )
        .unique();
      const canSeeCloseFriendsOnly = !!entry;
      sorted = sorted.filter(
        (story) => story.audience !== "close_friends" || canSeeCloseFriendsOnly,
      );
    }
    return sorted.map((story) => {
      if (!story.quizSticker) return story;
      return {
        ...story,
        quizSticker: quizStickerForFeedViewer(
          story.quizSticker,
          story.userId,
          viewerUserId,
        ),
      };
    });
  },
});

/** Delete expired stories + their view rows (Convex dashboard or cron). */
async function purgeExpiredStories(ctx: MutationCtx) {
  const now = Date.now();
  const expired = await ctx.db
    .query("stories")
    .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
    .collect();

  let removed = 0;
  for (const story of expired) {
    const views = await ctx.db
      .query("storyViews")
      .withIndex("by_story", (q) => q.eq("storyId", story._id))
      .collect();
    for (const row of views) {
      await ctx.db.delete(row._id);
    }
    const likes = await ctx.db
      .query("storyLikes")
      .withIndex("by_story", (q) => q.eq("storyId", story._id))
      .collect();
    for (const row of likes) {
      await ctx.db.delete(row._id);
    }
    const unifiedLikes = await ctx.db
      .query("likes")
      .withIndex("by_target", (q) =>
        q.eq("targetType", "story").eq("targetId", String(story._id)),
      )
      .collect();
    for (const row of unifiedLikes) {
      await ctx.db.delete(row._id);
    }
    const replies = await ctx.db
      .query("storyReplies")
      .withIndex("by_story", (q) => q.eq("storyId", story._id))
      .collect();
    for (const row of replies) {
      await ctx.db.delete(row._id);
    }
    await deleteStoryPollVotesForStory(ctx, story._id);
    await deleteStoryQuestionResponsesForStory(ctx, story._id);
    await deleteStoryCountdownRemindersForStory(ctx, story._id);
    await deleteStoryQuizAnswersForStory(ctx, story._id);
    await deleteStoryEmojiReactionsForStory(ctx, story._id);
    await detachPromptResponseForStory(ctx, story._id);
    await ctx.db.delete(story._id as Id<"stories">);
    removed += 1;
  }

  return { removed };
}

export const removeExpired = mutation({
  args: {},
  handler: async (ctx) => purgeExpiredStories(ctx),
});

/** Called by `convex/crons.ts` — do not expose to clients. */
export const removeExpiredScheduled = internalMutation({
  args: {},
  handler: async (ctx) => purgeExpiredStories(ctx),
});

/**
 * Full story feed query - used for story viewer with all data.
 *
 * PERFORMANCE NOTES:
 * - Still fetches up to 300 stories for comprehensive feed
 * - Includes relationship checks for proper categorization
 * - Should be used when opening story viewer, not for initial rail
 */
export const listFeed = query({
  args: {
    viewerId: v.id("users"),
  },
  handler: async (ctx, { viewerId }) => {
    const viewerUser = await ctx.db.get(viewerId);
    if (viewerCannotAccessAppContent(viewerUser)) {
      return [];
    }
    const now = Date.now();
    const storyAuthorExclude = await loadViewerStoryAuthorExclusions(
      ctx,
      viewerId,
    );

    // Get relevant user IDs first (following, followers, close friends) for priority sorting
    // Reduced limits for better performance
    const [followingList, followersList, closeFriendsList, cfRowsAsFriend] =
      await Promise.all([
        ctx.db
          .query("follows")
          .withIndex("by_follower_status", (q) =>
            q.eq("followerId", viewerId).eq("status", "active"),
          )
          .take(100), // Reduced from unlimited
        ctx.db
          .query("follows")
          .withIndex("by_following_status", (q) =>
            q.eq("followingId", viewerId).eq("status", "active"),
          )
          .take(100), // Reduced from unlimited
        ctx.db
          .query("closeFriends")
          .withIndex("by_user", (q) => q.eq("userId", viewerId))
          .take(50),
        ctx.db
          .query("closeFriends")
          .withIndex("by_friend", (q) => q.eq("friendId", viewerId))
          .take(200),
      ]);

    const authorsWhoIncludeViewerInCloseFriends = new Set<Id<"users">>(
      cfRowsAsFriend.map((r) => r.userId),
    );

    const followingIds = new Set<Id<"users">>(
      followingList.map((f) => f.followingId),
    );
    const followersIds = new Set<Id<"users">>(
      followersList.map((f) => f.followerId),
    );
    const closeFriendIds = new Set<Id<"users">>(
      closeFriendsList.map((cf) => cf.friendId),
    );

    // Fetch active stories - reduced limit for better performance
    const activeStories = await ctx.db
      .query("stories")
      .withIndex("by_expiresAt", (q) => q.gt("expiresAt", now))
      .take(300); // Reduced from 500

    if (activeStories.length === 0) return [];

    // Group stories by user
    const storiesByUser = new Map<Id<"users">, typeof activeStories>();
    for (const story of activeStories) {
      const items = storiesByUser.get(story.userId) ?? [];
      items.push(story);
      storiesByUser.set(story.userId, items);
    }

    const userIds = [...storiesByUser.keys()];

    // Batch fetch all users, follows, and story views in parallel
    // Limit story views query for better performance
    const [users, allFollows, allStoryViews] = await Promise.all([
      Promise.all(userIds.map((id) => ctx.db.get(id))),
      ctx.db
        .query("follows")
        .withIndex("by_follower", (q) => q.eq("followerId", viewerId))
        .take(200), // Limit instead of collect()
      ctx.db
        .query("storyViews")
        .withIndex("by_viewer", (q) => q.eq("viewerId", viewerId))
        .take(300), // Limit views for performance
    ]);

    const userMap = new Map(userIds.map((id, i) => [id, users[i]]));

    // Build lookup maps for efficient checking
    const iFollowMap = new Map<Id<"users">, "active" | "pending">();
    const theyFollowMap = new Map<Id<"users">, boolean>();
    for (const follow of allFollows) {
      if (follow.followerId === viewerId) {
        iFollowMap.set(follow.followingId, follow.status);
      }
      if (follow.followingId === viewerId && follow.status === "active") {
        theyFollowMap.set(follow.followerId, true);
      }
    }

    // Build viewed story set
    const viewedStoryIds = new Set(allStoryViews.map((v) => String(v.storyId)));

    // Helper to resolve profile picture URL (inline for speed)
    const resolveProfilePic = (
      user: (typeof users)[number] | null | undefined,
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

    // Build feed items - use for loop instead of map for better performance
    const feedWithViews: FeedItem[] = [];
    for (const userId of userIds) {
      const user = userMap.get(userId);
      if (!user) continue;

      let userStories = [...(storiesByUser.get(userId) ?? [])];
      if (userId !== viewerId) {
        userStories = userStories.filter(
          (s) =>
            s.audience !== "close_friends" ||
            authorsWhoIncludeViewerInCloseFriends.has(userId),
        );
      }
      if (userStories.length === 0) continue;

      if (userId !== viewerId && storyAuthorExclude.has(String(userId))) {
        continue;
      }
      if (userId !== viewerId && user && userHiddenFromPublicDiscovery(user)) {
        continue;
      }

      // Sort stories once
      userStories.sort((a, b) => a.createdAt - b.createdAt);
      const latestStory = userStories[userStories.length - 1];

      // Check for unviewed stories
      let hasUnviewed = false;
      for (const s of userStories) {
        if (!viewedStoryIds.has(String(s._id))) {
          hasUnviewed = true;
          break;
        }
      }
      const allViewed = !hasUnviewed;

      const isCloseFriend = closeFriendIds.has(userId);
      const iFollowStatus = iFollowMap.get(userId);
      const iFollow = iFollowStatus === "active" || iFollowStatus === "pending";
      const theyFollow = theyFollowMap.has(userId);
      const isMutual = iFollow && theyFollow;
      const isMe = userId === viewerId;

      // Determine category for sorting
      // Priority: self (0), close friend (1), mutual (2), following (3), follower (4), other (5)
      let category: number;
      if (isMe) {
        category = 0;
      } else if (isCloseFriend) {
        category = 1;
      } else if (isMutual) {
        category = 2;
      } else if (iFollow) {
        category = 3;
      } else if (theyFollow) {
        category = 4;
      } else {
        category = 5;
      }

      const viewedPriority = allViewed ? 1 : 0;
      const userPic = resolveProfilePic(user);

      feedWithViews.push({
        user: {
          _id: user._id,
          username: user.username || "",
          fullName: user.fullName,
          profilePictureUrl: userPic.url,
          profilePictureKey: userPic.key,
        },
        stories: userStories.map((s) => ({
          _id: String(s._id),
          mediaKey: s.mediaKey,
          mediaType: s.mediaType,
          mimeType: s.mimeType,
          createdAt: s.createdAt,
          expiresAt: s.expiresAt,
          ...(s.caption ? { caption: s.caption } : {}),
          ...(s.duration ? { duration: s.duration } : {}),
          ...(s.hasAudioTrack ? { hasAudioTrack: s.hasAudioTrack } : {}),
          ...(s.defaultPlaybackMuted
            ? { defaultPlaybackMuted: s.defaultPlaybackMuted }
            : {}),
          ...(s.locationLabel ? { locationLabel: s.locationLabel } : {}),
          ...(typeof s.likeCount === "number"
            ? { likeCount: s.likeCount }
            : {}),
          ...(s.mediaStorageRegion
            ? { mediaStorageRegion: s.mediaStorageRegion }
            : {}),
          ...(s.poll ? { poll: s.poll } : {}),
          ...(s.questionSticker ? { questionSticker: s.questionSticker } : {}),
          ...(s.countdownSticker
            ? { countdownSticker: s.countdownSticker }
            : {}),
          ...(s.quizSticker
            ? {
                quizSticker: quizStickerForFeedViewer(
                  s.quizSticker,
                  userId,
                  viewerId,
                ),
              }
            : {}),
          ...(s.promptSticker ? { promptSticker: s.promptSticker } : {}),
          ...(s.mentionSticker ? { mentionSticker: s.mentionSticker } : {}),
          ...(s.notifySticker ? { notifySticker: s.notifySticker } : {}),
          ...(s.emojiSliderSticker ? { emojiSliderSticker: s.emojiSliderSticker } : {}),
          ...(s.musicSticker ? { musicSticker: s.musicSticker } : {}),
        })) as any,
        latestCreatedAt: latestStory?.createdAt ?? 0,
        hasUnviewed,
        allViewed,
        category,
        viewedPriority,
        isCloseFriend,
        isMutual,
        iFollow: iFollowStatus === "active",
        theyFollow,
        isFollowingPending: iFollowStatus === "pending",
      });
    }

    // Sort: category first, then viewed status, then recency
    return feedWithViews.sort((a, b) => {
      if (a.category !== b.category) return a.category - b.category;
      if (a.viewedPriority !== b.viewedPriority) {
        return a.viewedPriority - b.viewedPriority;
      }
      return b.latestCreatedAt - a.latestCreatedAt;
    });
  },
});

/**
 * Lightweight story feed for the rail — same **relationship priority** as `listFeed`
 * (self → close friends → mutuals → other followed), without scanning global active stories.
 *
 * Not included here (use full `listFeed` + dedicated ranking when ready):
 * - Interaction-based boosts (DMs, replies, watch time)
 * - Suggested / non-followed authors (inject after main cluster with a cap)
 */
export const listFeedLight = query({
  args: {
    viewerId: v.id("users"),
  },
  handler: async (ctx, { viewerId }) => {
    const now = Date.now();
    const storyAuthorExclude = await loadViewerStoryAuthorExclusions(
      ctx,
      viewerId,
    );

    const [
      followingList,
      selfStories,
      closeFriendsList,
      followersOfViewer,
      cfRowsAsFriend,
    ] = await Promise.all([
      ctx.db
        .query("follows")
        .withIndex("by_follower_status", (q) =>
          q.eq("followerId", viewerId).eq("status", "active"),
        )
        .take(30),
      ctx.db
        .query("stories")
        .withIndex("by_user_created", (q) => q.eq("userId", viewerId))
        .filter((q) => q.gt(q.field("expiresAt"), now))
        .order("desc")
        .take(10),
      ctx.db
        .query("closeFriends")
        .withIndex("by_user", (q) => q.eq("userId", viewerId))
        .take(50),
      ctx.db
        .query("follows")
        .withIndex("by_following_status", (q) =>
          q.eq("followingId", viewerId).eq("status", "active"),
        )
        .take(100),
      ctx.db
        .query("closeFriends")
        .withIndex("by_friend", (q) => q.eq("friendId", viewerId))
        .take(200),
    ]);

    const authorsWhoIncludeViewerInCloseFriends = new Set<Id<"users">>(
      cfRowsAsFriend.map((r) => r.userId),
    );

    const closeFriendIds = new Set<Id<"users">>(
      closeFriendsList.map((cf) => cf.friendId),
    );
    const theyFollowViewerIds = new Set<Id<"users">>(
      followersOfViewer.map((f) => f.followerId),
    );

    const followingIds = new Set<Id<"users">>(
      followingList.map((f) => f.followingId),
    );
    followingIds.add(viewerId); // Include self

    // Fetch stories only from relevant users (not all 500 active stories)
    const storiesByUser = new Map<Id<"users">, Doc<"stories">[]>();

    // Add self stories first
    if (selfStories.length > 0) {
      storiesByUser.set(viewerId, selfStories.reverse()); // oldest first for progress order
    }

    // Fetch stories from followed users in parallel (limited to 30 users)
    const followedStoriesPromises = Array.from(followingIds)
      .filter((id) => id !== viewerId)
      .filter((id) => !storyAuthorExclude.has(String(id)))
      .slice(0, 30) // Reduced limit for better performance
      .map(async (userId) => {
        const stories = await ctx.db
          .query("stories")
          .withIndex("by_user_created", (q) => q.eq("userId", userId))
          .filter((q) => q.gt(q.field("expiresAt"), now))
          .order("desc")
          .take(3); // Reduced from 5 - only need first few stories per user for rail
        return { userId, stories: stories.reverse() }; // oldest first
      });

    const followedResults = await Promise.all(followedStoriesPromises);

    for (const { userId, stories } of followedResults) {
      const visible =
        userId === viewerId
          ? stories
          : stories.filter(
              (s) =>
                s.audience !== "close_friends" ||
                authorsWhoIncludeViewerInCloseFriends.has(userId),
            );
      if (visible.length > 0) {
        storiesByUser.set(userId, visible);
      }
    }

    const userIds = [...storiesByUser.keys()];
    if (userIds.length === 0) return [];

    // Batch fetch users and story views - limit story views to recent ones only
    const [users, storyViews] = await Promise.all([
      Promise.all(userIds.map((id) => ctx.db.get(id))),
      ctx.db
        .query("storyViews")
        .withIndex("by_viewer", (q) => q.eq("viewerId", viewerId))
        .take(200), // Limit views query instead of collecting all
    ]);

    const userMap = new Map(userIds.map((id, i) => [id, users[i]]));
    const viewedStoryIds = new Set(storyViews.map((v) => String(v.storyId)));

    // Helper to resolve profile picture URL (inline for speed)
    const resolveProfilePic = (
      user: (typeof users)[number] | null | undefined,
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

    // Build minimal feed items
    const feedItems: FeedItem[] = [];
    for (const userId of userIds) {
      const user = userMap.get(userId);
      if (!user) continue;

      const stories = storiesByUser.get(userId) ?? [];
      if (stories.length === 0) continue;

      const latestStory = stories[stories.length - 1];
      let hasUnviewed = false;
      for (const s of stories) {
        if (!viewedStoryIds.has(String(s._id))) {
          hasUnviewed = true;
          break;
        }
      }

      const isMe = userId === viewerId;
      const userPic = resolveProfilePic(user);
      const isCloseFriend = !isMe && closeFriendIds.has(userId);
      const theyFollow = !isMe && theyFollowViewerIds.has(userId);
      const iFollowActive = !isMe;
      const isMutual = iFollowActive && theyFollow;

      let category: number;
      if (isMe) {
        category = 0;
      } else if (isCloseFriend) {
        category = 1;
      } else if (isMutual) {
        category = 2;
      } else {
        category = 3;
      }

      feedItems.push({
        user: {
          _id: user._id,
          username: user.username || "",
          fullName: user.fullName,
          profilePictureUrl: userPic.url,
          profilePictureKey: userPic.key,
        },
        // Only return first story for rail display - minimal data
        stories: stories.slice(0, 2).map((s) => ({
          _id: String(s._id),
          mediaKey: s.mediaKey,
          mediaType: s.mediaType,
          mimeType: s.mimeType,
          createdAt: s.createdAt,
          expiresAt: s.expiresAt,
          // Only include optional fields if they exist (reduce payload size)
          ...(s.caption ? { caption: s.caption } : {}),
          ...(s.duration ? { duration: s.duration } : {}),
          ...(s.hasAudioTrack ? { hasAudioTrack: s.hasAudioTrack } : {}),
          ...(s.defaultPlaybackMuted
            ? { defaultPlaybackMuted: s.defaultPlaybackMuted }
            : {}),
          ...(s.locationLabel ? { locationLabel: s.locationLabel } : {}),
          ...(typeof s.likeCount === "number"
            ? { likeCount: s.likeCount }
            : {}),
          ...(s.mediaStorageRegion
            ? { mediaStorageRegion: s.mediaStorageRegion }
            : {}),
          ...(s.poll ? { poll: s.poll } : {}),
          ...(s.questionSticker ? { questionSticker: s.questionSticker } : {}),
          ...(s.countdownSticker
            ? { countdownSticker: s.countdownSticker }
            : {}),
          ...(s.quizSticker
            ? {
                quizSticker: quizStickerForFeedViewer(
                  s.quizSticker,
                  userId,
                  viewerId,
                ),
              }
            : {}),
          ...(s.promptSticker ? { promptSticker: s.promptSticker } : {}),
          ...(s.mentionSticker ? { mentionSticker: s.mentionSticker } : {}),
          ...(s.notifySticker ? { notifySticker: s.notifySticker } : {}),
          ...(s.emojiSliderSticker ? { emojiSliderSticker: s.emojiSliderSticker } : {}),
          ...(s.musicSticker ? { musicSticker: s.musicSticker } : {}),
        })) as any,
        latestCreatedAt: latestStory?.createdAt ?? 0,
        hasUnviewed,
        allViewed: !hasUnviewed,
        category,
        viewedPriority: hasUnviewed ? 0 : 1,
        isCloseFriend,
        isMutual,
        iFollow: iFollowActive,
        theyFollow,
        isFollowingPending: false,
      });
    }

    // Sort: category first, then viewed status, then recency (same comparator as `listFeed`)
    return feedItems.sort((a, b) => {
      if (a.category !== b.category) return a.category - b.category;
      if (a.viewedPriority !== b.viewedPriority) {
        return a.viewedPriority - b.viewedPriority;
      }
      return b.latestCreatedAt - a.latestCreatedAt;
    });
  },
});

// Type for feed items
interface FeedItem {
  user: {
    _id: Id<"users">;
    username: string;
    fullName?: string;
    profilePictureUrl: string | null;
    profilePictureKey: string | null;
  };
  stories: any[];
  latestCreatedAt: number;
  hasUnviewed: boolean;
  allViewed: boolean;
  category: number;
  viewedPriority: number;
  isCloseFriend: boolean;
  isMutual: boolean;
  iFollow: boolean;
  theyFollow: boolean;
  isFollowingPending: boolean;
}

export const deleteForOwner = mutation({
  args: {
    storyId: v.id("stories"),
    ownerUserId: v.id("users"),
  },
  handler: async (ctx, { storyId, ownerUserId }) => {
    await assertUserCanMutate(ctx, ownerUserId);
    const story = await ctx.db.get(storyId);
    if (!story) {
      throw new Error("Story not found");
    }
    if (story.userId !== ownerUserId) {
      throw new Error("Not allowed to delete this story");
    }

    const views = await ctx.db
      .query("storyViews")
      .withIndex("by_story", (q) => q.eq("storyId", storyId))
      .collect();
    for (const row of views) {
      await ctx.db.delete(row._id);
    }
    const likes = await ctx.db
      .query("storyLikes")
      .withIndex("by_story", (q) => q.eq("storyId", storyId))
      .collect();
    for (const row of likes) {
      await ctx.db.delete(row._id);
    }
    const unifiedLikes = await ctx.db
      .query("likes")
      .withIndex("by_target", (q) =>
        q.eq("targetType", "story").eq("targetId", String(storyId)),
      )
      .collect();
    for (const row of unifiedLikes) {
      await ctx.db.delete(row._id);
    }
    const replies = await ctx.db
      .query("storyReplies")
      .withIndex("by_story", (q) => q.eq("storyId", storyId))
      .collect();
    for (const row of replies) {
      await ctx.db.delete(row._id);
    }
    await deleteStoryPollVotesForStory(ctx, storyId);
    await deleteStoryQuestionResponsesForStory(ctx, storyId);
    await deleteStoryCountdownRemindersForStory(ctx, storyId);
    await deleteStoryQuizAnswersForStory(ctx, storyId);
    await deleteStoryEmojiReactionsForStory(ctx, storyId);
    await detachPromptResponseForStory(ctx, storyId);
    await ctx.db.delete(storyId);
    return { deleted: true };
  },
});

export const submitStoryQuestionResponse = mutation({
  args: {
    storyId: v.id("stories"),
    responderId: v.id("users"),
    text: v.string(),
  },
  handler: async (ctx, { storyId, responderId, text }) => {
    await assertUserCanMutate(ctx, responderId);
    const story = await ctx.db.get(storyId);
    if (!story) throw new Error("Story not found");
    if (!story.questionSticker) throw new Error("No question on this story");
    if (story.expiresAt <= Date.now()) throw new Error("Story expired");
    if (story.userId === responderId) {
      throw new Error("Cannot respond on your own story");
    }
    const body = text.trim().slice(0, STORY_QUESTION_RESPONSE_MAX);
    if (!body) throw new Error("Message is empty");

    await ctx.db.insert("storyQuestionResponses", {
      storyId,
      storyOwnerId: story.userId,
      responderId,
      text: body,
      createdAt: Date.now(),
    });

    const qs = story.questionSticker;
    await ctx.db.patch(storyId, {
      questionSticker: {
        ...qs,
        responsesCount: qs.responsesCount + 1,
      },
    });
    return { ok: true as const };
  },
});

export const listStoryQuestionResponses = query({
  args: {
    storyId: v.id("stories"),
    requesterUserId: v.id("users"),
  },
  handler: async (ctx, { storyId, requesterUserId }) => {
    const story = await ctx.db.get(storyId);
    if (!story || story.userId !== requesterUserId) {
      return null;
    }
    const rows = await ctx.db
      .query("storyQuestionResponses")
      .withIndex("by_story_created", (q) => q.eq("storyId", storyId))
      .order("desc")
      .take(200);

    const responses = await Promise.all(
      rows.map(async (r) => {
        const u = await ctx.db.get(r.responderId);
        return {
          _id: r._id,
          text: r.text,
          createdAt: r.createdAt,
          responderId: r.responderId,
          username: u?.username,
          fullName: u?.fullName,
          profilePictureUrl: u?.profilePictureUrl,
          profilePictureKey: u?.profilePictureKey,
          profilePictureStorageRegion: u?.profilePictureStorageRegion,
        };
      }),
    );
    return { responses };
  },
});

export const deleteStoryQuestionResponse = mutation({
  args: {
    responseId: v.id("storyQuestionResponses"),
    ownerUserId: v.id("users"),
  },
  handler: async (ctx, { responseId, ownerUserId }) => {
    await assertUserCanMutate(ctx, ownerUserId);
    const row = await ctx.db.get(responseId);
    if (!row) throw new Error("Not found");
    if (row.storyOwnerId !== ownerUserId) {
      throw new Error("Not allowed");
    }
    const story = await ctx.db.get(row.storyId);
    await ctx.db.delete(responseId);
    if (story?.questionSticker) {
      const qs = story.questionSticker;
      await ctx.db.patch(row.storyId, {
        questionSticker: {
          ...qs,
          responsesCount: Math.max(0, qs.responsesCount - 1),
        },
      });
    }
    return { deleted: true as const };
  },
});

export const getMyStoryCountdownReminder = query({
  args: {
    storyId: v.id("stories"),
    viewerId: v.id("users"),
  },
  handler: async (ctx, { storyId, viewerId }) => {
    const row = await ctx.db
      .query("storyCountdownReminders")
      .withIndex("by_story_user", (q) =>
        q.eq("storyId", storyId).eq("userId", viewerId),
      )
      .unique();
    return { active: Boolean(row) };
  },
});

export const addStoryCountdownReminder = mutation({
  args: {
    storyId: v.id("stories"),
    viewerId: v.id("users"),
  },
  handler: async (ctx, { storyId, viewerId }) => {
    await assertUserCanMutate(ctx, viewerId);
    const story = await ctx.db.get(storyId);
    if (!story) throw new Error("Story not found");
    if (!story.countdownSticker) throw new Error("No countdown on this story");
    if (story.expiresAt <= Date.now()) throw new Error("Story expired");
    if (story.userId === viewerId) {
      throw new Error("Use insights on your own story");
    }
    const existing = await ctx.db
      .query("storyCountdownReminders")
      .withIndex("by_story_user", (q) =>
        q.eq("storyId", storyId).eq("userId", viewerId),
      )
      .unique();
    if (existing) {
      return { ok: true as const, already: true as const };
    }
    const cs = story.countdownSticker;
    await ctx.db.insert("storyCountdownReminders", {
      storyId,
      userId: viewerId,
      targetAt: cs.targetAt,
      titleSnapshot: cs.title.slice(0, STORY_COUNTDOWN_TITLE_MAX),
      createdAt: Date.now(),
    });
    await ctx.db.patch(storyId, {
      countdownSticker: {
        ...cs,
        reminderCount: cs.reminderCount + 1,
      },
    });
    return { ok: true as const, already: false as const };
  },
});

export const removeStoryCountdownReminder = mutation({
  args: {
    storyId: v.id("stories"),
    viewerId: v.id("users"),
  },
  handler: async (ctx, { storyId, viewerId }) => {
    await assertUserCanMutate(ctx, viewerId);
    const existing = await ctx.db
      .query("storyCountdownReminders")
      .withIndex("by_story_user", (q) =>
        q.eq("storyId", storyId).eq("userId", viewerId),
      )
      .unique();
    if (!existing) {
      return { ok: true as const, removed: false as const };
    }
    await ctx.db.delete(existing._id);
    const story = await ctx.db.get(storyId);
    if (story?.countdownSticker) {
      const cs = story.countdownSticker;
      await ctx.db.patch(storyId, {
        countdownSticker: {
          ...cs,
          reminderCount: Math.max(0, cs.reminderCount - 1),
        },
      });
    }
    return { ok: true as const, removed: true as const };
  },
});

export const getStoryQuizViewerData = query({
  args: {
    storyId: v.id("stories"),
    viewerUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, { storyId, viewerUserId }) => {
    const story = await ctx.db.get(storyId);
    if (!story?.quizSticker) return null;
    const qz = story.quizSticker;
    const isOwner = viewerUserId != null && viewerUserId === story.userId;
    if (isOwner) {
      return {
        role: "owner" as const,
        question: qz.question,
        options: qz.options,
        correctOptionId: qz.correctOptionId,
        totalAnswers: qz.totalAnswers,
        correctAnswers: qz.correctAnswers,
        layout: qz.layout,
        myOptionId: null as string | null,
      };
    }
    if (!viewerUserId) {
      return {
        role: "anonymous" as const,
        question: qz.question,
        options: qz.options,
        layout: qz.layout,
        correctOptionId: null as string | null,
        myOptionId: null as string | null,
      };
    }
    const row = await ctx.db
      .query("storyQuizAnswers")
      .withIndex("by_story_user", (q) =>
        q.eq("storyId", storyId).eq("userId", viewerUserId),
      )
      .unique();
    if (!row) {
      return {
        role: "can_answer" as const,
        question: qz.question,
        options: qz.options,
        layout: qz.layout,
        correctOptionId: null as string | null,
        myOptionId: null as string | null,
      };
    }
    return {
      role: "answered" as const,
      question: qz.question,
      options: qz.options,
      layout: qz.layout,
      correctOptionId: qz.correctOptionId,
      myOptionId: row.optionId,
      isCorrect: row.isCorrect,
    };
  },
});

export const submitStoryQuizAnswer = mutation({
  args: {
    storyId: v.id("stories"),
    viewerId: v.id("users"),
    optionId: v.string(),
  },
  handler: async (ctx, { storyId, viewerId, optionId }) => {
    await assertUserCanMutate(ctx, viewerId);
    const story = await ctx.db.get(storyId);
    if (!story) throw new Error("Story not found");
    if (!story.quizSticker) throw new Error("No quiz on this story");
    if (story.expiresAt <= Date.now()) throw new Error("Story expired");
    if (story.userId === viewerId) {
      throw new Error("Cannot answer your own quiz");
    }
    const qz = story.quizSticker;
    const opt = qz.options.find((o) => o.id === optionId);
    if (!opt) throw new Error("Invalid option");
    const existing = await ctx.db
      .query("storyQuizAnswers")
      .withIndex("by_story_user", (q) =>
        q.eq("storyId", storyId).eq("userId", viewerId),
      )
      .unique();
    if (existing) {
      return {
        ok: true as const,
        already: true as const,
        optionId: existing.optionId,
        isCorrect: existing.isCorrect,
        correctOptionId: qz.correctOptionId,
      };
    }
    const isCorrect = optionId === qz.correctOptionId;
    await ctx.db.insert("storyQuizAnswers", {
      storyId,
      userId: viewerId,
      optionId,
      isCorrect,
      answeredAt: Date.now(),
    });
    await ctx.db.patch(storyId, {
      quizSticker: {
        ...qz,
        totalAnswers: qz.totalAnswers + 1,
        correctAnswers: qz.correctAnswers + (isCorrect ? 1 : 0),
      },
    });
    return {
      ok: true as const,
      already: false as const,
      optionId,
      isCorrect,
      correctOptionId: qz.correctOptionId,
    };
  },
});

export const getMyStoryPollVote = query({
  args: {
    storyId: v.id("stories"),
    viewerId: v.id("users"),
  },
  handler: async (ctx, { storyId, viewerId }) => {
    const row = await ctx.db
      .query("storyPollVotes")
      .withIndex("by_story_voter", (q) =>
        q.eq("storyId", storyId).eq("voterId", viewerId),
      )
      .unique();
    return row?.optionId ?? null;
  },
});

export const voteStoryPoll = mutation({
  args: {
    storyId: v.id("stories"),
    viewerId: v.id("users"),
    optionId: v.string(),
  },
  handler: async (ctx, { storyId, viewerId, optionId }) => {
    await assertUserCanMutate(ctx, viewerId);
    const story = await ctx.db.get(storyId);
    if (!story) throw new Error("Story not found");
    if (!story.poll) throw new Error("No poll on this story");
    if (story.expiresAt <= Date.now()) throw new Error("Story expired");
    if (story.userId === viewerId) {
      throw new Error("Cannot vote on your own story");
    }

    const existing = await ctx.db
      .query("storyPollVotes")
      .withIndex("by_story_voter", (q) =>
        q.eq("storyId", storyId).eq("voterId", viewerId),
      )
      .unique();
    if (existing) {
      return { poll: story.poll, alreadyVoted: true as const };
    }

    const opt = story.poll.options.find((o) => o.id === optionId);
    if (!opt) throw new Error("Invalid option");

    await ctx.db.insert("storyPollVotes", {
      storyId,
      voterId: viewerId,
      optionId,
      votedAt: Date.now(),
    });

    const nextOptions = story.poll.options.map((o) =>
      o.id === optionId ? { ...o, votes: o.votes + 1 } : o,
    );
    const nextPoll = {
      ...story.poll,
      options: nextOptions,
      totalVotes: story.poll.totalVotes + 1,
    };
    await ctx.db.patch(storyId, { poll: nextPoll });
    return { poll: nextPoll, alreadyVoted: false as const };
  },
});

export const recordView = mutation({
  args: {
    storyId: v.id("stories"),
    viewerId: v.id("users"),
  },
  handler: async (ctx, { storyId, viewerId }) => {
    await assertUserCanMutate(ctx, viewerId);
    const story = await ctx.db.get(storyId);
    if (!story) throw new Error("Story not found");
    if (story.expiresAt <= Date.now()) return { recorded: false };

    const existing = await ctx.db
      .query("storyViews")
      .withIndex("by_story_viewer", (q) =>
        q.eq("storyId", storyId).eq("viewerId", viewerId),
      )
      .unique();
    if (existing) return { recorded: false };

    await ctx.db.insert("storyViews", {
      storyId,
      viewerId,
      viewedAt: Date.now(),
    });
    return { recorded: true };
  },
});

/**
 * View list + like count — **story owner only**. Others get `null` (no leakage).
 */
export const getViewStats = query({
  args: {
    storyId: v.id("stories"),
    requesterUserId: v.id("users"),
  },
  handler: async (ctx, { storyId, requesterUserId }) => {
    const story = await ctx.db.get(storyId);
    if (!story) return null;
    if (story.userId !== requesterUserId) return null;

    const [views, likesLegacy, likesNew] = await Promise.all([
      ctx.db
        .query("storyViews")
        .withIndex("by_story", (q) => q.eq("storyId", storyId))
        .collect(),
      ctx.db
        .query("storyLikes")
        .withIndex("by_story", (q) => q.eq("storyId", storyId))
        .collect(),
      ctx.db
        .query("likes")
        .withIndex("by_target", (q) =>
          q.eq("targetType", "story").eq("targetId", String(storyId)),
        )
        .collect(),
    ]);

    const likerIds = new Set<string>();
    for (const row of likesLegacy) {
      likerIds.add(String(row.userId));
    }
    for (const row of likesNew) {
      likerIds.add(String(row.userId));
    }
    const likeCount = likerIds.size;

    const viewers = await Promise.all(
      views.map(async (view) => {
        const u = await ctx.db.get(view.viewerId);
        if (!u) return null;
        return {
          userId: u._id,
          username: u.username,
          fullName: u.fullName,
          profilePictureKey: u.profilePictureKey,
          profilePictureUrl: u.profilePictureUrl,
          profilePictureStorageRegion: u.profilePictureStorageRegion,
          likedByViewer: likerIds.has(String(u._id)),
          viewedAt: view.viewedAt,
        };
      }),
    );

    return {
      count: views.length,
      likeCount,
      viewers: viewers
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .sort((a, b) => {
          if (a.likedByViewer && !b.likedByViewer) return -1;
          if (!a.likedByViewer && b.likedByViewer) return 1;
          return b.viewedAt - a.viewedAt;
        }),
    };
  },
});

/** Someone else's story: only whether **you** liked it (no totals / viewer hints). */
export const getViewerSelfState = query({
  args: {
    storyId: v.id("stories"),
    viewerUserId: v.id("users"),
  },
  handler: async (ctx, { storyId, viewerUserId }) => {
    const story = await ctx.db.get(storyId);
    if (!story) return null;
    if (story.userId === viewerUserId) {
      return { likedByMe: false };
    }

    const unified = await ctx.db
      .query("likes")
      .withIndex("by_user_target", (q) =>
        q
          .eq("userId", viewerUserId)
          .eq("targetType", "story")
          .eq("targetId", String(storyId)),
      )
      .unique();
    if (unified) return { likedByMe: true };

    const legacy = await ctx.db
      .query("storyLikes")
      .withIndex("by_story_user", (q) =>
        q.eq("storyId", storyId).eq("userId", viewerUserId),
      )
      .unique();

    return { likedByMe: Boolean(legacy) };
  },
});

export const toggleStoryLike = mutation({
  args: {
    storyId: v.id("stories"),
    userId: v.id("users"),
  },
  handler: async (ctx, { storyId, userId }) => {
    await assertUserCanMutate(ctx, userId);
    const story = await ctx.db.get(storyId);
    if (!story) throw new Error("Story not found");
    if (story.expiresAt <= Date.now()) throw new Error("Story expired");
    if (story.userId === userId) {
      throw new Error("Cannot like your own story");
    }

    const targetId = String(storyId);
    const now = Date.now();

    const existing = await ctx.db
      .query("likes")
      .withIndex("by_user_target", (q) =>
        q
          .eq("userId", userId)
          .eq("targetType", "story")
          .eq("targetId", targetId),
      )
      .unique();

    const legacy = await ctx.db
      .query("storyLikes")
      .withIndex("by_story_user", (q) =>
        q.eq("storyId", storyId).eq("userId", userId),
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
      if (legacy) await ctx.db.delete(legacy._id);
      await onStoryUnlikedNotification(ctx, {
        storyId,
        likerId: userId,
        storyOwnerId: story.userId,
      });
      const likeCount = await countLikesForStory(ctx, storyId);
      await ctx.db.patch(storyId, { likeCount });
      return { liked: false, likeCount };
    }

    if (legacy) {
      await ctx.db.delete(legacy._id);
    }

    await ctx.db.insert("likes", {
      userId,
      targetType: "story",
      targetId,
      createdAt: now,
    });
    await onStoryLikedNotification(ctx, {
      storyId,
      likerId: userId,
      storyOwnerId: story.userId,
    });
    const likeCount = await countLikesForStory(ctx, storyId);
    await ctx.db.patch(storyId, { likeCount });
    return { liked: true, likeCount };
  },
});

/** Check if viewer has unviewed stories from a specific user (for profile ring) */
export const hasUnviewedStoriesFromUser = query({
  args: {
    targetUserId: v.id("users"),
    viewerUserId: v.id("users"),
  },
  handler: async (ctx, { targetUserId, viewerUserId }) => {
    const now = Date.now();

    // Get active stories from target user
    const activeStories = await ctx.db
      .query("stories")
      .withIndex("by_user_created", (q) => q.eq("userId", targetUserId))
      .filter((q) => q.gt(q.field("expiresAt"), now))
      .collect();

    if (activeStories.length === 0) {
      return { hasActiveStories: false, hasUnviewed: false };
    }

    // Check which stories the viewer has already viewed
    const viewedStoryIds = new Set<string>();
    for (const story of activeStories) {
      const view = await ctx.db
        .query("storyViews")
        .withIndex("by_story_viewer", (q) =>
          q.eq("storyId", story._id).eq("viewerId", viewerUserId),
        )
        .unique();
      if (view) {
        viewedStoryIds.add(String(story._id));
      }
    }

    // Has unviewed if not all stories have been viewed
    const hasUnviewed = activeStories.some(
      (story) => !viewedStoryIds.has(String(story._id)),
    );

    return { hasActiveStories: true, hasUnviewed };
  },
});

const MAX_REPLY_LEN = 500;

export const sendStoryReply = mutation({
  args: {
    storyId: v.id("stories"),
    authorId: v.id("users"),
    text: v.string(),
  },
  handler: async (ctx, { storyId, authorId, text }) => {
    await assertUserCanMutate(ctx, authorId);
    const story = await ctx.db.get(storyId);
    if (!story) throw new Error("Story not found");
    if (story.expiresAt <= Date.now()) throw new Error("Story expired");
    if (story.userId === authorId) {
      throw new Error("Cannot reply to your own story");
    }

    const trimmed = text.trim();
    if (!trimmed) throw new Error("Message cannot be empty");
    if (trimmed.length > MAX_REPLY_LEN) {
      throw new Error(`Message too long (max ${MAX_REPLY_LEN} characters)`);
    }

    await ctx.db.insert("storyReplies", {
      storyId,
      authorId,
      text: trimmed,
      createdAt: Date.now(),
    });

    try {
      const conversationId = await getOrCreateDirectConversationId(
        ctx,
        authorId,
        story.userId,
      );
      await appendOutboundChatMessage(ctx, {
        viewerId: authorId,
        conversationId,
        type: "text",
        text: trimmed,
        storyId,
      });
    } catch {
      /* Blocked / cannot DM — storyReplies row still stored */
    }

    return { sent: true };
  },
});

function storyPromptProfilePicUrl(user: Doc<"users"> | null): string | null {
  if (!user) return null;
  if (user.profilePictureUrl?.trim()) return user.profilePictureUrl.trim();
  if (user.profilePictureKey?.trim()) {
    return buildPublicMediaUrl(
      user.profilePictureKey,
      undefined,
      user.profilePictureStorageRegion,
    );
  }
  return null;
}

/** Hydrate story editor when user taps “Add yours” (reply flow). */
export const getStoryPromptForEditorReply = query({
  args: { promptId: v.id("storyPrompts") },
  handler: async (ctx, { promptId }) => {
    const row = await ctx.db.get(promptId);
    if (!row) return null;
    return { text: row.text };
  },
});

/** Sticker overlay + live counts / avatars for “Add yours” on a source story. */
export const getStoryPromptStickerOverlay = query({
  args: {
    storyId: v.id("stories"),
    viewerUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, { storyId, viewerUserId }) => {
    const story = await ctx.db.get(storyId);
    if (!story?.promptSticker) return null;
    const pz = story.promptSticker;
    const promptRow = await ctx.db.get(pz.promptId);
    if (!promptRow) return null;
    const viewer = viewerUserId != null ? await ctx.db.get(viewerUserId) : null;
    if (viewerUserId != null && viewerCannotAccessAppContent(viewer)) {
      return null;
    }

    const creator = await ctx.db.get(promptRow.creatorUserId);
    const previewUrls: string[] = [];
    const creatorPic = storyPromptProfilePicUrl(creator);
    if (creatorPic) previewUrls.push(creatorPic);

    const respRows = await ctx.db
      .query("storyPromptResponses")
      .withIndex("by_prompt_created", (q) => q.eq("promptId", pz.promptId))
      .order("desc")
      .take(16);

    const seen = new Set<string>([String(promptRow.creatorUserId)]);
    for (const r of respRows) {
      if (previewUrls.length >= 3) break;
      if (seen.has(String(r.userId))) continue;
      const u = await ctx.db.get(r.userId);
      if (!u) continue;
      if (
        viewerUserId != null &&
        !canViewerSeeTargetUserProfile(u, viewerUserId, viewer)
      ) {
        continue;
      }
      seen.add(String(r.userId));
      const url = storyPromptProfilePicUrl(u);
      if (url) previewUrls.push(url);
    }

    let myAlreadyResponded = false;
    if (viewerUserId) {
      const existing = await ctx.db
        .query("storyPromptResponses")
        .withIndex("by_prompt_user", (q) =>
          q.eq("promptId", pz.promptId).eq("userId", viewerUserId),
        )
        .unique();
      myAlreadyResponded = existing != null;
    }

    return {
      promptId: pz.promptId,
      text: pz.text,
      responsesCount: promptRow.responsesCount,
      layout: pz.layout,
      previewAvatarUrls: previewUrls.slice(0, 3),
      startedByUsername: creator?.username ?? "",
      isSourceStory: promptRow.sourceStoryId === storyId,
      myAlreadyResponded,
    };
  },
});

/** Grid cells for the prompt response sheet (visibility-respecting). */
export const listStoryPromptResponsesForViewer = query({
  args: {
    promptId: v.id("storyPrompts"),
    viewerUserId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { promptId, viewerUserId, limit }) => {
    const promptRow = await ctx.db.get(promptId);
    if (!promptRow) return [];
    const viewer = viewerUserId != null ? await ctx.db.get(viewerUserId) : null;
    if (viewerUserId != null && viewerCannotAccessAppContent(viewer)) {
      return [];
    }
    const cap = Math.min(60, Math.max(1, limit ?? 30));
    const rows = await ctx.db
      .query("storyPromptResponses")
      .withIndex("by_prompt_created", (q) => q.eq("promptId", promptId))
      .order("desc")
      .take(120);

    const now = Date.now();
    const out: {
      storyId: Id<"stories">;
      mediaKey: string;
      mediaType: "image" | "video";
      mediaStorageRegion?: string;
      userId: Id<"users">;
      thumbUrl: string | null;
    }[] = [];

    for (const r of rows) {
      if (out.length >= cap) break;
      const s = await ctx.db.get(r.storyId);
      if (!s || s.expiresAt <= now) continue;
      const author = await ctx.db.get(s.userId);
      if (!author) continue;
      if (
        viewerUserId != null &&
        !canViewerSeeTargetUserProfile(author, viewerUserId, viewer)
      ) {
        continue;
      }
      const thumbUrl = buildPublicMediaUrl(
        s.mediaKey,
        undefined,
        s.mediaStorageRegion,
      );
      out.push({
        storyId: s._id,
        mediaKey: s.mediaKey,
        mediaType: s.mediaType,
        ...(s.mediaStorageRegion
          ? { mediaStorageRegion: s.mediaStorageRegion }
          : {}),
        userId: s.userId,
        thumbUrl,
      });
    }
    return out;
  },
});

export const listRecentStoryEmojiReactions = query({
  args: { storyId: v.id("stories") },
  handler: async (ctx, { storyId }) => {
    const story = await ctx.db.get(storyId);
    if (!story || story.expiresAt <= Date.now()) return [];

    const rows = await ctx.db
      .query("storyEmojiReactions")
      .withIndex("by_story_created", (q) => q.eq("storyId", storyId))
      .order("desc")
      .take(80);

    return rows.map((r) => ({
      _id: r._id,
      userId: r.userId,
      emoji: r.emoji,
      createdAt: r.createdAt,
    }));
  },
});

export const sendStoryEmojiReaction = mutation({
  args: {
    storyId: v.id("stories"),
    userId: v.id("users"),
    emoji: v.string(),
  },
  handler: async (ctx, { storyId, userId, emoji }) => {
    await assertUserCanMutate(ctx, userId);
    if (!STORY_QUICK_REACTION_EMOJI_SET.has(emoji)) {
      throw new Error("Invalid reaction");
    }

    const story = await ctx.db.get(storyId);
    if (!story) throw new Error("Story not found");
    if (story.expiresAt <= Date.now()) throw new Error("Story expired");
    if (story.userId === userId) {
      throw new Error("Cannot react to your own story");
    }

    const now = Date.now();
    const recent = await ctx.db
      .query("storyEmojiReactions")
      .withIndex("by_story_user", (q) =>
        q.eq("storyId", storyId).eq("userId", userId),
      )
      .filter((q) =>
        q.gt(q.field("createdAt"), now - STORY_QUICK_REACTION_RATE_WINDOW_MS),
      )
      .take(STORY_QUICK_REACTION_MAX_PER_WINDOW + 1);

    if (recent.length >= STORY_QUICK_REACTION_MAX_PER_WINDOW) {
      throw new Error("Slow down");
    }

    const reactionId = await ctx.db.insert("storyEmojiReactions", {
      storyId,
      userId,
      emoji,
      createdAt: now,
    });

    const countKey = EMOJI_TO_REACTION_COUNT_KEY[emoji];
    if (!countKey) throw new Error("Invalid reaction key");
    const counts = { ...(story.emojiReactionCounts ?? {}) };
    counts[countKey] = (counts[countKey] ?? 0) + 1;
    await ctx.db.patch(storyId, { emojiReactionCounts: counts });

    try {
      const conversationId = await getOrCreateDirectConversationId(
        ctx,
        userId,
        story.userId,
      );
      await appendOutboundChatMessage(ctx, {
        viewerId: userId,
        conversationId,
        type: "text",
        text: emoji,
        storyId,
      });
    } catch {
      /* Same as IG when DM can't be opened — on-story reaction still applies */
    }

    return { reactionId };
  },
});

// ─── Notify sticker: subscription query + toggle mutations ──────────────────

export const getMyStoryNotifySubscription = query({
  args: {
    storyId: v.id("stories"),
    viewerId: v.id("users"),
  },
  handler: async (ctx, { storyId, viewerId }) => {
    const row = await ctx.db
      .query("storyNotifySubscriptions")
      .withIndex("by_story_subscriber", (q) =>
        q.eq("storyId", storyId).eq("subscriberId", viewerId),
      )
      .unique();
    return { subscribed: Boolean(row) };
  },
});

export const subscribeStoryNotify = mutation({
  args: {
    storyId: v.id("stories"),
    viewerId: v.id("users"),
  },
  handler: async (ctx, { storyId, viewerId }) => {
    await assertUserCanMutate(ctx, viewerId);
    const story = await ctx.db.get(storyId);
    if (!story) throw new Error("Story not found");
    if (!story.notifySticker) throw new Error("No notify sticker on this story");
    if (story.expiresAt <= Date.now()) throw new Error("Story expired");
    if (story.userId === viewerId) throw new Error("Cannot subscribe to your own notify sticker");
    const existing = await ctx.db
      .query("storyNotifySubscriptions")
      .withIndex("by_story_subscriber", (q) =>
        q.eq("storyId", storyId).eq("subscriberId", viewerId),
      )
      .unique();
    if (existing) return { ok: true as const, already: true as const };
    await ctx.db.insert("storyNotifySubscriptions", {
      storyId,
      creatorId: story.userId,
      subscriberId: viewerId,
      createdAt: Date.now(),
    });
    const ns = story.notifySticker;
    await ctx.db.patch(storyId, {
      notifySticker: {
        ...ns,
        subscriberCount: ns.subscriberCount + 1,
      },
    });
    return { ok: true as const, already: false as const };
  },
});

export const unsubscribeStoryNotify = mutation({
  args: {
    storyId: v.id("stories"),
    viewerId: v.id("users"),
  },
  handler: async (ctx, { storyId, viewerId }) => {
    await assertUserCanMutate(ctx, viewerId);
    const existing = await ctx.db
      .query("storyNotifySubscriptions")
      .withIndex("by_story_subscriber", (q) =>
        q.eq("storyId", storyId).eq("subscriberId", viewerId),
      )
      .unique();
    if (!existing) return { ok: true as const, removed: false as const };
    await ctx.db.delete(existing._id);
    const story = await ctx.db.get(storyId);
    if (story?.notifySticker) {
      const ns = story.notifySticker;
      await ctx.db.patch(storyId, {
        notifySticker: {
          ...ns,
          subscriberCount: Math.max(0, ns.subscriberCount - 1),
        },
      });
    }
    return { ok: true as const, removed: true as const };
  },
});

// ─── Emoji Slider: vote query + submit mutation ──────────────────────────────

export const getMyEmojiSliderVote = query({
  args: {
    storyId: v.id("stories"),
    viewerId: v.id("users"),
  },
  handler: async (ctx, { storyId, viewerId }) => {
    const row = await ctx.db
      .query("storyEmojiSliderVotes")
      .withIndex("by_story_voter", (q) =>
        q.eq("storyId", storyId).eq("voterId", viewerId),
      )
      .unique();
    return row ? { voted: true, value: row.value } : { voted: false, value: null };
  },
});

export const submitEmojiSliderVote = mutation({
  args: {
    storyId: v.id("stories"),
    viewerId: v.id("users"),
    /** Integer 0–100. */
    value: v.number(),
  },
  handler: async (ctx, { storyId, viewerId, value }) => {
    await assertUserCanMutate(ctx, viewerId);
    const story = await ctx.db.get(storyId);
    if (!story) throw new Error("Story not found");
    if (!story.emojiSliderSticker) throw new Error("No emoji slider on this story");
    if (story.expiresAt <= Date.now()) throw new Error("Story expired");
    if (story.userId === viewerId) throw new Error("Cannot vote on your own story");
    const safeVal = Math.max(0, Math.min(100, Math.round(value)));
    const existing = await ctx.db
      .query("storyEmojiSliderVotes")
      .withIndex("by_story_voter", (q) =>
        q.eq("storyId", storyId).eq("voterId", viewerId),
      )
      .unique();
    if (existing) {
      // Update in place and recompute average
      await ctx.db.patch(existing._id, { value: safeVal, votedAt: Date.now() });
      const allVotes = await ctx.db
        .query("storyEmojiSliderVotes")
        .withIndex("by_story", (q) => q.eq("storyId", storyId))
        .collect();
      const avg =
        allVotes.reduce((s, r) => s + r.value, 0) / Math.max(1, allVotes.length);
      const es = story.emojiSliderSticker;
      await ctx.db.patch(storyId, {
        emojiSliderSticker: {
          ...es,
          averageValue: Math.round(avg * 10) / 10,
        },
      });
      return { ok: true as const };
    }
    await ctx.db.insert("storyEmojiSliderVotes", {
      storyId,
      creatorId: story.userId,
      voterId: viewerId,
      value: safeVal,
      votedAt: Date.now(),
    });
    const es = story.emojiSliderSticker;
    const newCount = es.voteCount + 1;
    const newAvg = (es.averageValue * es.voteCount + safeVal) / newCount;
    await ctx.db.patch(storyId, {
      emojiSliderSticker: {
        ...es,
        voteCount: newCount,
        averageValue: Math.round(newAvg * 10) / 10,
      },
    });
    return { ok: true as const };
  },
});
