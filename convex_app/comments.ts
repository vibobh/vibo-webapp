/**
 * Comments System
 *
 * Handles all comment operations:
 * - Add comments to posts
 * - Reply to comments (nested threads)
 * - Like/unlike comments
 * - Delete comments
 * - Get comments with pagination
 */

import { v } from "convex/values";
import { api } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { insertPostCounterDelta } from "./postCounterDeltas";
import { assertUserCanMutate } from "./accountModeration";
import { insertCommentPostProductEvent } from "./productAnalytics";
import {
  type VerificationTier,
  verificationTierPayload,
} from "./verificationTier";
import { usersBlockedEitherWay } from "./viewerContentFilters";

// ============================================
// TYPES
// ============================================

export interface CommentWithAuthor extends Doc<"comments"> {
  author: {
    _id: Id<"users">;
    username: string;
    fullName?: string;
    profilePictureUrl?: string;
    profilePictureKey?: string;
    verificationPending?: true;
    verificationTier?: VerificationTier;
  } | null;
  isLiked: boolean;
  isDisliked: boolean;
  replies?: CommentWithAuthor[];
  mentions?: Array<{ userId: Id<"users">; username: string }>;
}

/**
 * Limits for nested reply trees (shared by list + expand queries).
 * PERFORMANCE: Reduced limits for faster initial load.
 */
const REPLIES_PER_LEVEL = 4;
const NESTED_REPLY_DEPTH = 1; // Only 1 level deep - load more on demand
const COMMENTS_PAGE_SIZE = 20; // Default page size for comments
/** Recent top-level pool to rank (Instagram-style relevance within a bounded set). */
const RANK_POOL_TOP_LEVEL = 260;
const RANK_POOL_REPLIES = 140;

const COMMENT_RANK_LIKE_WEIGHT = 2.8;
const COMMENT_RANK_FOLLOWING_BOOST = 400;
const COMMENT_RANK_VERIFIED_BOOST = 155;
const COMMENT_RANK_REPLY_WEIGHT = 14;
const COMMENT_RANK_VIEWER_LIKED_BOOST = 95;
const COMMENT_RANK_RECENCY_MAX = 108;
const COMMENT_RANK_RECENCY_HALF_LIFE_MS = 40 * 3600 * 1000;

function authorShowsVerifiedBadge(
  author: Doc<"users"> | null | undefined,
): boolean {
  if (!author) return false;
  if (author.verificationPending === true) return false;
  const t = author.verificationTier;
  return t === "blue" || t === "gold" || t === "gray";
}

function commentRankScore(
  comment: Doc<"comments">,
  author: Doc<"users"> | null | undefined,
  now: number,
  opts: { viewerFollowsAuthor: boolean; viewerLiked: boolean },
): number {
  const likes = comment.likeCount ?? 0;
  const replies = comment.replyCount ?? 0;
  const ageMs = Math.max(0, now - comment.createdAt);
  const recency =
    COMMENT_RANK_RECENCY_MAX *
    Math.exp(-ageMs / COMMENT_RANK_RECENCY_HALF_LIFE_MS);
  let s =
    likes * COMMENT_RANK_LIKE_WEIGHT +
    replies * COMMENT_RANK_REPLY_WEIGHT +
    recency;
  if (opts.viewerFollowsAuthor) s += COMMENT_RANK_FOLLOWING_BOOST;
  if (authorShowsVerifiedBadge(author)) s += COMMENT_RANK_VERIFIED_BOOST;
  if (opts.viewerLiked) s += COMMENT_RANK_VIEWER_LIKED_BOOST;
  return s;
}

async function buildFollowingSetForAuthors(
  ctx: any,
  viewerId: Id<"users">,
  authorIds: Id<"users">[],
): Promise<Set<string>> {
  const out = new Set<string>();
  await Promise.all(
    authorIds.map(async (fid) => {
      const row = await ctx.db
        .query("follows")
        .withIndex("by_follower_following", (q: any) =>
          q.eq("followerId", viewerId).eq("followingId", fid),
        )
        .first();
      if (row && row.status === "active") {
        out.add(String(fid));
      }
    }),
  );
  return out;
}

function isTopLevelComment(doc: Doc<"comments">): boolean {
  return doc.parentCommentId === undefined;
}

