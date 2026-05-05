/**
 * Feed distribution helpers for posts with accepted collaborators.
 */

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export function postDistributionUserIds(
  post: Doc<"posts">,
): Id<"users">[] {
  const raw = post.distributionUserIds;
  if (raw && raw.length > 0) return raw;
  return [post.userId];
}

/** True when the viewer's follow graph includes the creator or any distribution actor. */
export function postMatchesViewerFollowGraph(
  post: Doc<"posts">,
  followingIds: Set<string>,
): boolean {
  for (const id of postDistributionUserIds(post)) {
    if (followingIds.has(String(id))) return true;
  }
  return false;
}

export async function syncPostDistributionUserIds(
  ctx: MutationCtx,
  postId: Id<"posts">,
): Promise<void> {
  const post = await ctx.db.get(postId);
  if (!post) return;
  const rows = await ctx.db
    .query("postCollaborators")
    .withIndex("by_post", (q) => q.eq("postId", postId))
    .collect();
  const accepted = rows
    .filter((r) => r.status === "accepted")
    .map((r) => r.collaboratorUserId);
  const combined = [post.userId, ...accepted];
  const seen = new Set<string>();
  const out: Id<"users">[] = [];
  for (const id of combined) {
    const s = String(id);
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(id);
  }
  await ctx.db.patch(postId, {
    distributionUserIds: out,
    updatedAt: Date.now(),
  });
}
