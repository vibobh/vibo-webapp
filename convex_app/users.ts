import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, mutation, query } from "./_generated/server";
import {
  assertUserCanMutate,
  canViewerSeeTargetUserProfile,
  getEffectiveAccountStatus,
} from "./accountModeration";
import { userHiddenFromPublicDiscovery } from "./staffVisibility";
import {
  publicVerificationTier,
  verificationTierPayload,
} from "./verificationTier";
import { loadSearchExcludedUserIds } from "./viewerContentFilters";

async function userDocWithResolvedMediaUrls(
  ctx: { db: any; storage: any },
  user: Doc<"users">,
): Promise<Doc<"users"> & { profilePictureUrl?: string; bannerUrl?: string }> {
  let storageUrl: string | null = null;
  if (user.profilePictureStorageId) {
    try {
      storageUrl = await ctx.storage.getUrl(user.profilePictureStorageId);
    } catch {
      storageUrl = null;
    }
  }
  let bannerStorageUrl: string | null = null;
  if (user.bannerStorageId) {
    try {
      bannerStorageUrl = await ctx.storage.getUrl(user.bannerStorageId);
    } catch {
      bannerStorageUrl = null;
    }
  }
  return {
    ...user,
    profilePictureUrl: storageUrl ?? user.profilePictureUrl,
    bannerUrl: bannerStorageUrl ?? user.bannerUrl,
  };
}

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

function userMatchesMentionPrefix(
  user: Doc<"users">,
  prefixLower: string,
): boolean {
  if (!prefixLower) return true;
  const un = user.username?.toLowerCase() ?? "";
  const fn = user.fullName?.toLowerCase() ?? "";
  return un.startsWith(prefixLower) || fn.includes(prefixLower);
}

/**
 * Typeahead for @mentions in comments: mutuals → following → followers → others,
 * filtered by username prefix / full-name substring.
 */
export const searchUsersForCommentMention = query({
  args: {
    viewerUserId: v.id("users"),
    prefix: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("users"),
      username: v.string(),
      fullName: v.optional(v.string()),
      profilePictureUrl: v.optional(v.string()),
      profilePictureKey: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, { viewerUserId, prefix, limit }) => {
    const max = Math.min(Math.max(1, limit ?? 12), 25);
    const p = prefix.trim().toLowerCase();
    const searchExclude = await loadSearchExcludedUserIds(ctx, viewerUserId);

    const [followingRows, followerRows] = await Promise.all([
      ctx.db
        .query("follows")
        .withIndex("by_follower_status", (q: any) =>
          q.eq("followerId", viewerUserId).eq("status", "active"),
        )
        .collect(),
      ctx.db
        .query("follows")
        .withIndex("by_following_status", (q: any) =>
          q.eq("followingId", viewerUserId).eq("status", "active"),
        )
        .collect(),
    ]);

    const followingIdSet = new Set(
      followingRows.map((f: { followingId: Id<"users"> }) =>
        String(f.followingId),
      ),
    );
    const followerIdSet = new Set(
      followerRows.map((f: { followerId: Id<"users"> }) =>
        String(f.followerId),
      ),
    );

    const mutualIds = [...followingIdSet].filter((id) => followerIdSet.has(id));
    const followingOnlyIds = [...followingIdSet].filter(
      (id) => !followerIdSet.has(id),
    );
    const followerOnlyIds = [...followerIdSet].filter(
      (id) => !followingIdSet.has(id),
    );

    type Row = {
      _id: Id<"users">;
      username: string;
      fullName?: string;
      profilePictureUrl?: string;
      profilePictureKey?: string;
      tier: number;
      usernamePrefixRank: number;
    };

    const rows: Row[] = [];
    const seen = new Set<string>();

    const relationshipTier = (idStr: string) => {
      if (followingIdSet.has(idStr) && followerIdSet.has(idStr)) return 0;
      if (followingIdSet.has(idStr)) return 1;
      if (followerIdSet.has(idStr)) return 2;
      return 3;
    };

    const pushUser = async (userId: Id<"users">) => {
      const idStr = String(userId);
      if (idStr === String(viewerUserId) || seen.has(idStr)) return;
      if (searchExclude.has(idStr)) return;
      const u = await ctx.db.get(userId);
      if (!u?.username) return;
      if (getEffectiveAccountStatus(u) !== "active") return;
      if (userHiddenFromPublicDiscovery(u)) return;
      if (!userMatchesMentionPrefix(u, p)) return;
      seen.add(idStr);
      const profilePictureUrl = await profilePictureUrlForUser(ctx, u);
      const unLower = u.username.toLowerCase();
      const usernamePrefixRank = unLower.startsWith(p) ? 0 : 1;
      rows.push({
        _id: u._id,
        username: u.username,
        fullName: u.fullName,
        profilePictureUrl,
        profilePictureKey: u.profilePictureKey,
        tier: relationshipTier(idStr),
        usernamePrefixRank,
        ...verificationTierPayload(u),
      });
    };

    if (!p) {
      for (const id of mutualIds.slice(0, 24)) {
        await pushUser(id as Id<"users">);
      }
      for (const id of followingOnlyIds.slice(0, 32)) {
        await pushUser(id as Id<"users">);
      }
      for (const id of followerOnlyIds.slice(0, 32)) {
        await pushUser(id as Id<"users">);
      }
    } else {
      const byUsername = await ctx.db
        .query("users")
        .withIndex("by_username", (q: any) =>
          q.gte("username", p).lt("username", p + "\xff"),
        )
        .take(45);

      for (const u of byUsername) {
        if (String(u._id) === String(viewerUserId)) continue;
        if (getEffectiveAccountStatus(u) !== "active") continue;
        if (userHiddenFromPublicDiscovery(u)) continue;
        if (!userMatchesMentionPrefix(u, p)) continue;
        await pushUser(u._id);
      }

      const networkScan = [
        ...mutualIds,
        ...followingOnlyIds,
        ...followerOnlyIds,
      ].slice(0, 220);
      for (const id of networkScan) {
        await pushUser(id as Id<"users">);
      }
    }

    rows.sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      if (a.usernamePrefixRank !== b.usernamePrefixRank) {
        return a.usernamePrefixRank - b.usernamePrefixRank;
      }
      return a.username.localeCompare(b.username);
    });

    return rows
      .slice(0, max)
      .map(({ tier: _t, usernamePrefixRank: _r, ...rest }) => rest);
  },
});