async function selectRankedTopLevelDocs(
  ctx: any,
  args: {
    postId: Id<"posts">;
    limit: number;
    offset: number;
    viewerId: Id<"users"> | undefined;
  },
): Promise<{
  pageDocs: Doc<"comments">[];
  nextOffset: number | undefined;
  effectivePinnedCommentId: Id<"comments"> | undefined;
}> {
  const now = Date.now();
  const { postId, limit, offset, viewerId } = args;

  const post = await ctx.db.get(postId);
  let pinnedDoc: Doc<"comments"> | null = null;
  if (post?.pinnedCommentId) {
    const p = await ctx.db.get(post.pinnedCommentId);
    if (
      p &&
      !p.isDeleted &&
      isTopLevelComment(p) &&
      String(p.postId) === String(postId)
    ) {
      pinnedDoc = p;
    }
  }
  /** Legacy rows: `pinnedAt` on comments before `posts.pinnedCommentId` existed. */
  if (!pinnedDoc) {
    const pinnedRaw = (await ctx.db
      .query("comments")
      .withIndex("by_post_pinned", (q: any) => q.eq("postId", postId))
      .order("asc")
      .take(48)) as Doc<"comments">[];
    const legacyCandidates = pinnedRaw.filter(
      (c: Doc<"comments">) =>
        !c.isDeleted && isTopLevelComment(c) && c.pinnedAt !== undefined,
    );
    for (const c of legacyCandidates) {
      if (!pinnedDoc || (c.pinnedAt ?? 0) > (pinnedDoc.pinnedAt ?? 0)) {
        pinnedDoc = c;
      }
    }
  }

  const pinnedIdSet = pinnedDoc
    ? new Set<string>([String(pinnedDoc._id)])
    : new Set<string>();

  const pool = (await ctx.db
    .query("comments")
    .withIndex("by_post_parent", (q: any) =>
      q.eq("postId", postId).eq("parentCommentId", undefined),
    )
    .filter((q: any) => q.neq(q.field("isDeleted"), true))
    .order("desc")
    .take(RANK_POOL_TOP_LEVEL)) as Doc<"comments">[];

  const candidates = pool.filter(
    (c: Doc<"comments">) => !pinnedIdSet.has(String(c._id)),
  );

  const authorIds = [
    ...new Set(candidates.map((c: Doc<"comments">) => c.authorId)),
  ];
  const authors = await Promise.all(authorIds.map((id) => ctx.db.get(id)));
  const authorMap = new Map(authorIds.map((id, i) => [id, authors[i]]));

  const followingSet =
    viewerId && authorIds.length > 0
      ? await buildFollowingSetForAuthors(ctx, viewerId, authorIds)
      : new Set<string>();

  const commentReactionRowById = new Map<string, Doc<"commentLikes">>();
  if (viewerId && candidates.length > 0) {
    const likes = await ctx.db
      .query("commentLikes")
      .withIndex("by_user", (q: any) => q.eq("userId", viewerId))
      .take(240);
    for (const like of likes) {
      if (candidates.some((c: Doc<"comments">) => c._id === like.commentId)) {
        commentReactionRowById.set(String(like.commentId), like);
      }
    }
  }

  const scored = candidates.map((doc: Doc<"comments">) => {
    const author = authorMap.get(doc.authorId);
    const v = viewerCommentVoteFromRow(
      commentReactionRowById.get(String(doc._id)) ?? null,
    );
    return {
      doc,
      score: commentRankScore(doc, author ?? null, now, {
        viewerFollowsAuthor: viewerId
          ? followingSet.has(String(doc.authorId))
          : false,
        viewerLiked: v.isLiked,
      }),
    };
  });

  scored.sort(
    (
      a: { doc: Doc<"comments">; score: number },
      b: { doc: Doc<"comments">; score: number },
    ) => {
      const d = b.score - a.score;
      if (Math.abs(d) > 1e-9) return d;
      return b.doc.createdAt - a.doc.createdAt;
    },
  );

  const rankedSlice = scored.slice(offset, offset + limit);
  /** Pinned comment is first on page 0 so it stays above the ranked list (not score-sorted). */
  const pageDocs =
    offset === 0 && pinnedDoc
      ? [
          pinnedDoc,
          ...rankedSlice.map((x: { doc: Doc<"comments"> }) => x.doc),
        ]
      : rankedSlice.map((x: { doc: Doc<"comments"> }) => x.doc);

  const nextOffset =
    scored.length > offset + rankedSlice.length
      ? offset + rankedSlice.length
      : undefined;

  return {
    pageDocs,
    nextOffset,
    effectivePinnedCommentId: pinnedDoc?._id,
  };
}

/** Instagram-style handles in comment text (matches app username normalization). */
const COMMENT_MENTION_HANDLE_RE = /@([a-z0-9_]+(?:\.[a-z0-9_]+)*)/gi;

