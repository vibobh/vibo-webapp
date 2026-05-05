import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

interface UserCard {
  id: Id<"users">;
  username?: string;
  fullName?: string;
  profilePictureUrl?: string;
  verificationTier?: "blue" | "gold" | "gray";
  followerCount?: number;
}

function toUserCard(u: Doc<"users">): UserCard {
  return {
    id: u._id,
    username: u.username,
    fullName: u.fullName,
    profilePictureUrl: u.profilePictureUrl,
    verificationTier: u.verificationTier,
    followerCount: u.followerCount,
  };
}

async function getViewerId(ctx: QueryCtx): Promise<Id<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return identity.subject as Id<"users">;
}

export const suggestionsForCurrent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const viewer = await getViewerId(ctx);
    const max = Math.max(1, Math.min(50, limit ?? 6));

    let following = new Set<string>();
    if (viewer) {
      const rows = await ctx.db
        .query("follows")
        .withIndex("by_follower", (q) => q.eq("followerId", viewer))
        .take(500);
      for (const r of rows) {
        if (r.status === "active" || r.status === "pending") {
          following.add(r.followingId as unknown as string);
        }
      }
    }

    const recent = await ctx.db.query("users").order("desc").take(max * 3 + 5);

    const out: UserCard[] = [];
    for (const u of recent) {
      if (out.length >= max) break;
      if (viewer && (u._id as unknown as string) === (viewer as unknown as string)) continue;
      if (following.has(u._id as unknown as string)) continue;
      if (u.accountModerationStatus && u.accountModerationStatus !== "active") continue;
      out.push(toUserCard(u));
    }

    return out;
  },
});

export const searchUsers = query({
  args: { query: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { query, limit }) => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const max = Math.max(1, Math.min(40, limit ?? 12));

    const rows = await ctx.db.query("users").take(2000);
    const out: UserCard[] = [];
    for (const u of rows) {
      const handle = (u.username ?? "").toLowerCase();
      const name = (u.fullName ?? "").toLowerCase();
      if (handle.includes(q) || name.includes(q)) {
        if (u.accountModerationStatus && u.accountModerationStatus !== "active") continue;
        out.push(toUserCard(u));
        if (out.length >= max) break;
      }
    }
    return out;
  },
});

export const recentUsers = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const max = Math.max(1, Math.min(40, limit ?? 8));
    const rows = await ctx.db.query("users").order("desc").take(max + 5);
    const viewer = await getViewerId(ctx);
    const out: UserCard[] = [];
    for (const u of rows) {
      if (viewer && (u._id as unknown as string) === (viewer as unknown as string)) continue;
      if (u.accountModerationStatus && u.accountModerationStatus !== "active") continue;
      out.push(toUserCard(u));
      if (out.length >= max) break;
    }
    return out;
  },
});

export const isFollowing = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const viewer = await getViewerId(ctx);
    if (!viewer) return false;
    const row = await ctx.db
      .query("follows")
      .withIndex("by_follower_following", (q) =>
        q.eq("followerId", viewer).eq("followingId", userId),
      )
      .first();
    return row !== null && (row.status === "active" || row.status === "pending");
  },
});

export const toggleFollow = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const followerId = identity.subject as Id<"users">;
    if ((followerId as unknown as string) === (userId as unknown as string)) {
      throw new Error("You cannot follow yourself");
    }
    const followee = await ctx.db.get(userId);
    if (!followee) throw new Error("User not found");

    const existing = await ctx.db
      .query("follows")
      .withIndex("by_follower_following", (q) =>
        q.eq("followerId", followerId).eq("followingId", userId),
      )
      .first();

    const me = await ctx.db.get(followerId);
    const now = Date.now();

    if (existing) {
      const wasActive = existing.status === "active";
      await ctx.db.delete(existing._id);
      if (wasActive) {
        await ctx.db.patch(userId, {
          followerCount: Math.max(0, (followee.followerCount ?? 0) - 1),
        });
        if (me) {
          await ctx.db.patch(followerId, {
            followingCount: Math.max(0, (me.followingCount ?? 0) - 1),
          });
        }
      }
      return { following: false };
    }

    const status = followee.isPrivate ? "pending" : "active";
    await ctx.db.insert("follows", {
      followerId,
      followingId: userId,
      status,
      createdAt: now,
    });

    if (status === "active") {
      await ctx.db.patch(userId, {
        followerCount: (followee.followerCount ?? 0) + 1,
      });
      if (me) {
        await ctx.db.patch(followerId, {
          followingCount: (me.followingCount ?? 0) + 1,
        });
      }
    }

    return { following: true };
  },
});
