import { internalMutation } from "./_generated/server";

/**
 * One-time: copy `storyLikes` → `likes` and delete legacy rows.
 * Run from Convex dashboard: Functions → internal.migrations.migrateLegacyStoryLikes → Run
 */
export const migrateLegacyStoryLikes = internalMutation({
  args: {},
  handler: async (ctx) => {
    const legacy = await ctx.db.query("storyLikes").collect();
    let inserted = 0;
    for (const row of legacy) {
      const targetId = String(row.storyId);
      const existing = await ctx.db
        .query("likes")
        .withIndex("by_user_target", (q) =>
          q
            .eq("userId", row.userId)
            .eq("targetType", "story")
            .eq("targetId", targetId),
        )
        .unique();
      if (!existing) {
        await ctx.db.insert("likes", {
          userId: row.userId,
          targetType: "story",
          targetId,
          createdAt: row.createdAt,
        });
        inserted += 1;
      }
      await ctx.db.delete(row._id);
    }
    return { legacyRows: legacy.length, inserted };
  },
});