async function resolveMentionsFromCommentText(
  ctx: any,
  text: string,
): Promise<Array<{ userId: Id<"users">; username: string }>> {
  const seen = new Set<string>();
  const mentions: Array<{ userId: Id<"users">; username: string }> = [];
  const re = new RegExp(COMMENT_MENTION_HANDLE_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const handle = m[1].toLowerCase();
    if (seen.has(handle)) continue;
    seen.add(handle);
    const u = await ctx.db
      .query("users")
      .withIndex("by_username", (q: any) => q.eq("username", handle))
      .unique();
    if (u?.username) {
      mentions.push({ userId: u._id, username: u.username });
    }
  }
  return mentions;
}

async function resolveAvatarForComment(
  ctx: any,
  u: Doc<"users"> | null | undefined,
): Promise<string | undefined> {
  if (!u) return undefined;
  if (u.profilePictureStorageId) {
    const url = await ctx.storage.getUrl(u.profilePictureStorageId);
    if (url) return url;
  }
  return u.profilePictureUrl;
}

function commentAuthorPublicFields(
  author: Doc<"users">,
  profilePictureUrl: string | undefined,
) {
  return {
    _id: author._id,
    username: author.username || "user",
    fullName: author.fullName,
    profilePictureUrl,
    profilePictureKey: author.profilePictureKey,
    ...(author.verificationPending === true
      ? { verificationPending: true as const }
      : {}),
    ...verificationTierPayload(author),
  };
}

function viewerCommentVoteFromRow(
  row: Doc<"commentLikes"> | null | undefined,
): { isLiked: boolean; isDisliked: boolean } {
  if (!row) return { isLiked: false, isDisliked: false };
  if (row.reaction === "down") return { isLiked: false, isDisliked: true };
  return { isLiked: true, isDisliked: false };
}

async function enrichCommentDocWithAuthor(
  ctx: any,
  userId: Id<"users"> | undefined,
  doc: Doc<"comments">,
) {
  const [replyAuthor, replyLike] = await Promise.all([
    ctx.db.get(doc.authorId),
    userId
      ? ctx.db
          .query("commentLikes")
          .withIndex("by_user_comment", (q: any) =>
            q.eq("userId", userId).eq("commentId", doc._id),
          )
          .first()
      : null,
  ]);
  const replyAvatarUrl = await resolveAvatarForComment(ctx, replyAuthor);
  const v = viewerCommentVoteFromRow(replyLike ?? null);
  return {
    ...doc,
    author: replyAuthor
      ? commentAuthorPublicFields(replyAuthor, replyAvatarUrl)
      : null,
    isLiked: v.isLiked,
    isDisliked: v.isDisliked,
  };
}

async function enrichCommentWithNestedReplies(
  ctx: any,
  userId: Id<"users"> | undefined,
  doc: Doc<"comments">,
  remainingDepth: number,
): Promise<CommentWithAuthor> {
  const now = Date.now();
  const base = await enrichCommentDocWithAuthor(ctx, userId, doc);
  if (remainingDepth <= 0) {
    return base as CommentWithAuthor;
  }
  const childPool = (await ctx.db
    .query("comments")
    .withIndex("by_parent", (q: any) => q.eq("parentCommentId", doc._id))
    .filter((q: any) => q.neq(q.field("isDeleted"), true))
    .order("desc")
    .take(RANK_POOL_REPLIES)) as Doc<"comments">[];
  if (childPool.length === 0) {
    return base as CommentWithAuthor;
  }
  const childAuthorIds = [
    ...new Set(childPool.map((c: Doc<"comments">) => c.authorId)),
  ];
  const childAuthors = await Promise.all(
    childAuthorIds.map((id: Id<"users">) => ctx.db.get(id)),
  );
  const childAuthorMap = new Map(
    childAuthorIds.map((id, i) => [id, childAuthors[i]]),
  );
  const followingSet =
    userId && childAuthorIds.length > 0
      ? await buildFollowingSetForAuthors(ctx, userId, childAuthorIds)
      : new Set<string>();
  const childVoteMap = new Map<string, Doc<"commentLikes">>();
  if (userId && childPool.length > 0) {
    const likes = await ctx.db
      .query("commentLikes")
      .withIndex("by_user", (q: any) => q.eq("userId", userId))
      .take(200);
    for (const like of likes) {
      if (childPool.some((c: Doc<"comments">) => c._id === like.commentId)) {
        childVoteMap.set(String(like.commentId), like);
      }
    }
  }
  const rankedChildren = [...childPool].sort((a, b) => {
    const authorA = childAuthorMap.get(a.authorId);
    const authorB = childAuthorMap.get(b.authorId);
    const va = viewerCommentVoteFromRow(
      childVoteMap.get(String(a._id)) ?? null,
    );
    const vb = viewerCommentVoteFromRow(
      childVoteMap.get(String(b._id)) ?? null,
    );
    const sa = commentRankScore(a, authorA ?? null, now, {
      viewerFollowsAuthor: userId
        ? followingSet.has(String(a.authorId))
        : false,
      viewerLiked: va.isLiked,
    });
    const sb = commentRankScore(b, authorB ?? null, now, {
      viewerFollowsAuthor: userId
        ? followingSet.has(String(b.authorId))
        : false,
      viewerLiked: vb.isLiked,
    });
    const d = sb - sa;
    if (Math.abs(d) > 1e-9) return d;
    return b.createdAt - a.createdAt;
  });
  const children = rankedChildren.slice(0, REPLIES_PER_LEVEL);
  const nested = await Promise.all(
    children.map((c: Doc<"comments">) =>
      enrichCommentWithNestedReplies(ctx, userId, c, remainingDepth - 1),
    ),
  );
  return { ...base, replies: nested } as CommentWithAuthor;
}

