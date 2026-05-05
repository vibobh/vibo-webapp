/**
 * Feed + search suggested profiles — bounded reads, weighted scoring, shared engines.
 */

import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { getEffectiveAccountStatus } from "./accountModeration";
import { userHiddenFromPublicDiscovery } from "./staffVisibility";
import {
  computeRawScore,
  normCountry,
  normalizeScores,
  type SuggestionCandidate,
  type SuggestionViewerContext,
} from "./suggestedProfileEngines";
import { publicVerificationTier } from "./verificationTier";
import { loadSearchExcludedUserIds } from "./viewerContentFilters";

const MIN_PUBLISHED_POSTS = 3;
const CANDIDATE_POST_SCAN = 140;
const MUTUAL_FOLLOWER_SCAN_CAP = 48;
const DEFAULT_PAGE_LIMIT = 16;
const RANK_POOL_CAP = 64;

const reasonTagValidator = v.union(
  v.literal("Popular in Bahrain"),
  v.literal("Suggested for you"),
);

async function profilePictureUrlForUser(
  ctx: { db: any; storage: any },
  u: Doc<"users"> | null,
): Promise<string | undefined> {
  if (!u) return undefined;
  if (u.profilePictureStorageId) {
    const url = await ctx.storage.getUrl(u.profilePictureStorageId);
    if (url) return url;
  }
  return u.profilePictureUrl;
}

function interestOverlap(a: string[] | undefined, b: string[] | undefined) {
  if (!a?.length || !b?.length) return 0;
  const bs = new Set(b);
  let n = 0;
  for (const x of a) if (bs.has(x)) n++;
  return n;
}

