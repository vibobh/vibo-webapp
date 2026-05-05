/**
 * Story Templates — create, discover, and use reusable story formats.
 *
 * Flow:
 *   Creator posts a story → taps "Save as Template" in editor
 *     → createStoryTemplate() records a storyTemplates row
 *
 *   Viewer sees a story with a templateId
 *     → getStoryTemplate() returns metadata + creator info
 *     → "Use Template" CTA navigates to story editor with template params
 *
 *   When a story is published with a templateId
 *     → stories.create() calls recordTemplateUse() to bump usesCount
 */

import { v } from "convex/values";
import {
  assertUserCanMutate,
  canViewerSeeTargetUserProfile,
  viewerCannotAccessAppContent,
} from "./accountModeration";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { buildPublicMediaUrl } from "./mediaUrl";

/** Max templates a single user may create per day (anti-spam). */
const DAILY_TEMPLATE_LIMIT = 10;

// ─────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────

/**
 * Save the current story as a reusable template.
 * Validates ownership, daily rate-limit, and story recency before inserting.
 */
export const createStoryTemplate = mutation({
  args: {
    userId: v.id("users"),
    sourceStoryId: v.id("stories"),
    title: v.optional(v.string()),
    layoutJson: v.string(),
    category: v.optional(v.string()),
  },
  handler: async (ctx, { userId, sourceStoryId, title, layoutJson, category }) => {
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("Unauthorized");
    await assertUserCanMutate(ctx, userId);

    const story = await ctx.db.get(sourceStoryId);
    if (!story || story.userId !== userId) {
      throw new Error("Story not found or not owned by caller");
    }
    if (story.expiresAt <= Date.now()) {
      throw new Error("Cannot template an expired story");
    }

    // Daily rate-limit check
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentCount = await ctx.db
      .query("storyTemplates")
      .withIndex("by_creator", (q) =>
        q.eq("creatorUserId", userId).gt("createdAt", oneDayAgo),
      )
      .collect()
      .then((rows) => rows.length);
    if (recentCount >= DAILY_TEMPLATE_LIMIT) {
      throw new Error("Daily template creation limit reached");
    }

    // Prevent duplicate templates from the same source story
    const existing = await ctx.db
      .query("storyTemplates")
      .withIndex("by_source_story", (q) => q.eq("sourceStoryId", sourceStoryId))
      .first();
    if (existing) {
      return { templateId: existing._id, alreadyExists: true };
    }

    const sanitizedTitle = title?.trim().slice(0, 80) || undefined;
    const sanitizedCategory = category?.trim().slice(0, 40) || undefined;

    const templateId = await ctx.db.insert("storyTemplates", {
      creatorUserId: userId,
      sourceStoryId,
      title: sanitizedTitle,
      layoutJson,
      usesCount: 0,
      status: "active",
      createdAt: Date.now(),
      category: sanitizedCategory,
    });

    // Patch the source story to point at its template
    await ctx.db.patch(sourceStoryId, { templateId });

    return { templateId, alreadyExists: false };
  },
});

/**
 * Increment usesCount when a viewer creates a new story from this template.
 * Called internally by stories.create when a templateId is supplied.
 */
export const recordTemplateUse = internalMutation({
  args: { templateId: v.id("storyTemplates") },
  handler: async (ctx, { templateId }) => {
    const tmpl = await ctx.db.get(templateId);
    if (!tmpl || tmpl.status !== "active") return;
    await ctx.db.patch(templateId, { usesCount: tmpl.usesCount + 1 });
  },
});

/**
 * Moderators / admins can remove a template.
 */
export const removeStoryTemplate = mutation({
  args: {
    callerUserId: v.id("users"),
    templateId: v.id("storyTemplates"),
  },
  handler: async (ctx, { callerUserId, templateId }) => {
    const caller = await ctx.db.get(callerUserId);
    if (!caller) throw new Error("Unauthorized");
    await assertUserCanMutate(ctx, callerUserId);
    const tmpl = await ctx.db.get(templateId);
    if (!tmpl) return;
    if (tmpl.creatorUserId !== callerUserId) {
      throw new Error("Not authorized to remove this template");
    }
    await ctx.db.patch(templateId, { status: "removed" });
  },
});

// ─────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────

/**
 * Fetch a single template for the viewer CTA card.
 * Returns null if the template is removed or the story is expired.
 */