type CommentUserVote = "none" | "up" | "down";

function currentCommentUserVote(
  row: Doc<"commentLikes"> | null | undefined,
): CommentUserVote {
  if (!row) return "none";
  return row.reaction === "down" ? "down" : "up";
}

async function applyCommentVote(
  ctx: MutationCtx,
  commentId: Id<"comments">,
  userId: Id<"users">,
  direction: "up" | "down",
): Promise<{
  userVote: CommentUserVote;
  likeCount: number;
  dislikeCount: number;
}> {
  await assertUserCanMutate(ctx, userId);
  const comment = await ctx.db.get(commentId);
  if (!comment || comment.isDeleted) throw new Error("Comment not found");

  if (String(comment.authorId) !== String(userId)) {
    if (await usersBlockedEitherWay(ctx, userId, comment.authorId)) {
      throw new Error("Interaction not allowed");
    }
  }

  const existing = await ctx.db
    .query("commentLikes")
    .withIndex("by_user_comment", (q) =>
      q.eq("userId", userId).eq("commentId", commentId),
    )
    .first();

  const current = currentCommentUserVote(existing ?? null);

  let next: CommentUserVote;
  if (direction === "up") {
    next = current === "up" ? "none" : "up";
  } else {
    next = current === "down" ? "none" : "down";
  }

  let likeDelta = 0;
  let dislikeDelta = 0;
  if (current === "up" && next === "none") likeDelta = -1;
  else if (current === "up" && next === "down") {
    likeDelta = -1;
    dislikeDelta = 1;
  } else if (current === "down" && next === "none") dislikeDelta = -1;
  else if (current === "down" && next === "up") {
    dislikeDelta = -1;
    likeDelta = 1;
  } else if (current === "none" && next === "up") likeDelta = 1;
  else if (current === "none" && next === "down") dislikeDelta = 1;

  if (next === "none") {
    if (existing) await ctx.db.delete(existing._id);
  } else if (existing) {
    if (next === "down") {
      await ctx.db.patch(existing._id, { reaction: "down" });
    } else {
      await ctx.db.patch(existing._id, { reaction: undefined });
    }
  } else {
    await ctx.db.insert("commentLikes", {
      commentId,
      userId,
      createdAt: Date.now(),
      ...(next === "down" ? { reaction: "down" as const } : {}),
    });
  }

  const newLikeCount = Math.max(0, (comment.likeCount || 0) + likeDelta);
  const newDislikeCount = Math.max(
    0,
    (comment.dislikeCount || 0) + dislikeDelta,
  );
  await ctx.db.patch(commentId, {
    likeCount: newLikeCount,
    dislikeCount: newDislikeCount,
  });

  return {
    userVote: next,
    likeCount: newLikeCount,
    dislikeCount: newDislikeCount,
  };
}

// ============================================
// QUERIES
// ============================================

/**
 * Get comments for a post
 *
 * PERFORMANCE OPTIMIZED:
 * - Uses batch fetching for authors to reduce N+1 queries
 * - Limits reply depth for faster initial load
 * - Fetches likes in batch where possible
 */