/** Create or update user (called from actions after Google verify or email signup) */
export const createOrUpdateFromAuth = mutation({
  args: {
    email: v.string(),
    username: v.optional(v.string()),
    fullName: v.optional(v.string()),
    dob: v.optional(v.string()),
    provider: v.union(v.literal("google"), v.literal("email")),
    passwordHash: v.optional(v.string()),
    phone: v.optional(v.string()),
    countryCode: v.optional(v.string()),
    profilePictureUrl: v.optional(v.string()),
    profilePictureKey: v.optional(v.string()),
    profilePictureStorageId: v.optional(v.id("_storage")),
    bio: v.optional(v.string()),
    bioLink: v.optional(v.string()),
    preferredLang: v.optional(v.string()),
  },
  handler: async (
    ctx,
    {
      email,
      username,
      fullName,
      dob,
      provider,
      passwordHash,
      phone,
      countryCode,
      profilePictureUrl,
      profilePictureKey,
      profilePictureStorageId,
      bio,
      bioLink,
      preferredLang,
    },
  ) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email_provider", (q) =>
        q.eq("email", email).eq("provider", provider),
      )
      .unique();
    const now = Date.now();
    if (existing) {
      const updates: {
        passwordHash?: string;
        username?: string;
        fullName?: string;
        dob?: string;
        phone?: string;
        countryCode?: string;
        profilePictureUrl?: string;
        profilePictureKey?: string;
        profilePictureStorageId?: Id<"_storage">;
        bio?: string;
        bioLink?: string;
        preferredLang?: string;
      } = {};
      if (passwordHash !== undefined) updates.passwordHash = passwordHash;
      if (username !== undefined) updates.username = username;
      if (fullName !== undefined) updates.fullName = fullName;
      if (dob !== undefined) updates.dob = dob;
      if (phone !== undefined) updates.phone = phone;
      if (countryCode !== undefined) updates.countryCode = countryCode;
      if (profilePictureUrl !== undefined)
        updates.profilePictureUrl = profilePictureUrl;
      if (profilePictureKey !== undefined)
        updates.profilePictureKey = profilePictureKey;
      if (profilePictureStorageId !== undefined)
        updates.profilePictureStorageId = profilePictureStorageId;
      if (bio !== undefined) updates.bio = bio;
      if (bioLink !== undefined) updates.bioLink = bioLink;
      if (preferredLang !== undefined) updates.preferredLang = preferredLang;
      if (Object.keys(updates).length > 0) {
        await ctx.db.patch(existing._id, updates);
      }
      return existing._id;
    }
    return await ctx.db.insert("users", {
      email,
      provider,
      createdAt: now,
      ...(username !== undefined && { username }),
      ...(fullName !== undefined && { fullName }),
      ...(dob !== undefined && { dob }),
      ...(passwordHash !== undefined && { passwordHash }),
      ...(phone !== undefined && { phone }),
      ...(countryCode !== undefined && { countryCode }),
      ...(profilePictureUrl !== undefined && { profilePictureUrl }),
      ...(profilePictureKey !== undefined && { profilePictureKey }),
      ...(profilePictureStorageId !== undefined && { profilePictureStorageId }),
      ...(bio !== undefined && { bio }),
      ...(bioLink !== undefined && { bioLink }),
      ...(preferredLang !== undefined && { preferredLang }),
    });
  },
});

