/**
 * Shared shapes for posts, comments and stories used by the home feed,
 * profile grid, and post lightbox. Convex queries return these directly so the
 * UI can render the same components against either real or test data.
 *
 * `id` is intentionally typed as `string` here so the UI doesn't need to know
 * about Convex `Id<>` branding — Convex queries cast their `Id<"posts">`
 * values back to plain strings on the wire.
 */

export interface FeedAuthor {
  /** Convex user id (used for "Message" / share targets). */
  id: string;
  username?: string;
  fullName?: string;
  profilePictureUrl?: string;
  /** When `profilePictureUrl` is empty, client may resolve via `media:getPublicMediaUrl`. */
  profilePictureKey?: string;
  profilePictureStorageRegion?: string;
  verificationTier?: "blue" | "gold" | "gray";
}

export interface FeedPost {
  /** Stable identifier — Convex doc id for real posts, slug for previews. */
  id: string;
  /** TikTok-style 11-character public id used in `joinvibo.com/<shortId>`. */
  shortId: string;
  type: "image" | "video" | "text";
  caption?: string;
  captionAr?: string;
  mediaUrl?: string;
  thumbUrl?: string;
  location?: string;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  shareCount: number;
  createdAt: number;
  author: FeedAuthor;
  likedByMe?: boolean;
  isSaved?: boolean;
  isReposted?: boolean;
  /** Owner-only: grid tile waiting on collaborator DM accept. */
  collaborationPending?: boolean;
}

export interface FeedComment {
  id: string;
  username: string;
  text: string;
  createdAt: number;
  likeCount: number;
}

export interface FeedPostDetail extends FeedPost {
  comments: FeedComment[];
}

export interface StorySegment {
  id: string;
  mediaUrl: string;
  thumbUrl?: string;
  createdAt: number;
}

export interface StoryUser {
  /** Convex user id of the story author, or "you" for the local placeholder. */
  userId: string;
  username: string;
  fullName?: string;
  profilePictureUrl?: string;
  hasUnseen: boolean;
  segments: StorySegment[];
}