export const getPostComments = query({
  args: {
    postId: v.id("posts"),
    limit: v.optional(v.number()),
    /** Pagination into the ranked slice; first page leads with the pinned comment when set. */
    offset: v.optional(v.number()),
    cursor: v.optional(v.number()),
    viewerUserId: v.optional(v.id("users")),
  },
  returns: v.object({
    comments: v.array(v.any()),
    nextOffset: v.optional(v.number()),
    /** Canonical pin for UI (post field or legacy winner); at most one id. */
    effectivePinnedCommentId: v.optional(v.id("comments")),
  }),
  handler: async (ctx, args) => {
    const viewerId =
      args.viewerUserId ?? ((ctx as any).userId as Id<"users"> | undefined);
    const limit = args.limit ?? COMMENTS_PAGE_SIZE;
    const offset = args.offset ?? 0;

    const { pageDocs, nextOffset, effectivePinnedCommentId } =
      await selectRankedTopLevelDocs(ctx, {
        postId: args.postId,
        limit,
        offset,
        viewerId,
      });

    if (pageDocs.length === 0) {
      return {
        comments: [],
        nextOffset: undefined,
        effectivePinnedCommentId,
      };
    }

    const enrichedComments = await Promise.all(
      pageDocs.map((doc) =>
        enrichCommentWithNestedReplies(ctx, viewerId, doc, NESTED_REPLY_DEPTH),
      ),
    );

    return {
      comments: enrichedComments,
      nextOffset,
      effectivePinnedCommentId,
    };
  },
});

/**
 * Get comments for a post (lightweight - no nested replies, just counts)
 * Much faster for initial comment sheet open.
 *
 * PERFORMANCE OPTIMIZED:
 * - Uses batch fetching for all authors at once
 * - Fetches likes in batch
 * - Counts replies efficiently
 * - Returns minimal data for instant UI display
 */
export const getPostCommentsLight = query({
  args: {
    postId: v.id("posts"),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
    cursor: v.optional(v.number()),
    viewerUserId: v.optional(v.id("users")),
  },
  returns: v.object({
    comments: v.array(v.any()),
    nextOffset: v.optional(v.number()),
    effectivePinnedCommentId: v.optional(v.id("comments")),
  }),
  handler: async (ctx, args) => {
    const viewerId =
      args.viewerUserId ?? ((ctx as any).userId as Id<"users"> | undefined);
    const limit = Math.min(args.limit ?? COMMENTS_PAGE_SIZE, 30);
    const offset = args.offset ?? 0;

    const { pageDocs, nextOffset, effectivePinnedCommentId } =
      await selectRankedTopLevelDocs(ctx, {
        postId: args.postId,
        limit,
        offset,
        viewerId,
      });

    if (pageDocs.length === 0) {
      return {
        comments: [],
        nextOffset: undefined,
        effectivePinnedCommentId,
      };
    }

    const authorIds = [...new Set(pageDocs.map((c) => c.authorId))];
    const authors = await Promise.all(authorIds.map((id) => ctx.db.get(id)));
    const authorMap = new Map(authorIds.map((id, i) => [id, authors[i]]));

    const commentReactionRowById = new Map<string, Doc<"commentLikes">>();
    if (viewerId) {
      const likes = await ctx.db
        .query("commentLikes")
        .withIndex("by_user", (q) => q.eq("userId", viewerId))
        .take(240);
      for (const like of likes) {
        if (pageDocs.some((c) => c._id === like.commentId)) {
          commentReactionRowById.set(String(like.commentId), like);
        }
      }
    }

    const replyCounts = await Promise.all(
      pageDocs.map((comment) =>
        ctx.db
          .query("comments")
          .withIndex("by_parent", (q) => q.eq("parentCommentId", comment._id))
          .filter((q) => q.neq(q.field("isDeleted"), true))
          .collect()
          .then((replies) => replies.length),
      ),
    );

    const enrichedComments: CommentWithAuthor[] = [];
    for (let i = 0; i < pageDocs.length; i++) {
      const comment = pageDocs[i];
      const author = authorMap.get(comment.authorId);
      const authorAvatarUrl = await resolveAvatarForComment(ctx, author);

      const lv = viewerCommentVoteFromRow(
        commentReactionRowById.get(String(comment._id)) ?? null,
      );
      enrichedComments.push({
        ...comment,
        author: author
          ? commentAuthorPublicFields(author, authorAvatarUrl)
          : null,
        isLiked: lv.isLiked,
        isDisliked: lv.isDisliked,
        replies: [],
        replyCount: replyCounts[i],
      });
    }

    return {
      comments: enrichedComments,
      nextOffset,
      effectivePinnedCommentId,
    };
  },
});

/**
 * Get replies to a specific comment
 */