/** Password reset helper (used by auth actions after OTP verification). */
export const updatePasswordHashByEmail = mutation({
  args: {
    email: v.string(),
    passwordHash: v.string(),
  },
  handler: async (ctx, { email, passwordHash }) => {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await ctx.db
      .query("users")
      .withIndex("by_email_provider", (q) =>
        q.eq("email", normalizedEmail).eq("provider", "email"),
      )
      .unique();
    if (!user) {
      throw new Error("No account found for this email");
    }
    await ctx.db.patch(user._id, { passwordHash });
    return { userId: user._id };
  },
});

/** Update current user profile (username, phone, country after signup) */
export const updateProfile = mutation({
  args: {
    userId: v.id("users"),
    username: v.optional(v.string()),
    fullName: v.optional(v.string()),
    dob: v.optional(v.string()),
    phone: v.optional(v.string()),
    countryCode: v.optional(v.string()),
    // Onboarding fields
    gender: v.optional(v.string()),
    country: v.optional(v.string()),
    interests: v.optional(v.array(v.string())),
    profilePictureUrl: v.optional(v.string()),
    profilePictureKey: v.optional(v.string()),
    profilePictureStorageRegion: v.optional(v.string()),
    profilePictureStorageId: v.optional(v.id("_storage")),
    bannerUrl: v.optional(v.string()),
    bannerKey: v.optional(v.string()),
    bannerStorageRegion: v.optional(v.string()),
    bannerStorageId: v.optional(v.id("_storage")),
    /** When true, removes banner fields (S3 key + URLs). */
    clearBanner: v.optional(v.boolean()),
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
  },
  handler: async (
    ctx,
    {
      userId,
      username,
      fullName,
      dob,
      phone,
      countryCode,
      gender,
      country,
      interests,
      profilePictureUrl,
      profilePictureKey,
      profilePictureStorageRegion,
      profilePictureStorageId,
      bannerUrl,
      bannerKey,
      bannerStorageRegion,
      bannerStorageId,
      clearBanner,
      bio,
      bioLink,
      bioLinks,
    },
  ) => {
    await assertUserCanMutate(ctx, userId);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    const updates: {
      username?: string;
      fullName?: string;
      dob?: string;
      phone?: string;
      countryCode?: string;
      profilePictureUrl?: string;
      profilePictureKey?: string;
      profilePictureStorageRegion?: string;
      profilePictureStorageId?: Id<"_storage">;
      bannerUrl?: string;
      bannerKey?: string;
      bannerStorageRegion?: string;
      bannerStorageId?: Id<"_storage">;
      bio?: string;
      bioLink?: string;
      bioLinks?: Array<{
        id: string;
        title: string;
        url: string;
        position: number;
        createdAt: number;
      }>;
      gender?: string;
      country?: string;
      interests?: string[];
    } = {};
    if (username !== undefined) updates.username = username;
    if (fullName !== undefined) updates.fullName = fullName;
    if (dob !== undefined) updates.dob = dob;
    if (phone !== undefined) updates.phone = phone;
    if (countryCode !== undefined) updates.countryCode = countryCode;
    if (profilePictureUrl !== undefined)
      updates.profilePictureUrl = profilePictureUrl;
    if (profilePictureKey !== undefined)
      updates.profilePictureKey = profilePictureKey;
    if (profilePictureStorageRegion !== undefined)
      updates.profilePictureStorageRegion = profilePictureStorageRegion;
    if (profilePictureStorageId !== undefined)
      updates.profilePictureStorageId = profilePictureStorageId;
    if (clearBanner) {
      updates.bannerUrl = undefined;
      updates.bannerKey = undefined;
      updates.bannerStorageRegion = undefined;
      updates.bannerStorageId = undefined;
    } else {
      if (bannerUrl !== undefined) updates.bannerUrl = bannerUrl;
      if (bannerKey !== undefined) updates.bannerKey = bannerKey;
      if (bannerStorageRegion !== undefined)
        updates.bannerStorageRegion = bannerStorageRegion;
      if (bannerStorageId !== undefined)
        updates.bannerStorageId = bannerStorageId;
    }
    if (bio !== undefined) updates.bio = bio;
    if (bioLink !== undefined) updates.bioLink = bioLink;
    if (bioLinks !== undefined) updates.bioLinks = bioLinks;
    if (gender !== undefined) updates.gender = gender;
    if (country !== undefined) updates.country = country;
    if (interests !== undefined) updates.interests = interests;
    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(userId, updates);
    }
  },
});