export const getStoryTemplate = query({
  args: {
    templateId: v.id("storyTemplates"),
    viewerUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, { templateId, viewerUserId }) => {
    const tmpl = await ctx.db.get(templateId);
    if (!tmpl || tmpl.status !== "active") return null;

    const viewer =
      viewerUserId != null ? await ctx.db.get(viewerUserId) : null;
    if (viewerUserId != null && viewerCannotAccessAppContent(viewer)) {
      return null;
    }

    const creator = await ctx.db.get(tmpl.creatorUserId);
    if (!creator) return null;
    if (
      viewerUserId != null &&
      !canViewerSeeTargetUserProfile(creator, viewerUserId, viewer)
    ) {
      return null;
    }

    const sourceStory = await ctx.db.get(tmpl.sourceStoryId);
    const mediaUrl = sourceStory
      ? buildPublicMediaUrl(
          sourceStory.mediaKey,
          undefined,
          sourceStory.mediaStorageRegion,
        )
      : null;

    const creatorAvatarUrl = (() => {
      if (creator.profilePictureUrl?.trim()) return creator.profilePictureUrl;
      if (creator.profilePictureKey?.trim()) {
        return buildPublicMediaUrl(
          creator.profilePictureKey,
          undefined,
          creator.profilePictureStorageRegion,
        );
      }
      return null;
    })();

    return {
      templateId: tmpl._id,
      title: tmpl.title ?? null,
      usesCount: tmpl.usesCount,
      category: tmpl.category ?? null,
      layoutJson: tmpl.layoutJson,
      creatorUserId: tmpl.creatorUserId,
      creatorUsername: creator.username ?? null,
      creatorAvatarUrl,
      sourceMediaUrl: mediaUrl,
      sourceMediaType: sourceStory?.mediaType ?? null,
      createdAt: tmpl.createdAt,
    };
  },
});

/**
 * List trending / active templates for Explore surfacing.
 * Returns up to `limit` templates sorted by usesCount descending.
 */
export const listTrendingStoryTemplates = query({
  args: {
    viewerUserId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, { viewerUserId, limit, category }) => {
    const cap = Math.min(40, Math.max(1, limit ?? 20));
    const viewer =
      viewerUserId != null ? await ctx.db.get(viewerUserId) : null;
    if (viewerUserId != null && viewerCannotAccessAppContent(viewer)) {
      return [];
    }

    const rows = await ctx.db
      .query("storyTemplates")
      .withIndex("by_status_uses", (q) => q.eq("status", "active"))
      .order("desc")
      .take(200);

    const out: {
      templateId: Id<"storyTemplates">;
      title: string | null;
      usesCount: number;
      category: string | null;
      creatorUsername: string | null;
      sourceMediaUrl: string | null;
    }[] = [];

    for (const tmpl of rows) {
      if (out.length >= cap) break;
      if (category && tmpl.category !== category) continue;

      const creator = await ctx.db.get(tmpl.creatorUserId);
      if (!creator) continue;
      if (
        viewerUserId != null &&
        !canViewerSeeTargetUserProfile(creator, viewerUserId, viewer)
      ) {
        continue;
      }

      const sourceStory = await ctx.db.get(tmpl.sourceStoryId);
      const mediaUrl = sourceStory
        ? buildPublicMediaUrl(
            sourceStory.mediaKey,
            undefined,
            sourceStory.mediaStorageRegion,
          )
        : null;

      out.push({
        templateId: tmpl._id,
        title: tmpl.title ?? null,
        usesCount: tmpl.usesCount,
        category: tmpl.category ?? null,
        creatorUsername: creator.username ?? null,
        sourceMediaUrl: mediaUrl,
      });
    }

    return out;
  },
});

/**
 * Fetch the template associated with a specific story (if any).
 * Used by the viewer to show/hide the "Use Template" CTA.
 */
export const getTemplateForStory = query({
  args: {
    storyId: v.id("stories"),
    viewerUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, { storyId, viewerUserId }) => {
    const story = await ctx.db.get(storyId);
    if (!story?.templateId) return null;
    // Delegate to getStoryTemplate (inline to avoid circular dep)
    const templateId = story.templateId;
    const tmpl = await ctx.db.get(templateId);
    if (!tmpl || tmpl.status !== "active") return null;

    const viewer =
      viewerUserId != null ? await ctx.db.get(viewerUserId) : null;
    if (viewerUserId != null && viewerCannotAccessAppContent(viewer)) {
      return null;
    }

    return {
      templateId: tmpl._id,
      title: tmpl.title ?? null,
      usesCount: tmpl.usesCount,
      layoutJson: tmpl.layoutJson,
    };
  },
});