export const getCommentReplies = query({
  args: {
    commentId: v.id("comments"),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
    cursor: v.optional(v.number()),
    threaded: v.optional(v.boolean()),
    viewerUserId: v.optional(v.id("users")),
  },
  returns: v.object({
    replies: v.array(v.any()),
    nextOffset: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const userId =
      args.viewerUserId ?? ((ctx as any).userId as Id<"users"> | undefined);
    const threaded = args.threaded === true;
    const limit = args.limit ?? (threaded ? 100 : 20);
    const offset = args.offset ?? 0;
    const now = Date.now();

    const pool = (await ctx.db
      .query("comments")
      .withIndex("by_parent", (q) => q.eq("parentCommentId", args.commentId))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .order("desc")
      .take(RANK_POOL_REPLIES)) as Doc<"comments">[];

    const authorIds = [
      ...new Set(pool.map((c: Doc<"comments">) => c.authorId)),
    ];
    const authors = await Promise.all(authorIds.map((id) => ctx.db.get(id)));
    const authorMap = new Map(authorIds.map((id, i) => [id, authors[i]]));

    const followingSet =
      userId && authorIds.length > 0
        ? await buildFollowingSetForAuthors(ctx, userId, authorIds)
        : new Set<string>();

    const voteMap = new Map<string, Doc<"commentLikes">>();
    if (userId && pool.length > 0) {
      const likes = await ctx.db
        .query("commentLikes")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(240);
      for (const like of likes) {
        if (pool.some((c) => c._id === like.commentId)) {
          voteMap.set(String(like.commentId), like);
        }
      }
    }

    const scored = pool.map((doc) => {
      const author = authorMap.get(doc.authorId);
      const v = viewerCommentVoteFromRow(voteMap.get(String(doc._id)) ?? null);
      return {
        doc,
        score: commentRankScore(doc, author ?? null, now, {
          viewerFollowsAuthor: userId
            ? followingSet.has(String(doc.authorId))
            : false,
          viewerLiked: v.isLiked,
        }),
      };
    });
    scored.sort(
      (
        a: { doc: Doc<"comments">; score: number },
        b: { doc: Doc<"comments">; score: number },
      ) => {
        const d = b.score - a.score;
        if (Math.abs(d) > 1e-9) return d;
        return b.doc.createdAt - a.doc.createdAt;
      },
    );

    const sliceDocs = scored
      .slice(offset, offset + limit)
      .map((x: { doc: Doc<"comments"> }) => x.doc);
    const nextOffset =
      scored.length > offset + sliceDocs.length
        ? offset + sliceDocs.length
        : undefined;

    const enrichedReplies = threaded
      ? await Promise.all(
          sliceDocs.map((reply) =>
            enrichCommentWithNestedReplies(
              ctx,
              userId,
              reply,
              NESTED_REPLY_DEPTH,
            ),
          ),
        )
      : await Promise.all(
          sliceDocs.map(async (reply) => {
            const base = await enrichCommentDocWithAuthor(ctx, userId, reply);
            return base;
          }),
        );

    return {
      replies: enrichedReplies,
      nextOffset,
    };
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Pin or unpin a top-level comment (post author only).
 * At most one pin per post, stored on `posts.pinnedCommentId` (replaces any previous pin).
 */
export const setCommentPinned = mutation({
  args: {
    commentId: v.id("comments"),
    userId: v.id("users"),
    pinned: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await assertUserCanMutate(ctx, args.userId);
    const comment = await ctx.db.get(args.commentId);
    if (!comment || comment.isDeleted) throw new Error("Comment not found");
    if (comment.parentCommentId !== undefined) {
      throw new Error("Only top-level comments can be pinned");
    }
    const post = await ctx.db.get(comment.postId);
    if (!post || post.userId !== args.userId) {
      throw new Error("Only the post author can pin comments");
    }

    if (!args.pinned) {
      if (String(post.pinnedCommentId ?? "") === String(comment._id)) {
        await ctx.db.patch(post._id, { pinnedCommentId: undefined });
      }
      await ctx.db.patch(args.commentId, { pinnedAt: undefined });
      return null;
    }

    const legacyPins = (await ctx.db
      .query("comments")
      .withIndex("by_post_pinned", (q: any) => q.eq("postId", comment.postId))
      .order("asc")
      .take(64)) as Doc<"comments">[];
    for (const c of legacyPins) {
      if (
        !c.isDeleted &&
        c.parentCommentId === undefined &&
        c.pinnedAt !== undefined
      ) {
        await ctx.db.patch(c._id, { pinnedAt: undefined });
      }
    }

    await ctx.db.patch(post._id, { pinnedCommentId: args.commentId });
    return null;
  },
});

/**
 * Add a comment to a post
 */
export const addComment = mutation({
  args: {
    postId: v.id("posts"),
    text: v.string(),
    parentCommentId: v.optional(v.id("comments")),
    userId: v.id("users"),
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
  },
  returns: v.id("comments"),
  handler: async (ctx, args): Promise<Id<"comments">> => {
    const userId = args.userId;
    await assertUserCanMutate(ctx, userId);

    const trimmed = args.text.trim();
    if (!trimmed && !args.gifAttachment) {
      throw new Error("Comment cannot be empty");
    }

    // Validate post exists and is published
    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error("Post not found");
    if (post.status !== "published") throw new Error("Post not available");

    // Check if comments are enabled
    if (post.commentsEnabled === false) {
      throw new Error("Comments are disabled on this post");
    }

    if (String(post.userId) !== String(userId)) {
      if (await usersBlockedEitherWay(ctx, userId, post.userId)) {
        throw new Error("You cannot comment on this post");
      }
    }

    // Validate parent comment if provided
    if (args.parentCommentId) {
      const parentComment = await ctx.db.get(args.parentCommentId);
      if (!parentComment || parentComment.isDeleted) {
        throw new Error("Parent comment not found");
      }
      if (parentComment.postId !== args.postId) {
        throw new Error("Parent comment belongs to different post");
      }
      if (String(parentComment.authorId) !== String(userId)) {
        if (await usersBlockedEitherWay(ctx, userId, parentComment.authorId)) {
          throw new Error("You cannot reply to this comment");
        }
      }
    }

    // Create comment
    const now = Date.now();
    const mentions = trimmed
      ? await resolveMentionsFromCommentText(ctx, trimmed)
      : [];
    const commentId = await ctx.db.insert("comments", {
      postId: args.postId,
      authorId: userId,
      text: trimmed,
      ...(args.gifAttachment ? { gifAttachment: args.gifAttachment } : {}),
      ...(mentions.length > 0 ? { mentions } : {}),
      parentCommentId: args.parentCommentId,
      createdAt: now,
      likeCount: 0,
      dislikeCount: 0,
    });

    // Route commentCount increment through delta log to avoid OCC on the
    // `posts` row when many users comment concurrently.
    await insertPostCounterDelta(ctx, args.postId, "commentCount", 1);

    // Update parent comment reply count if applicable
    if (args.parentCommentId) {
      const parentComment = await ctx.db.get(args.parentCommentId);
      if (parentComment) {
        await ctx.db.patch(args.parentCommentId, {
          replyCount: (parentComment.replyCount || 0) + 1,
        });
      }
    }

    // Create notification for post owner (if not self-comment)
    if (post.userId !== userId) {
      await ctx.scheduler.runAfter(
        0,
        (api.notifications as any).internalCreateCommentNotification,
        {
          postId: args.postId,
          commentId,
          postAuthorId: post.userId,
          commenterId: userId,
          isReply: Boolean(args.parentCommentId),
        },
      );
    }

    for (const m of mentions) {
      await ctx.scheduler.runAfter(
        0,
        (api.notifications as any).internalCreateCommentMentionNotification,
        {
          postId: args.postId,
          mentionedUserId: m.userId,
          mentionerId: userId,
          postAuthorId: post.userId,
        },
      );
    }

    try {
      await insertCommentPostProductEvent(ctx, userId, args.postId, commentId);
    } catch {
      /* non-fatal product analytics */
    }

    return commentId;
  },
});

/**
 * Delete a comment (soft delete)
 */
export const deleteComment = mutation({
  args: {
    commentId: v.id("comments"),
    userId: v.optional(v.id("users")),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const userId =
      args.userId ?? ((ctx as any).userId as Id<"users"> | undefined);
    if (!userId) throw new Error("Unauthorized");
    await assertUserCanMutate(ctx, userId);

    const comment = await ctx.db.get(args.commentId);
    if (!comment) throw new Error("Comment not found");

    // Check ownership
    if (comment.authorId !== userId) {
      // Check if user owns the post
      const post = await ctx.db.get(comment.postId);
      if (!post || post.userId !== userId) {
        throw new Error("Unauthorized");
      }
    }

    const now = Date.now();

    // Soft delete (clear pin so indexes stay accurate)
    await ctx.db.patch(args.commentId, {
      isDeleted: true,
      deletedAt: now,
      pinnedAt: undefined,
    });

    // Update post comment count; clear single-post pin if this comment was pinned
    const post = await ctx.db.get(comment.postId);
    if (post) {
      // Route commentCount decrement through delta log to avoid OCC.
      await insertPostCounterDelta(ctx, comment.postId, "commentCount", -1);
      // Clear pinned comment reference if this was the pinned comment.
      if (String(post.pinnedCommentId ?? "") === String(args.commentId)) {
        await ctx.db.patch(comment.postId, { pinnedCommentId: undefined });
      }
    }

    // If this was a reply, decrement parent's replyCount so thread UI stays accurate
    if (comment.parentCommentId) {
      const parent = await ctx.db.get(comment.parentCommentId);
      if (parent) {
        await ctx.db.patch(comment.parentCommentId, {
          replyCount: Math.max(0, (parent.replyCount || 0) - 1),
        });
      }
    }

    return null;
  },
});

/**
 * Thumbs up / down on a comment (mutually exclusive; tap active to clear).
 */
export const voteOnComment = mutation({
  args: {
    commentId: v.id("comments"),
    direction: v.union(v.literal("up"), v.literal("down")),
    userId: v.optional(v.id("users")),
  },
  returns: v.object({
    userVote: v.union(v.literal("none"), v.literal("up"), v.literal("down")),
    likeCount: v.number(),
    dislikeCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const userId =
      args.userId ?? ((ctx as any).userId as Id<"users"> | undefined);
    if (!userId) throw new Error("Unauthorized");
    return applyCommentVote(ctx, args.commentId, userId, args.direction);
  },
});

/** @deprecated Use `voteOnComment` with `direction: "up"`. */
export const likeComment = mutation({
  args: {
    commentId: v.id("comments"),
    userId: v.optional(v.id("users")),
  },
  returns: v.object({
    liked: v.boolean(),
    likeCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const userId =
      args.userId ?? ((ctx as any).userId as Id<"users"> | undefined);
    if (!userId) throw new Error("Unauthorized");
    const r = await applyCommentVote(ctx, args.commentId, userId, "up");
    return {
      liked: r.userVote === "up",
      likeCount: r.likeCount,
    };
  },
});

/**
 * Edit a comment
 */
export const editComment = mutation({
  args: {
    commentId: v.id("comments"),
    text: v.string(),
    userId: v.optional(v.id("users")),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const userId =
      args.userId ?? ((ctx as any).userId as Id<"users"> | undefined);
    if (!userId) throw new Error("Unauthorized");
    await assertUserCanMutate(ctx, userId);

    const comment = await ctx.db.get(args.commentId);
    if (!comment) throw new Error("Comment not found");
    if (comment.authorId !== userId) throw new Error("Unauthorized");
    if (comment.isDeleted) throw new Error("Comment is deleted");

    await ctx.db.patch(args.commentId, {
      text: args.text,
      updatedAt: Date.now(),
    });

    return null;
  },
});

// ============================================
// INTERNALS
// ============================================

/**
 * Internal: Recalculate comment like count
 */
export const recalculateCommentLikeCount = internalMutation({
  args: {
    commentId: v.id("comments"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const likes = await ctx.db
      .query("commentLikes")
      .withIndex("by_comment", (q) => q.eq("commentId", args.commentId))
      .collect();

    const up = likes.filter((l) => l.reaction !== "down").length;
    const down = likes.filter((l) => l.reaction === "down").length;

    await ctx.db.patch(args.commentId, {
      likeCount: up,
      dislikeCount: down,
    });

    return null;
  },
});

/**
 * Internal: Delete all likes for a comment
 */
export const deleteAllCommentLikes = internalMutation({
  args: {
    commentId: v.id("comments"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const likes = await ctx.db
      .query("commentLikes")
      .withIndex("by_comment", (q) => q.eq("commentId", args.commentId))
      .collect();

    for (const like of likes) {
      await ctx.db.delete(like._id);
    }

    return null;
  },
});

/**
 * Internal: Hard delete a comment and all related data
 */
export const permanentlyDeleteComment = internalMutation({
  args: {
    commentId: v.id("comments"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    // Delete all likes
    const likes = await ctx.db
      .query("commentLikes")
      .withIndex("by_comment", (q) => q.eq("commentId", args.commentId))
      .collect();

    for (const like of likes) {
      await ctx.db.delete(like._id);
    }

    // Delete all replies (recursively)
    const replies = await ctx.db
      .query("comments")
      .withIndex("by_parent", (q) => q.eq("parentCommentId", args.commentId))
      .collect();

    for (const reply of replies) {
      await ctx.scheduler.runAfter(
        0,
        (api.comments as any).permanentlyDeleteComment,
        {
          commentId: reply._id,
        },
      );
    }

    // Delete the comment
    await ctx.db.delete(args.commentId);

    return null;
  },
});