/** Update lightweight account preferences from Settings screen. */
export const updateAccountPreferences = mutation({
  args: {
    userId: v.id("users"),
    isPrivate: v.optional(v.boolean()),
    preferredLang: v.optional(v.union(v.literal("en"), v.literal("ar"))),
  },
  returns: v.object({
    ok: v.boolean(),
  }),
  handler: async (ctx, { userId, isPrivate, preferredLang }) => {
    await assertUserCanMutate(ctx, userId);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    const patch: { isPrivate?: boolean; preferredLang?: "en" | "ar" } = {};
    if (typeof isPrivate === "boolean") patch.isPrivate = isPrivate;
    if (preferredLang !== undefined) patch.preferredLang = preferredLang;
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(userId, patch);
    }
    return { ok: true };
  },
});

/** Generate signed upload URL for profile picture uploads */
export const generateProfileImageUploadUrl = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await assertUserCanMutate(ctx, userId);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Save uploaded profile picture for current user */
export const saveProfileImage = mutation({
  args: {
    userId: v.id("users"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, { userId, storageId }) => {
    await assertUserCanMutate(ctx, userId);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    await ctx.db.patch(userId, {
      profilePictureStorageId: storageId,
    });
  },
});

/** Remove current user's profile picture */
export const removeProfileImage = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, { userId }) => {
    await assertUserCanMutate(ctx, userId);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    await ctx.db.patch(userId, {
      profilePictureStorageId: undefined,
      profilePictureUrl: undefined,
      profilePictureKey: undefined,
      profilePictureStorageRegion: undefined,
    });
  },
});

/** Get user by username (for uniqueness check) */
export const getByUsername = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    return await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
  },
});

/** Get user by email and provider */
export const getByEmailAndProvider = query({
  args: { email: v.string(), provider: v.string() },
  handler: async (ctx, { email, provider }) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email_provider", (q) =>
        q.eq("email", email).eq("provider", provider),
      )
      .unique();
  },
});

/**
 * Full user row + resolved media URLs — Convex internal use only (actions, email, uploads).
 * Not subject to profile visibility rules.
 */
export const getUserDocInternal = internalQuery({
  args: { id: v.union(v.id("users"), v.string()) },
  returns: v.union(v.null(), v.any()),
  handler: async (ctx, { id }) => {
    const normalizedId =
      typeof id === "string" ? await ctx.db.normalizeId("users", id) : id;
    if (!normalizedId) return null;
    const user = await ctx.db.get(normalizedId);
    if (!user) return null;
    return await userDocWithResolvedMediaUrls(ctx, user);
  },
});

/** Get user by id (for session / current user) */
export const getById = query({
  args: {
    id: v.union(v.id("users"), v.string()),
    /** When viewing another user, pass the logged-in viewer so banned/suspended profiles can be gated. */
    viewerUserId: v.optional(v.id("users")),
  },
  returns: v.any(),
  handler: async (ctx, { id, viewerUserId }) => {
    const normalizedId =
      typeof id === "string" ? await ctx.db.normalizeId("users", id) : id;
    if (!normalizedId) return null;
    const user = await ctx.db.get(normalizedId);
    if (!user) return null;

    const viewer = viewerUserId != null ? await ctx.db.get(viewerUserId) : null;
    if (!canViewerSeeTargetUserProfile(user, viewerUserId ?? null, viewer)) {
      const eff = getEffectiveAccountStatus(user);
      return {
        restricted: true as const,
        status: eff === "banned" ? ("banned" as const) : ("suspended" as const),
      };
    }

    return await userDocWithResolvedMediaUrls(ctx, user);
  },
});

/** Latest user-target moderation row: prefer `notes`, then `reason`; time is Convex `_creationTime`. */
function latestUserModerationAction(
  actions: Doc<"moderationActions">[],
): { text: string | null; at: number } | null {
  if (actions.length === 0) return null;
  const latest = actions.reduce((a, b) =>
    b._creationTime > a._creationTime ? b : a,
  );
  // Prefer `reason` for end-user facing text; `notes` may include internal/audit phrasing.
  const raw = latest.reason ?? latest.notes;
  const text = raw?.trim() ? raw : null;
  return { text, at: latest._creationTime };
}

