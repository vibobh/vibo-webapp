import type { Doc, Id } from "./_generated/dataModel";

/**
 * Posts created on/after this instant must finish the moderation pipeline
 * (`moderationChecked`) before ranking / feed distribution considers them cleared.
 */
export const MODERATION_DISTRIBUTION_CHECK_REQUIRED_AFTER_MS = Date.UTC(
  2026,
  3,
  28,
);

export type CanonicalModerationStatus =
  | "active"
  | "pending_moderation"
  | "flagged"
  | "restricted"
  | "removed"
  | "deleted";

export type ModerationVisibility = "public" | "hidden" | "shadow_hidden";

/** Map stored post moderation to canonical values (legacy rows included). */
export function normalizeModerationStatus(
  raw: Doc<"posts">["moderationStatus"] | undefined,
): CanonicalModerationStatus {
  if (!raw || raw === "approved" || raw === "rejected") {
    return "active";
  }
  if (raw === "pending") return "pending_moderation";
  return raw;
}

export function normalizeModerationVisibility(
  raw: Doc<"posts">["moderationVisibilityStatus"] | undefined,
): ModerationVisibility {
  return raw ?? "public";
}

/** True when the post must not appear in feeds, grids, or search for anyone. */
export function postShouldOmitFromAllSurfaces(post: Doc<"posts">): boolean {
  const ms = normalizeModerationStatus(post.moderationStatus);
  const mv = normalizeModerationVisibility(post.moderationVisibilityStatus);
  if (ms === "removed" || ms === "deleted") return true;
  if (mv === "hidden") return true;
  return false;
}

export function postHiddenFromNonOwner(
  post: Doc<"posts">,
  viewerId: Id<"users"> | null | undefined,
): boolean {
  const mv = normalizeModerationVisibility(post.moderationVisibilityStatus);
  const isOwner = viewerId != null && post.userId === viewerId;
  return mv === "shadow_hidden" && !isOwner;
}

/** Explore-style surfaces: hashtag search, location clusters, global video feed. */
export function postExcludedFromBroadDiscovery(post: Doc<"posts">): boolean {
  const ms = normalizeModerationStatus(post.moderationStatus);
  const mv = normalizeModerationVisibility(post.moderationVisibilityStatus);
  if (ms === "pending_moderation") return true;
  if (ms === "flagged") return true;
  if (ms === "restricted") return true;
  if (ms === "removed" || ms === "deleted") return true;
  if (mv === "hidden" || mv === "shadow_hidden") return true;
  return false;
}

/** Home / following slice: following feed + self; not the discover fill-in pass. */
export function postVisibleInFollowingSlice(
  post: Doc<"posts">,
  viewerId: Id<"users">,
): boolean {
  const isOwner = post.userId === viewerId;
  if (!isOwner && postShouldOmitFromAllSurfaces(post)) return false;
  if (isOwner) {
    const ms = normalizeModerationStatus(post.moderationStatus);
    if (ms === "removed" || ms === "deleted") return false;
  }
  if (postHiddenFromNonOwner(post, viewerId)) return false;
  return true;
}

export type ProfileGridModeration = "omit" | "unavailable" | "show";

export function profileGridModerationForPost(
  post: Doc<"posts">,
  profileUserId: Id<"users">,
  viewerId: Id<"users"> | null | undefined,
): ProfileGridModeration {
  const ms = normalizeModerationStatus(post.moderationStatus);
  const mv = normalizeModerationVisibility(post.moderationVisibilityStatus);
  const viewingOwnProfile = viewerId === profileUserId;

  if (ms === "pending_moderation") {
    if (mv === "hidden" || mv === "shadow_hidden") {
      if (viewingOwnProfile && profileUserId === post.userId) return "show";
      return "omit";
    }
    return "show";
  }
  if (ms === "removed" || ms === "deleted" || mv === "hidden") {
    if (viewingOwnProfile && profileUserId === post.userId)
      return "unavailable";
    return "omit";
  }
  if (mv === "shadow_hidden" && viewerId !== post.userId) return "omit";
  return "show";
}

/**
 * UI copy: "This content is no longer available" (moderation), distinct from
 * privacy (private account / followers-only).
 */
export function moderationUnavailableForViewer(
  post: Doc<"posts">,
  viewerId: Id<"users"> | null | undefined,
): boolean {
  const ms = normalizeModerationStatus(post.moderationStatus);
  const mv = normalizeModerationVisibility(post.moderationVisibilityStatus);
  const isOwner = viewerId != null && post.userId === viewerId;
  if (ms === "removed" || ms === "deleted" || mv === "hidden") return true;
  if (mv === "shadow_hidden" && !isOwner) return true;
  return false;
}