async function hasMinPublishedPosts(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<boolean> {
  const rows = await ctx.db
    .query("posts")
    .withIndex("by_user_status", (q) =>
      q.eq("userId", userId).eq("status", "published"),
    )
    .take(MIN_PUBLISHED_POSTS + 1);
  return rows.length > MIN_PUBLISHED_POSTS;
}

async function weakMutualFollowerCount(
  ctx: QueryCtx,
  viewerFollowingIds: Set<string>,
  candidateId: Id<"users">,
): Promise<number> {
  const follows = await ctx.db
    .query("follows")
    .withIndex("by_following_status", (q) =>
      q.eq("followingId", candidateId).eq("status", "active"),
    )
    .take(MUTUAL_FOLLOWER_SCAN_CAP);
  let n = 0;
  for (const f of follows) {
    if (viewerFollowingIds.has(String(f.followerId))) n++;
  }
  return n;
}

async function collectCandidateIds(
  ctx: QueryCtx,
  exclude: Set<string>,
): Promise<Id<"users">[]> {
  const recentPosts = await ctx.db
    .query("posts")
    .withIndex("by_status_created", (q) => q.eq("status", "published"))
    .order("desc")
    .take(CANDIDATE_POST_SCAN);

  const out: Id<"users">[] = [];
  const seen = new Set<string>();
  for (const p of recentPosts) {
    const vis = p.moderationVisibilityStatus;
    if (vis === "hidden" || vis === "shadow_hidden") continue;
    const uid = p.userId;
    const idStr = String(uid);
    if (exclude.has(idStr) || seen.has(idStr)) continue;
    seen.add(idStr);
    out.push(uid);
    if (out.length >= RANK_POOL_CAP) break;
  }
  return out;
}

type Ranked = {
  userId: Id<"users">;
  rawScore: number;
  normScore: number;
  reasonTag: "Popular in Bahrain" | "Suggested for you";
};

export async function rankSuggestedProfiles(
  ctx: QueryCtx,
  viewerUserId: Id<"users">,
  opts: { excludeUserIds: Set<string>; extraExcludeRecent?: Set<string> },
): Promise<Ranked[]> {
  const now = Date.now();
  const viewer = await ctx.db.get(viewerUserId);
  const viewerCtx: SuggestionViewerContext = {
    viewerCountryNorm: normCountry(viewer?.country),
    viewerLang: viewer?.preferredLang ?? null,
  };

  const exclude = new Set(opts.excludeUserIds);
  exclude.add(String(viewerUserId));
  if (opts.extraExcludeRecent) {
    for (const id of opts.extraExcludeRecent) exclude.add(id);
  }

  const followingRows = await ctx.db
    .query("follows")
    .withIndex("by_follower_status", (q) =>
      q.eq("followerId", viewerUserId).eq("status", "active"),
    )
    .collect();
  const viewer_followingIds = new Set(
    followingRows.map((f) => String(f.followingId)),
  );
  for (const id of viewer_followingIds) exclude.add(id);

  const candidateIds = await collectCandidateIds(ctx, exclude);

  type Row = Ranked & { user: Doc<"users"> | null };
  const rows: Row[] = [];
  const interestsA = viewer?.interests;

  for (const uid of candidateIds) {
    const user = await ctx.db.get(uid);
    if (!user?.username?.trim()) continue;
    if (getEffectiveAccountStatus(user, now) !== "active") continue;
    if (userHiddenFromPublicDiscovery(user)) continue;
    if (exclude.has(String(uid))) continue;

    const [hasPosts, mutualN] = await Promise.all([
      hasMinPublishedPosts(ctx, uid),
      weakMutualFollowerCount(ctx, viewer_followingIds, uid),
    ]);

    const candidate: SuggestionCandidate = {
      user,
      followerCount: Math.max(0, user.followerCount ?? 0),
      hasMinPublishedPosts: hasPosts,
      interestsOverlap: interestOverlap(interestsA, user.interests),
      weakMutualFollowerCount: mutualN,
    };

    const raw = computeRawScore(viewerCtx, candidate);

    const vc = viewerCtx.viewerCountryNorm;
    const uc = normCountry(user.country);
    const reasonTag: "Popular in Bahrain" | "Suggested for you" =
      vc === "BH" && uc === "BH"
        ? "Popular in Bahrain"
        : "Suggested for you";

    rows.push({
      userId: uid,
      rawScore: raw,
      normScore: 0,
      reasonTag,
      user,
    });
  }

  if (rows.length === 0) return [];

  const raws = rows.map((r) => r.rawScore);
  const { norm } = normalizeScores(raws);
  for (const r of rows) {
    r.normScore = norm(r.rawScore);
  }

  rows.sort(
    (a, b) =>
      b.normScore - a.normScore ||
      b.rawScore - a.rawScore ||
      String(a.userId).localeCompare(String(b.userId)),
  );

  return rows
    .filter((r) => r.user)
    .map(({ user: _u, ...rest }) => rest);
}

/** Home feed + API shaped like GET /users/suggested */
export const getFeedSuggestedProfiles = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  returns: v.object({
    items: v.array(
      v.object({
        id: v.id("users"),
        username: v.string(),
        displayName: v.optional(v.string()),
        profileImage: v.optional(v.string()),
        profilePictureKey: v.optional(v.string()),
        followerCount: v.number(),
        isVerified: v.boolean(),
        verificationTier: v.optional(
          v.union(v.literal("blue"), v.literal("gold"), v.literal("gray")),
        ),
        isPrivate: v.optional(v.boolean()),
        reasonTag: reasonTagValidator,
      }),
    ),
    nextCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, { userId, limit, cursor }) => {
    const page = Math.min(Math.max(1, limit ?? DEFAULT_PAGE_LIMIT), 24);
    const offset = Math.max(0, parseInt(cursor ?? "0", 10) || 0);

    const searchExclude = await loadSearchExcludedUserIds(ctx, userId);
    const ranked = await rankSuggestedProfiles(ctx, userId, {
      excludeUserIds: searchExclude,
    });

    const slice = ranked.slice(offset, offset + page);
    const items: Array<{
      id: Id<"users">;
      username: string;
      displayName?: string;
      profileImage?: string;
      profilePictureKey?: string;
      followerCount: number;
      isVerified: boolean;
      verificationTier?: "blue" | "gold" | "gray";
      isPrivate?: boolean;
      reasonTag: "Popular in Bahrain" | "Suggested for you";
    }> = [];

    for (const r of slice) {
      const u = await ctx.db.get(r.userId);
      if (!u?.username) continue;
      const tier = publicVerificationTier(u);
      const profileImage = await profilePictureUrlForUser(ctx, u);
      items.push({
        id: u._id,
        username: u.username,
        displayName: u.fullName,
        profileImage,
        profilePictureKey: u.profilePictureKey,
        followerCount: Math.max(0, u.followerCount ?? 0),
        isVerified: tier === "blue" || tier === "gold",
        verificationTier: tier,
        isPrivate: u.isPrivate,
        reasonTag: r.reasonTag,
      });
    }

    const nextOffset = offset + slice.length;
    const nextCursor =
      nextOffset < ranked.length && items.length > 0 ? String(nextOffset) : null;

    return { items, nextCursor };
  },
});

