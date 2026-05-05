/**
 * Server-side filters for mute / block / hide-post so feeds and notifications
 * stay consistent (not client-only hiding).
 */

import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type DbCtx = QueryCtx | MutationCtx;

export type ViewerFeedExclusions = {
  hiddenPostIds: Set<string>;
  excludedPostAuthorIds: Set<string>;
};

/** Authors whose posts should not appear in this viewer's home / discover / video feeds. */
export async function loadViewerFeedExclusions(
  ctx: DbCtx,
  viewerId: Id<"users">,
): Promise<ViewerFeedExclusions> {
  const [mutes, blocksOut, blocksIn, hiddenRows] = await Promise.all([
    ctx.db
      .query("mutes")
      .withIndex("by_user", (q) => q.eq("userId", viewerId))
      .collect(),
    ctx.db
      .query("userBlocks")
      .withIndex("by_blocker", (q) => q.eq("blockerId", viewerId))
      .collect(),
    ctx.db
      .query("userBlocks")
      .withIndex("by_blocked", (q) => q.eq("blockedId", viewerId))
      .collect(),
    ctx.db
      .query("hiddenPosts")
      .withIndex("by_user", (q) => q.eq("userId", viewerId))
      .collect(),
  ]);

  const excludedPostAuthorIds = new Set<string>();
  for (const m of mutes) {
    if (m.mutePosts !== false) excludedPostAuthorIds.add(String(m.mutedId));
  }
  for (const b of blocksOut) excludedPostAuthorIds.add(String(b.blockedId));
  for (const b of blocksIn) excludedPostAuthorIds.add(String(b.blockerId));

  return {
    hiddenPostIds: new Set(hiddenRows.map((h) => String(h.postId))),
    excludedPostAuthorIds,
  };
}

export function postExcludedForViewerFeed(
  post: { _id: unknown; userId: Id<"users"> },
  viewerId: Id<"users">,
  ex: ViewerFeedExclusions,
): boolean {
  if (String(post.userId) === String(viewerId)) return false;
  if (ex.hiddenPostIds.has(String(post._id))) return true;
  if (ex.excludedPostAuthorIds.has(String(post.userId))) return true;
  return false;
}

/** Mute/block only — hidden posts stay in the list with `viewerContentHidden` in the API. */
export function postAuthorExcludedForViewerFeed(
  post: { userId: Id<"users"> },
  viewerId: Id<"users">,
  ex: ViewerFeedExclusions,
): boolean {
  if (String(post.userId) === String(viewerId)) return false;
  return ex.excludedPostAuthorIds.has(String(post.userId));
}

export function viewerPostContentHidden(
  post: { _id: unknown; userId: Id<"users"> },
  viewerId: Id<"users">,
  ex: ViewerFeedExclusions,
): boolean {
  if (String(post.userId) === String(viewerId)) return false;
  return ex.hiddenPostIds.has(String(post._id));
}

/** Story rail / viewer: exclude authors (mute stories, blocks). */
export async function loadViewerStoryAuthorExclusions(
  ctx: DbCtx,
  viewerId: Id<"users">,
): Promise<Set<string>> {
  const [mutes, blocksOut, blocksIn] = await Promise.all([
    ctx.db
      .query("mutes")
      .withIndex("by_user", (q) => q.eq("userId", viewerId))
      .collect(),
    ctx.db
      .query("userBlocks")
      .withIndex("by_blocker", (q) => q.eq("blockerId", viewerId))
      .collect(),
    ctx.db
      .query("userBlocks")
      .withIndex("by_blocked", (q) => q.eq("blockedId", viewerId))
      .collect(),
  ]);

  const out = new Set<string>();
  for (const m of mutes) {
    if (m.muteStories !== false) out.add(String(m.mutedId));
  }
  for (const b of blocksOut) out.add(String(b.blockedId));
  for (const b of blocksIn) out.add(String(b.blockerId));
  return out;
}

/** True if either user has blocked the other. */
export async function usersBlockedEitherWay(
  ctx: DbCtx,
  a: Id<"users">,
  b: Id<"users">,
): Promise<boolean> {
  if (String(a) === String(b)) return false;
  const [ab, ba] = await Promise.all([
    ctx.db
      .query("userBlocks")
      .withIndex("by_blocker_blocked", (q) =>
        q.eq("blockerId", a).eq("blockedId", b),
      )
      .unique(),
    ctx.db
      .query("userBlocks")
      .withIndex("by_blocker_blocked", (q) =>
        q.eq("blockerId", b).eq("blockedId", a),
      )
      .unique(),
  ]);
  return !!ab || !!ba;
}

/**
 * Do not create / deliver notifications from `senderId` to `receiverId` when muted or blocked.
 */
export async function notificationSuppressedBetween(
  ctx: DbCtx,
  receiverId: Id<"users">,
  senderId: Id<"users">,
): Promise<boolean> {
  if (String(receiverId) === String(senderId)) return true;
  const [mute, blockOut, blockIn] = await Promise.all([
    ctx.db
      .query("mutes")
      .withIndex("by_user_muted", (q) =>
        q.eq("userId", receiverId).eq("mutedId", senderId),
      )
      .unique(),
    ctx.db
      .query("userBlocks")
      .withIndex("by_blocker_blocked", (q) =>
        q.eq("blockerId", receiverId).eq("blockedId", senderId),
      )
      .unique(),
    ctx.db
      .query("userBlocks")
      .withIndex("by_blocker_blocked", (q) =>
        q.eq("blockerId", senderId).eq("blockedId", receiverId),
      )
      .unique(),
  ]);
  if (blockOut || blockIn) return true;
  if (mute) return true;
  return false;
}

/** User IDs to omit from search / suggestions for `viewerId`. */
export async function loadSearchExcludedUserIds(
  ctx: DbCtx,
  viewerId: Id<"users">,
): Promise<Set<string>> {
  const [blocksOut, blocksIn, mutes] = await Promise.all([
    ctx.db
      .query("userBlocks")
      .withIndex("by_blocker", (q) => q.eq("blockerId", viewerId))
      .collect(),
    ctx.db
      .query("userBlocks")
      .withIndex("by_blocked", (q) => q.eq("blockedId", viewerId))
      .collect(),
    ctx.db
      .query("mutes")
      .withIndex("by_user", (q) => q.eq("userId", viewerId))
      .collect(),
  ]);
  const s = new Set<string>();
  for (const b of blocksOut) s.add(String(b.blockedId));
  for (const b of blocksIn) s.add(String(b.blockerId));
  for (const m of mutes) s.add(String(m.mutedId));
  return s;
}
