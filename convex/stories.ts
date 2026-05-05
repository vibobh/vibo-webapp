import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

const STORY_TTL_MS = 24 * 60 * 60 * 1000;

export interface StorySegmentDTO {
  id: Id<"stories">;
  mediaUrl: string;
  thumbUrl?: string;
  createdAt: number;
}

export interface StoryUserDTO {
  userId: Id<"users">;
  username: string;
  fullName?: string;
  profilePictureUrl?: string;
  hasUnseen: boolean;
  segments: StorySegmentDTO[];
}

interface PendingStoryUser {
  user: Doc<"users">;
  segments: Doc<"stories">[];
}

function mediaUrlFromStory(s: Doc<"stories">): string {
  const k = s.mediaKey;
  if (k.startsWith("http://") || k.startsWith("https://")) return k;
  return k;
}

export const listActive = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const max = Math.max(1, Math.min(50, limit ?? 20));
    const now = Date.now();

    const recent = await ctx.db.query("stories").order("desc").take(300);
    const buckets = new Map<string, PendingStoryUser>();
    for (const s of recent) {
      if (s.expiresAt < now) continue;
      const key = s.userId as unknown as string;
      let pending = buckets.get(key);
      if (!pending) {
        const u = await ctx.db.get(s.userId);
        if (!u) continue;
        pending = { user: u, segments: [] };
        buckets.set(key, pending);
      }
      pending.segments.push(s);
      if (buckets.size >= max + 5) break;
    }

    const identity = await ctx.auth.getUserIdentity();
    const viewerId = identity ? (identity.subject as Id<"users">) : null;

    let viewedSegmentIds: Set<string> = new Set();
    if (viewerId) {
      const views = await ctx.db
        .query("storyViews")
        .withIndex("by_viewer", (q) => q.eq("viewerId", viewerId))
        .take(500);
      viewedSegmentIds = new Set(views.map((v) => v.storyId as unknown as string));
    }

    const out: StoryUserDTO[] = [];
    const pendingList: PendingStoryUser[] = Array.from(buckets.values());
    for (const pending of pendingList) {
      pending.segments.sort(
        (a: Doc<"stories">, b: Doc<"stories">) => a.createdAt - b.createdAt,
      );
      const segments: StorySegmentDTO[] = pending.segments.map((seg: Doc<"stories">) => ({
        id: seg._id,
        mediaUrl: mediaUrlFromStory(seg),
        thumbUrl: seg.sharedPostThumbUrl,
        createdAt: seg.createdAt,
      }));
      const hasUnseen = segments.some(
        (seg) => !viewedSegmentIds.has(seg.id as unknown as string),
      );
      out.push({
        userId: pending.user._id,
        username: pending.user.username ?? "vibo",
        fullName: pending.user.fullName,
        profilePictureUrl: pending.user.profilePictureUrl,
        hasUnseen,
        segments,
      });
    }

    out.sort((a, b) => {
      const aSelf = viewerId && (a.userId as unknown as string) === (viewerId as unknown as string);
      const bSelf = viewerId && (b.userId as unknown as string) === (viewerId as unknown as string);
      if (aSelf && !bSelf) return 1;
      if (bSelf && !aSelf) return -1;
      const aLatest = a.segments.at(-1)?.createdAt ?? 0;
      const bLatest = b.segments.at(-1)?.createdAt ?? 0;
      return bLatest - aLatest;
    });

    return out.slice(0, max);
  },
});

export const viewSegment = mutation({
  args: { storyId: v.id("stories") },
  handler: async (ctx, { storyId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return;
    const viewerId = identity.subject as Id<"users">;
    const existing = await ctx.db
      .query("storyViews")
      .withIndex("by_story_viewer", (q) =>
        q.eq("storyId", storyId).eq("viewerId", viewerId),
      )
      .first();
    if (existing) return;
    await ctx.db.insert("storyViews", {
      storyId,
      viewerId,
      viewedAt: Date.now(),
    });
  },
});

export const createSegment = mutation({
  args: {
    mediaUrl: v.string(),
    thumbUrl: v.optional(v.string()),
    mediaType: v.optional(v.union(v.literal("image"), v.literal("video"))),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const userId = identity.subject as Id<"users">;
    const now = Date.now();
    const mediaType = args.mediaType ?? "image";
    const mimeType =
      mediaType === "video" ? "video/mp4" : "image/jpeg";
    const id = await ctx.db.insert("stories", {
      userId,
      mediaKey: args.mediaUrl,
      mediaType,
      mimeType,
      caption: undefined,
      createdAt: now,
      expiresAt: now + STORY_TTL_MS,
    });
    void args.thumbUrl;
    return { storyId: id };
  },
});
