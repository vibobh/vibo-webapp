import type { FeedAuthor, FeedPost } from "@/lib/feed/types";

type MediaRow = {
  type?: string;
  position?: number;
  displayUrl?: string;
  thumbnailUrl?: string;
};

function sortedMedia(media: unknown): MediaRow[] {
  if (!Array.isArray(media)) return [];
  return [...media].sort(
    (a, b) =>
      Number((a as MediaRow).position ?? 0) - Number((b as MediaRow).position ?? 0),
  ) as MediaRow[];
}

function safeNonNegative(n: unknown): number {
  const x = Number(n);
  if (!Number.isFinite(x) || x < 0) return 0;
  return Math.floor(x);
}

function toAuthor(raw: Record<string, unknown> | null | undefined, fallbackUserId: unknown): FeedAuthor {
  if (!raw || typeof raw !== "object") {
    return {
      id: String(fallbackUserId ?? ""),
      username: "unknown",
    };
  }
  const pic = typeof raw.profilePictureUrl === "string" ? raw.profilePictureUrl.trim() : "";
  return {
    id: String(raw._id ?? raw.id ?? fallbackUserId ?? ""),
    username: raw.username as string | undefined,
    fullName: raw.fullName as string | undefined,
    profilePictureUrl: pic || undefined,
    profilePictureKey: raw.profilePictureKey as string | undefined,
    profilePictureStorageRegion: raw.profilePictureStorageRegion as string | undefined,
    verificationTier: raw.verificationTier as FeedAuthor["verificationTier"],
  };
}

/**
 * Maps a `posts:getFeed` row (spread post doc + `media` + `author` + viewer flags)
 * into the UI `FeedPost` shape.
 */
export function normalizeConvexFeedPost(raw: Record<string, unknown>): FeedPost {
  const mediaRows = sortedMedia(raw.media);
  const primary = mediaRows[0];

  let type: FeedPost["type"] = "text";
  let mediaUrl: string | undefined;
  let thumbUrl: string | undefined;

  if (primary && (primary.type === "image" || primary.type === "video")) {
    type = primary.type;
    const du = typeof primary.displayUrl === "string" ? primary.displayUrl.trim() : "";
    if (du) mediaUrl = du;
    const th = typeof primary.thumbnailUrl === "string" ? primary.thumbnailUrl.trim() : "";
    if (th) thumbUrl = th;
  }

  const id = String(raw._id ?? raw.id ?? "");
  const createdAt = Number(raw.createdAt);
  const author = toAuthor(raw.author as Record<string, unknown> | undefined, raw.userId);

  const shortId =
    typeof raw.shortId === "string" && raw.shortId.trim()
      ? raw.shortId.trim()
      : id.length >= 11
        ? id.slice(0, 11)
        : id;

  return {
    id,
    shortId,
    type,
    caption: raw.caption as string | undefined,
    captionAr: raw.captionAr as string | undefined,
    mediaUrl,
    thumbUrl,
    location:
      (raw.locationName as string | undefined) ?? (raw.location as string | undefined),
    likeCount: safeNonNegative(raw.likeCount),
    commentCount: safeNonNegative(raw.commentCount),
    repostCount: safeNonNegative(raw.repostCount),
    shareCount: safeNonNegative(raw.sharesCount ?? raw.shareCount),
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    author,
    likedByMe: Boolean(raw.isLiked ?? raw.likedByMe),
    isSaved: Boolean(raw.isSaved),
    isReposted: Boolean(raw.isReposted),
  };
}