/** Effective account moderation for session / restriction UI (no DB writes). */
export const getAccountModeration = query({
  args: { userId: v.union(v.id("users"), v.string()) },
  returns: v.union(
    v.object({
      subjectUserId: v.id("users"),
      accountStatus: v.union(
        v.literal("active"),
        v.literal("suspended"),
        v.literal("banned"),
      ),
      suspensionEnd: v.union(v.number(), v.null()),
      suspensionReason: v.union(v.string(), v.null()),
      banReason: v.union(v.string(), v.null()),
      /** When set, time of the latest `moderationActions` row for this user (`_creationTime`). */
      latestModerationActionAt: v.union(v.number(), v.null()),
      strikeCount: v.number(),
      appealAllowed: v.boolean(),
      username: v.union(v.string(), v.null()),
      email: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, { userId }) => {
    const normalizedId =
      typeof userId === "string"
        ? await ctx.db.normalizeId("users", userId)
        : userId;
    if (!normalizedId) return null;
    const u = await ctx.db.get(normalizedId);
    if (!u) return null;
    const eff = getEffectiveAccountStatus(u);

    const userActions = await ctx.db
      .query("moderationActions")
      .withIndex("by_target", (q) =>
        q.eq("targetType", "user").eq("targetId", String(normalizedId)),
      )
      .collect();
    const latestFromLog = latestUserModerationAction(userActions);

    const suspensionReason =
      u.suspensionReason ??
      (eff === "suspended" ? (latestFromLog?.text ?? null) : null) ??
      null;
    const banReason =
      u.banReason ??
      (eff === "banned" ? (latestFromLog?.text ?? null) : null) ??
      null;

    const latestModerationActionAt =
      eff === "suspended" || eff === "banned"
        ? (latestFromLog?.at ?? null)
        : null;

    return {
      subjectUserId: normalizedId,
      accountStatus: eff,
      suspensionEnd: u.suspensionEnd ?? null,
      suspensionReason,
      banReason,
      latestModerationActionAt,
      strikeCount: u.strikeCount ?? 0,
      appealAllowed:
        eff === "banned" ||
        (eff === "suspended" && u.appealAllowedWhileSuspended !== false),
      username: u.username ?? null,
      email: u.email,
    };
  },
});

/** Search users by username or full name */
export const searchUsers = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
    excludeUserId: v.optional(v.id("users")),
    viewerUserId: v.optional(v.id("users")),
  },
  handler: async (
    ctx,
    { query: searchQuery, limit, excludeUserId, viewerUserId },
  ) => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return [];

    const maxResults = limit ?? 20;
    const now = Date.now();

    // Get users the viewer is actively following (if viewerUserId provided)
    const followingIds = new Set<string>();
    if (viewerUserId) {
      const follows = await ctx.db
        .query("follows")
        .withIndex("by_follower_status", (q) =>
          q.eq("followerId", viewerUserId).eq("status", "active"),
        )
        .collect();
      for (const f of follows) {
        followingIds.add(String(f.followingId));
      }
    }

    const searchExclude = viewerUserId
      ? await loadSearchExcludedUserIds(ctx, viewerUserId)
      : null;

    const results: Array<{
      _id: Id<"users">;
      username?: string;
      fullName?: string;
      bio?: string;
      profilePictureUrl?: string;
      profilePictureKey?: string;
      profilePictureStorageRegion?: string;
      isFollowing: boolean;
      hasActiveStories: boolean;
      hasUnviewedStories: boolean;
    }> = [];

    // Search by username (exact prefix match)
    const byUsername = await ctx.db
      .query("users")
      .withIndex("by_username", (q) =>
        q
          .gte("username", normalizedQuery)
          .lt("username", normalizedQuery + "\xFF"),
      )
      .take(maxResults);

    for (const user of byUsername) {
      if (excludeUserId && user._id === excludeUserId) continue;
      if (searchExclude?.has(String(user._id))) continue;
      if (getEffectiveAccountStatus(user, now) !== "active") continue;
      if (userHiddenFromPublicDiscovery(user)) continue;
      if (results.length >= maxResults) break;

      // Check story status
      const activeStories = await ctx.db
        .query("stories")
        .withIndex("by_user_created", (q) => q.eq("userId", user._id))
        .filter((q) => q.gt(q.field("expiresAt"), now))
        .collect();

      let hasUnviewedStories = false;
      if (viewerUserId && activeStories.length > 0) {
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
      results.push({
        _id: user._id,
        username: user.username,
        fullName: user.fullName,
        bio: user.bio,
        profilePictureUrl,
        profilePictureKey: user.profilePictureKey,
        profilePictureStorageRegion: user.profilePictureStorageRegion,
        isFollowing: followingIds.has(String(user._id)),
        hasActiveStories: activeStories.length > 0,
        hasUnviewedStories,
        ...(user.verificationPending === true
          ? { verificationPending: true as const }
          : {}),
        ...verificationTierPayload(user),
      });
    }

    // If we need more results, search by full name
    if (results.length < maxResults) {
      const existingIds = new Set(results.map((r) => r._id));
      const byFullName = await ctx.db
        .query("users")
        .filter((q) =>
          q.and(
            q.neq("fullName", undefined),
            q.or(
              q.gte(q.field("fullName"), normalizedQuery),
              q.lt(q.field("fullName"), normalizedQuery + "\xFF"),
            ),
          ),
        )
        .take(maxResults * 2);

      for (const user of byFullName) {
        if (excludeUserId && user._id === excludeUserId) continue;
        if (searchExclude?.has(String(user._id))) continue;
        if (existingIds.has(user._id)) continue;
        if (getEffectiveAccountStatus(user, now) !== "active") continue;
        if (userHiddenFromPublicDiscovery(user)) continue;
        if (results.length >= maxResults) break;

        // Check story status
        const activeStories = await ctx.db
          .query("stories")
          .withIndex("by_user_created", (q) => q.eq("userId", user._id))
          .filter((q) => q.gt(q.field("expiresAt"), now))
          .collect();

        let hasUnviewedStories = false;
        if (viewerUserId && activeStories.length > 0) {
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
        results.push({
          _id: user._id,
          username: user.username,
          fullName: user.fullName,
          bio: user.bio,
          profilePictureUrl,
          profilePictureKey: user.profilePictureKey,
          profilePictureStorageRegion: user.profilePictureStorageRegion,
          isFollowing: followingIds.has(String(user._id)),
          hasActiveStories: activeStories.length > 0,
          hasUnviewedStories,
          ...(user.verificationPending === true
            ? { verificationPending: true as const }
            : {}),
          ...verificationTierPayload(user),
        });
      }
    }

    return results;
  },
});

