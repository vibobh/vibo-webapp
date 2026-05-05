import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { notificationSuppressedBetween } from "./viewerContentFilters";

async function wantsStoryLikeInApp(
  ctx: MutationCtx,
  receiverId: Id<"users">,
): Promise<boolean> {
  const row = await ctx.db
    .query("userNotificationSettings")
    .withIndex("by_user", (q) => q.eq("userId", receiverId))
    .unique();
  if (!row) return true;
  if (row.likeStoryInApp === false) return false;
  return true;
}

function dedupeSenders(ids: Id<"users">[], cap: number): Id<"users">[] {
  const out: Id<"users">[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const k = String(id);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(id);
    if (out.length >= cap) break;
  }
  return out;
}

/** Call after a story like is inserted (same mutation transaction). */
export async function onStoryLikedNotification(
  ctx: MutationCtx,
  args: {
    storyId: Id<"stories">;
    likerId: Id<"users">;
    storyOwnerId: Id<"users">;
  },
): Promise<void> {
  const { storyId, likerId, storyOwnerId } = args;
  if (likerId === storyOwnerId) return;
  if (await notificationSuppressedBetween(ctx, storyOwnerId, likerId)) {
    return;
  }
  if (!(await wantsStoryLikeInApp(ctx, storyOwnerId))) return;

  const targetId = String(storyId);
  const now = Date.now();

  const existing = await ctx.db
    .query("notificationGroups")
    .withIndex("by_receiver_target", (q) =>
      q
        .eq("receiverId", storyOwnerId)
        .eq("type", "like_story")
        .eq("targetType", "story")
        .eq("targetId", targetId),
    )
    .unique();

  if (existing) {
    const newCount = existing.count + 1;
    const senders = dedupeSenders([likerId, ...existing.latestSenderIds], 3);
    await ctx.db.patch(existing._id, {
      count: newCount,
      latestSenderIds: senders,
      updatedAt: now,
      readAt: undefined,
    });
    return;
  }

  await ctx.db.insert("notificationGroups", {
    receiverId: storyOwnerId,
    type: "like_story",
    targetType: "story",
    targetId,
    count: 1,
    latestSenderIds: [likerId],
    updatedAt: now,
  });
}

/** Call after a story like is removed. */
export async function onStoryUnlikedNotification(
  ctx: MutationCtx,
  args: {
    storyId: Id<"stories">;
    likerId: Id<"users">;
    storyOwnerId: Id<"users">;
  },
): Promise<void> {
  const { storyId, likerId, storyOwnerId } = args;
  if (likerId === storyOwnerId) return;

  const targetId = String(storyId);
  const existing = await ctx.db
    .query("notificationGroups")
    .withIndex("by_receiver_target", (q) =>
      q
        .eq("receiverId", storyOwnerId)
        .eq("type", "like_story")
        .eq("targetType", "story")
        .eq("targetId", targetId),
    )
    .unique();

  if (!existing) return;

  const newCount = Math.max(0, existing.count - 1);
  const senders = existing.latestSenderIds.filter((id) => id !== likerId);
  const now = Date.now();

  if (newCount <= 0) {
    await ctx.db.delete(existing._id);
    return;
  }

  await ctx.db.patch(existing._id, {
    count: newCount,
    latestSenderIds: senders.slice(0, 3),
    updatedAt: now,
  });
}