/**
 * Hard safety gate: posts that failed moderation must not stay `public`.
 * `pending_moderation` + `public` is allowed (live while async review runs).
 */
export function assertModerationInvariant(post: Doc<"posts">): void {
  const ms = normalizeModerationStatus(post.moderationStatus);
  const mv = normalizeModerationVisibility(post.moderationVisibilityStatus);
  if (mv !== "public") return;
  if (
    ms === "flagged" ||
    ms === "restricted" ||
    ms === "removed" ||
    ms === "deleted"
  ) {
    throw new Error(
      `UNSAFE_POST_VISIBLE: post=${String(post._id)} moderationStatus=${ms} ` +
        `moderationVisibilityStatus=${mv} — this status must not be public`,
    );
  }
}

/**
 * Distribution gate: published + moderated active/public, and (for posts created after
 * `MODERATION_DISTRIBUTION_CHECK_REQUIRED_AFTER_MS`) moderation pipeline completion.
 */
function moderationAiGateSatisfied(post: Doc<"posts">): boolean {
  if ((post.createdAt ?? 0) < MODERATION_DISTRIBUTION_CHECK_REQUIRED_AFTER_MS) {
    return true;
  }
  return post.moderationChecked === true;
}

export function postClearedForDistribution(post: Doc<"posts">): boolean {
  if (post.status !== "published") return false;
  const ms = normalizeModerationStatus(post.moderationStatus);
  const mv = normalizeModerationVisibility(post.moderationVisibilityStatus);
  if (ms !== "active" || mv !== "public") return false;
  return moderationAiGateSatisfied(post);
}

/**
 * Maps violation category names to human-readable headlines.
 * Used in evidence-based moderation messages shown to post authors.
 */
const CATEGORY_HEADLINE: Record<string, string> = {
  violence: "graphic violence",
  nudity: "nudity",
  sexual: "explicit sexual content",
  suggestive: "sexually suggestive content",
  hate: "hate speech or hateful imagery",
  spam: "spam or repetitive content",
  gore: "graphic gore",
};

/**
 * Pure evidence-based mapping from moderation output → user-facing reason.
 * No generic fallbacks. If there is no evidence, no reason is shown.
 */
export type ModerationDecisionTag =
  | "allow"
  | "block"
  | "flag_sensitive"
  | "flag_spam";

export function friendlyModerationReason(
  decision: ModerationDecisionTag,
  _rawReason: string,
  opts?: {
    primaryCategory?: string;
    evidenceJson?: string;
  },
): string {
  if (decision === "allow") return "Looks good";

  if (opts?.primaryCategory && opts.primaryCategory !== "safe") {
    const label =
      CATEGORY_HEADLINE[opts.primaryCategory] ?? opts.primaryCategory;
    let evidence: string[] = [];
    if (opts.evidenceJson) {
      try {
        const parsed = JSON.parse(opts.evidenceJson);
        if (Array.isArray(parsed)) {
          evidence = parsed.filter(
            (e): e is string => typeof e === "string" && e.trim().length > 2,
          );
        }
      } catch {
        // ignore malformed json
      }
    }
    if (evidence.length > 0) {
      const bulletList = evidence
        .slice(0, 3)
        .map((e) => `• ${e}`)
        .join("\n");
      return `This post was restricted due to ${label}.\n\nWe detected:\n${bulletList}`;
    }
    return `This post was restricted due to ${label}.`;
  }

  return "This content was flagged for review.";
}

/** Short label used in grid badges and chips. */
export function moderationStatusBadge(
  status: CanonicalModerationStatus,
  visibility: ModerationVisibility,
): { label: string; tone: "danger" | "warning" | "info" | null } {
  if (status === "removed" || status === "deleted")
    return { label: "Removed", tone: "danger" };
  if (status === "restricted")
    return { label: "Restricted", tone: "warning" };
  if (status === "flagged" || visibility === "hidden")
    return { label: "Hidden", tone: "warning" };
  if (status === "pending_moderation")
    return { label: "", tone: null };
  if (visibility === "shadow_hidden")
    return { label: "Limited", tone: "info" };
  return { label: "", tone: null };
}

// Re-export rich account moderation gate from accountModeration.
export { assertUserCanMutate as assertUserAccountActive } from "./accountModeration";
