import { v } from "convex/values";

import type { TableNames } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";

/**
 * Destroys **all** app data (users, posts, stories, DMs, notifications, etc.).
 * Convex `_storage` blobs are not deleted (orphans possible — fine for dev).
 *
 * Run from project root (after `npx convex dev` / deploy picks this up):
 *   npx convex run devPurge:wipeAllAppData '{"confirm":"DELETE_ALL_APP_DATA"}'
 */
const PURGE_ORDER = [
  "commentLikes",
  "comments",
  "postTags",
  "postMedia",
  "savedPosts",
  "hiddenPosts",
  "likes",
  "storyViews",
  "storyReplies",
  "storyLikes",
  "stories",
  "messages",
  "conversationMembers",
  "conversations",
  "notificationGroups",
  "uploadSessions",
  "moderationActions",
  "reports",
  "appeals",
  "posts",
  "follows",
  "recentSearches",
  "closeFriends",
  "mutes",
  "restricts",
  "userBlocks",
  "userNotificationSettings",
  "pushDeviceTokens",
  "emailOtps",
  "users",
] as const satisfies readonly TableNames[];

export const wipeAllAppData = internalMutation({
  args: {
    confirm: v.literal("DELETE_ALL_APP_DATA"),
  },
  handler: async (ctx) => {
    const counts: Record<string, number> = {};
    let total = 0;
    for (const table of PURGE_ORDER) {
      const docs = await ctx.db.query(table).collect();
      for (const d of docs) {
        await ctx.db.delete(d._id);
      }
      counts[table] = docs.length;
      total += docs.length;
    }
    return { ok: true as const, total, counts };
  },
});

/**
 * Purges all data for every user except "yousif". Broken into tiny single-table
 * mutations to stay under Convex's 4096-reads-per-call limit.
 *
 * Run the shell script below (copy-paste into your terminal):
 *
 *   bash convex/devPurge-run.sh
 *
 * Or run each step manually (re-run each until deleted=0):
 *   npx convex run devPurge:purgeBatch '{"table":"userEvents","confirm":"PURGE"}'
 *   npx convex run devPurge:purgeBatch '{"table":"productEvents","confirm":"PURGE"}'
 *   ... (see purgeBatch for all tables)
 *   npx convex run devPurge:purgeOtherUsersBatch '{"table":"users","confirm":"PURGE"}'
 */

const BATCH = 500; // conservative; each row costs 1 read + 1 write

/**
 * Wipe an entire table unconditionally (for tables with no user-ownership filter).
 * Re-run until deleted === 0.
 */
export const purgeBatch = internalMutation({
  args: {
    confirm: v.literal("PURGE"),
    table: v.string(),
  },
  handler: async (ctx, args) => {
    const rows = await (ctx.db.query(args.table as TableNames) as any).take(
      BATCH,
    );
    for (const row of rows) await ctx.db.delete(row._id);
    return { table: args.table, deleted: rows.length };
  },
});

/**
 * Wipe rows in a table that belong to non-yousif users.
 * Identifies ownership by checking common userId-like fields.
 * Re-run until deleted === 0.
 */
export const purgeOtherUsersBatch = internalMutation({
  args: {
    confirm: v.literal("PURGE"),
    table: v.string(),
    keepUsername: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const keepUsername = args.keepUsername ?? "yousif";
    const keepUser = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", keepUsername))
      .unique();
    if (!keepUser)
      return { ok: false, error: `User "${keepUsername}" not found` };
    const keepId = keepUser._id as string;

    const rows = await (ctx.db.query(args.table as TableNames) as any).take(
      BATCH,
    );
    let deleted = 0;
    for (const row of rows) {
      const r = row as Record<string, unknown>;
      // Check any ownership-like field against keepId
      const owner =
        r.userId ??
        r.followerId ??
        r.blockerId ??
        r.reporterId ??
        r.adminId ??
        r.receiverId ??
        r.authorId ??
        r.creatorUserId;
      if (owner !== keepId) {
        await ctx.db.delete(row._id);
        deleted++;
      }
    }
    return { table: args.table, deleted, keepId };
  },
});