/** Get public profile for a user (limited fields for public viewing) */
export const getPublicProfile = query({
  args: {
    userId: v.id("users"),
    viewerUserId: v.optional(v.id("users")),
  },
  returns: v.any(),
  handler: async (ctx, { userId, viewerUserId }) => {
    const user = await ctx.db.get(userId);
    if (!user) return null;

    const viewer = viewerUserId != null ? await ctx.db.get(viewerUserId) : null;
    if (
      viewerUserId != null &&
      String(viewerUserId) !== String(userId) &&
      userHiddenFromPublicDiscovery(user)
    ) {
      const eff = getEffectiveAccountStatus(user);
      return {
        restricted: true as const,
        status: eff === "banned" ? ("banned" as const) : ("suspended" as const),
      };
    }

    if (!canViewerSeeTargetUserProfile(user, viewerUserId ?? null, viewer)) {
      const eff = getEffectiveAccountStatus(user);
      return {
        restricted: true as const,
        status: eff === "banned" ? ("banned" as const) : ("suspended" as const),
      };
    }

    // Return only public-safe fields
    return {
      _id: user._id,
      username: user.username,
      fullName: user.fullName,
      bio: user.bio,
      bioLink: user.bioLink,
      bioLinks: user.bioLinks,
      profilePictureUrl: user.profilePictureUrl,
      profilePictureKey: user.profilePictureKey,
      createdAt: user.createdAt,
      ...verificationTierPayload(user),
    };
  },
});

/** Record a recent search */
export const recordSearch = mutation({
  args: {
    userId: v.id("users"),
    searchedUserId: v.id("users"),
  },
  handler: async (ctx, { userId, searchedUserId }) => {
    await assertUserCanMutate(ctx, userId);
    // Check if already exists
    const existing = await ctx.db
      .query("recentSearches")
      .withIndex("by_user_searched", (q) =>
        q.eq("userId", userId).eq("searchedUserId", searchedUserId),
      )
      .unique();

    if (existing) {
      // Update timestamp
      await ctx.db.patch(existing._id, { searchedAt: Date.now() });
      return;
    }

    // Create new entry
    await ctx.db.insert("recentSearches", {
      userId,
      searchedUserId,
      searchedAt: Date.now(),
    });

    // Clean up old entries (keep last 20)
    const allSearches = await ctx.db
      .query("recentSearches")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    if (allSearches.length > 20) {
      for (let i = 20; i < allSearches.length; i++) {
        await ctx.db.delete(allSearches[i]._id);
      }
    }
  },
});

/** Get recent searches for a user */
export const getRecentSearches = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { userId, limit }) => {
    const searches = await ctx.db
      .query("recentSearches")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit ?? 10);

    const results = [];
    const now = Date.now();
    const followingIds = new Set<string>();

    // Get active following list
    const follows = await ctx.db
      .query("follows")
      .withIndex("by_follower_status", (q) =>
        q.eq("followerId", userId).eq("status", "active"),
      )
      .collect();
    for (const f of follows) {
      followingIds.add(String(f.followingId));
    }

    for (const search of searches) {
      const user = await ctx.db.get(search.searchedUserId);
      if (!user) continue;
      if (userHiddenFromPublicDiscovery(user)) continue;

      // Check story status
      const activeStories = await ctx.db
        .query("stories")
        .withIndex("by_user_created", (q) => q.eq("userId", user._id))
        .filter((q) => q.gt(q.field("expiresAt"), now))
        .collect();

      let hasUnviewedStories = false;
      for (const story of activeStories) {
        const view = await ctx.db
          .query("storyViews")
          .withIndex("by_story_viewer", (q) =>
            q.eq("storyId", story._id).eq("viewerId", userId),
          )
          .unique();
        if (!view) {
          hasUnviewedStories = true;
          break;
        }
      }

      results.push({
        _id: user._id,
        username: user.username,
        fullName: user.fullName,
        bio: user.bio,
        profilePictureUrl: user.profilePictureUrl,
        profilePictureKey: user.profilePictureKey,
        isFollowing: followingIds.has(String(user._id)),
        hasActiveStories: activeStories.length > 0,
        hasUnviewedStories,
        searchedAt: search.searchedAt,
        ...verificationTierPayload(user),
      });
    }

    return results;
  },
});