export type SearchSuggestionRow = {
  _id: Id<"users">;
  username?: string;
  fullName?: string;
  bio?: string;
  profilePictureUrl?: string;
  profilePictureKey?: string;
  followerCount: number;
  isFollowing: boolean;
  hasActiveStories: boolean;
  hasUnviewedStories: boolean;
  mutuals: Array<{
    _id: Id<"users">;
    username?: string;
    fullName?: string;
    profilePictureUrl?: string;
    profilePictureKey?: string;
  }>;
  mutualCount: number;
  verificationTier?: "blue" | "gold" | "gray";
  verificationPending?: boolean;
};

/** Shared ranking for `users.getSuggestedUsers` (search). */
export async function buildSearchSuggestionRows(
  ctx: QueryCtx,
  viewerUserId: Id<"users">,
  maxResults: number,
): Promise<SearchSuggestionRow[]> {
  const now = Date.now();
  const searchExclude = await loadSearchExcludedUserIds(ctx, viewerUserId);
  const recentSearches = await ctx.db
    .query("recentSearches")
    .withIndex("by_user", (q) => q.eq("userId", viewerUserId))
    .take(50);
  const recentSearchIds = new Set(
    recentSearches.map((s) => String(s.searchedUserId)),
  );

  const ranked = await rankSuggestedProfiles(ctx, viewerUserId, {
    excludeUserIds: searchExclude,
    extraExcludeRecent: recentSearchIds,
  });

  const top = ranked.slice(0, Math.max(maxResults * 3, maxResults + 8));

  const followingRecords = await ctx.db
    .query("follows")
    .withIndex("by_follower_status", (q) =>
      q.eq("followerId", viewerUserId).eq("status", "active"),
    )
    .collect();
  const viewerFollowingIds = new Set(
    followingRecords.map((f) => String(f.followingId)),
  );

  const out: SearchSuggestionRow[] = [];

  for (const r of top) {
    if (out.length >= maxResults) break;
    const user = await ctx.db.get(r.userId);
    if (!user?.username) continue;

    const followerRecords = await ctx.db
      .query("follows")
      .withIndex("by_following_status", (q) =>
        q.eq("followingId", user._id).eq("status", "active"),
      )
      .take(64);

    const mutuals: SearchSuggestionRow["mutuals"] = [];
    for (const follow of followerRecords) {
      if (!viewerFollowingIds.has(String(follow.followerId))) continue;
      const mutualUser = await ctx.db.get(follow.followerId);
      if (mutualUser && !userHiddenFromPublicDiscovery(mutualUser)) {
        const profilePictureUrl = await profilePictureUrlForUser(
          ctx,
          mutualUser,
        );
        mutuals.push({
          _id: mutualUser._id,
          username: mutualUser.username,
          fullName: mutualUser.fullName,
          profilePictureUrl,
          profilePictureKey: mutualUser.profilePictureKey,
        });
      }
      if (mutuals.length >= 3) break;
    }

    const activeStories = await ctx.db
      .query("stories")
      .withIndex("by_user_created", (q) => q.eq("userId", user._id))
      .filter((q) => q.gt(q.field("expiresAt"), now))
      .collect();
    const hasActiveStories = activeStories.length > 0;
    let hasUnviewedStories = false;
    if (hasActiveStories) {
      for (const story of activeStories) {
        const view = await ctx.db
          .query("storyViews")
          .withIndex("by_story_viewer", (q) =>
            q.eq("storyId", story._id).eq("viewerId", viewerUserId),
          )
          .unique();
        if (!view) {
          hasUnviewedStories = true;
          break;
        }
      }
    }

    const profilePictureUrl = await profilePictureUrlForUser(ctx, user);
    const tier = publicVerificationTier(user, now);

    out.push({
      _id: user._id,
      username: user.username,
      fullName: user.fullName,
      bio: user.bio,
      profilePictureUrl,
      profilePictureKey: user.profilePictureKey,
      followerCount: Math.max(0, user.followerCount ?? 0),
      isFollowing: false,
      hasActiveStories,
      hasUnviewedStories,
      mutuals,
      mutualCount: mutuals.length,
      ...(tier ? { verificationTier: tier } : {}),
      verificationPending: user.verificationPending,
    });
  }

  return out;
}