/** Batch public verification tiers for account switcher / lists (max 12 ids). */
export const getVerificationTiersForUserIds = query({
  args: { userIds: v.array(v.id("users")) },
  returns: v.record(
    v.string(),
    v.union(v.literal("blue"), v.literal("gold"), v.literal("gray")),
  ),
  handler: async (ctx, { userIds }) => {
    const out: Record<string, "blue" | "gold" | "gray"> = {};
    const seen = new Set<string>();
    for (const id of userIds) {
      const sid = String(id);
      if (seen.has(sid) || seen.size >= 12) continue;
      seen.add(sid);
      const u = await ctx.db.get(id);
      const t = publicVerificationTier(u ?? null);
      if (t) out[sid] = t;
    }
    return out;
  },
});

/** Clear recent searches */
export const clearRecentSearches = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await assertUserCanMutate(ctx, userId);
    const searches = await ctx.db
      .query("recentSearches")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    for (const search of searches) {
      await ctx.db.delete(search._id);
    }
  },
});

/** Remove a single recent search entry */
export const removeRecentSearch = mutation({
  args: {
    userId: v.id("users"),
    searchedUserId: v.id("users"),
  },
  handler: async (ctx, { userId, searchedUserId }) => {
    await assertUserCanMutate(ctx, userId);
    const existing = await ctx.db
      .query("recentSearches")
      .withIndex("by_user_searched", (q) =>
        q.eq("userId", userId).eq("searchedUserId", searchedUserId),
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

/**
 * Follow a user - DEPRECATED: Use api.follows.followUser instead
 * Kept for backward compatibility, delegates to new follows module
 */
export const followUser = mutation({
  args: {
    followerId: v.id("users"),
    followingId: v.id("users"),
  },
  handler: async (
    ctx,
    { followerId, followingId },
  ): Promise<{
    success: boolean;
    status?: string;
    followId?: string;
    isPrivate?: boolean;
    message?: string;
  }> => {
    // Delegate to new follows module
    return (await ctx.runMutation(api.follows.followUser, {
      followerId,
      followingId,
    })) as {
      success: boolean;
      status?: string;
      followId?: string;
      isPrivate?: boolean;
      message?: string;
    };
  },
});

/**
 * Unfollow a user - DEPRECATED: Use api.follows.unfollowUser instead
 * Kept for backward compatibility, delegates to new follows module
 */
export const unfollowUser = mutation({
  args: {
    followerId: v.id("users"),
    followingId: v.id("users"),
  },
  handler: async (
    ctx,
    { followerId, followingId },
  ): Promise<{
    success: boolean;
    wasActive?: boolean;
    message?: string;
  }> => {
    // Delegate to new follows module
    return (await ctx.runMutation(api.follows.unfollowUser, {
      followerId,
      followingId,
    })) as {
      success: boolean;
      wasActive?: boolean;
      message?: string;
    };
  },
});

/** Get mutual connections between viewer and target user */
export const getMutualConnections = query({
  args: {
    viewerUserId: v.id("users"),
    targetUserId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { viewerUserId, targetUserId, limit }) => {
    const maxResults = limit ?? 3;

    // Get people the viewer follows
    const viewerFollowing = await ctx.db
      .query("follows")
      .withIndex("by_follower", (q) => q.eq("followerId", viewerUserId))
      .collect();
    const viewerFollowingIds = new Set(
      viewerFollowing.map((f) => String(f.followingId)),
    );

    // Get people who actively follow the target
    const targetFollowers = await ctx.db
      .query("follows")
      .withIndex("by_following_status", (q) =>
        q.eq("followingId", targetUserId).eq("status", "active"),
      )
      .collect();

    // Find mutuals (people viewer follows who also follow target)
    const mutuals: Array<{
      _id: Id<"users">;
      username?: string;
      fullName?: string;
      profilePictureUrl?: string;
      profilePictureKey?: string;
    }> = [];

    for (const follow of targetFollowers) {
      const followerIdStr = String(follow.followerId);
      if (viewerFollowingIds.has(followerIdStr)) {
        const user = await ctx.db.get(follow.followerId);
        if (user && !userHiddenFromPublicDiscovery(user)) {
          const profilePictureUrl = await profilePictureUrlForUser(ctx, user);
          mutuals.push({
            _id: user._id,
            username: user.username,
            fullName: user.fullName,
            profilePictureUrl,
            profilePictureKey: user.profilePictureKey,
          });
        }
        if (mutuals.length >= maxResults + 1) break; // Get one extra for "+ more"
      }
    }

    return {
      mutuals: mutuals.slice(0, maxResults),
      totalCount: mutuals.length,
      hasMore: mutuals.length > maxResults,
    };
  },
});

/** Get suggested users with smart ranking (Instagram-style) */
export const getSuggestedUsers = query({
  args: {
    viewerUserId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { viewerUserId, limit }) => {
    const now = Date.now();
    const maxResults = limit ?? 15;

    // Get users the viewer is already actively following
    const followingRecords = await ctx.db
      .query("follows")
      .withIndex("by_follower_status", (q) =>
        q.eq("followerId", viewerUserId).eq("status", "active"),
      )
      .collect();
    const followingIds = new Set(
      followingRecords.map((f) => String(f.followingId)),
    );
    followingIds.add(String(viewerUserId)); // Exclude self

    const searchExclude = await loadSearchExcludedUserIds(ctx, viewerUserId);

    // Get recent searches to exclude
    const recentSearches = await ctx.db
      .query("recentSearches")
      .withIndex("by_user", (q) => q.eq("userId", viewerUserId))
      .take(50);
    const recentSearchIds = new Set(
      recentSearches.map((s) => String(s.searchedUserId)),
    );

    // Get viewer's following for mutual calculation
    const viewerFollowingIdsForMutuals = new Set(followingIds);

    // Collect all candidate users with their metrics
    type UserWithScore = {
      _id: Id<"users">;
      username?: string;
      fullName?: string;
      bio?: string;
      profilePictureUrl?: string;
      profilePictureKey?: string;
      followerCount: number;
      hasActiveStories: boolean;
      hasUnviewedStories: boolean;
      isFollowing: boolean;
      mutuals: Array<{
        _id: Id<"users">;
        username?: string;
        fullName?: string;
        profilePictureUrl?: string;
        profilePictureKey?: string;
      }>;
      mutualCount: number;
      score: number;
    };

    const candidates: UserWithScore[] = [];

    // Get all users (we'll filter and rank)
    const allUsers = await ctx.db.query("users").collect();

    for (const user of allUsers) {
      const userIdStr = String(user._id);

      // Skip if already following, self, or recently searched
      if (followingIds.has(userIdStr)) continue;
      if (recentSearchIds.has(userIdStr)) continue;
      if (searchExclude.has(userIdStr)) continue;
      if (userHiddenFromPublicDiscovery(user)) continue;

      // Calculate follower count (active follows only)
      const followerRecords = await ctx.db
        .query("follows")
        .withIndex("by_following_status", (q) =>
          q.eq("followingId", user._id).eq("status", "active"),
        )
        .collect();
      const followerCount = followerRecords.length;

      // Check for active stories
      const activeStories = await ctx.db
        .query("stories")
        .withIndex("by_user_created", (q) => q.eq("userId", user._id))
        .filter((q) => q.gt(q.field("expiresAt"), now))
        .collect();
      const hasActiveStories = activeStories.length > 0;

      // Check for unviewed stories
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

      // Calculate mutual connections
      const mutuals: Array<{
        _id: Id<"users">;
        username?: string;
        fullName?: string;
        profilePictureUrl?: string;
        profilePictureKey?: string;
      }> = [];
      for (const follow of followerRecords) {
        if (viewerFollowingIdsForMutuals.has(String(follow.followerId))) {
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
      }

      // Calculate priority score (hidden from UI)
      let score = 0;

      // Priority 1: Mutual connections (highest - builds trust)
      score += mutuals.length * 1000;

      // Priority 2: Unviewed stories (fresh content)
      if (hasUnviewedStories) score += 500;
      else if (hasActiveStories) score += 100;

      // Priority 3: High follower count (popularity)
      score += followerCount * 5;

      // Priority 4: Profile completeness
      if (user.profilePictureUrl || user.profilePictureKey) score += 50;
      if (user.bio?.trim()) score += 30;
      if (user.username?.trim()) score += 20;

      // Only include if they have some relevance
      if (score > 0 || mutuals.length > 0 || hasActiveStories) {
        candidates.push({
          _id: user._id,
          username: user.username,
          fullName: user.fullName,
          bio: user.bio,
          profilePictureUrl: user.profilePictureUrl,
          profilePictureKey: user.profilePictureKey,
          followerCount,
          hasActiveStories,
          hasUnviewedStories,
          isFollowing: false,
          mutuals,
          mutualCount: mutuals.length,
          score,
        });
      }
    }

    // Sort by score (highest first) - but don't expose this to UI
    candidates.sort((a, b) => b.score - a.score);

    // Return top results
    return candidates.slice(0, maxResults).map((c) => ({
      _id: c._id,
      username: c.username,
      fullName: c.fullName,
      bio: c.bio,
      profilePictureUrl: c.profilePictureUrl,
      profilePictureKey: c.profilePictureKey,
      followerCount: c.followerCount,
      isFollowing: c.isFollowing,
      hasActiveStories: c.hasActiveStories,
      hasUnviewedStories: c.hasUnviewedStories,
      mutuals: c.mutuals,
      mutualCount: c.mutualCount,
    }));
  },
});
