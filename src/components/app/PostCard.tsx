"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bookmark,
  BookmarkCheck,
  Check,
  Heart,
  MessageCircle,
  MoreHorizontal,
  RefreshCw,
  Send,
  ShieldCheck,
} from "@/components/ui/icons";
import { useAction, useMutation } from "convex/react";

import { PostCommentsSheet } from "@/components/app/PostCommentsSheet";
import { SharePostSheet } from "@/components/app/SharePostSheet";
import { useViboAuth } from "@/lib/auth/AuthProvider";
import { api } from "@convex_app/_generated/api";
import type { Id } from "@convex_app/_generated/dataModel";
import type { FeedAuthor, FeedPost } from "@/lib/feed/types";

/** @deprecated Prefer importing `FeedPost` from `@/lib/feed/types`. */
export type FeedPostShape = FeedPost;

function compactCount(n: number): string {
  const x = Number(n);
  if (!Number.isFinite(x) || x < 0) return "0";
  if (x < 1000) return String(x);
  if (x < 1_000_000) return `${(x / 1000).toFixed(x < 10_000 ? 1 : 0).replace(/\.0$/, "")}K`;
  return `${(x / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

function timeAgo(ms: number): string {
  const diff = Math.max(0, Date.now() - ms);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w} week${w === 1 ? "" : "s"} ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo} month${mo === 1 ? "" : "s"} ago`;
  const y = Math.floor(d / 365);
  return `${y} year${y === 1 ? "" : "s"} ago`;
}

function AuthorAvatar({ author, size = 36 }: { author: FeedAuthor; size?: number }) {
  const getPublicMediaUrl = useAction(api.media.getPublicMediaUrl);
  const [failed, setFailed] = useState(false);
  const [imageUrl, setImageUrl] = useState(author.profilePictureUrl?.trim() || "");

  useEffect(() => {
    setImageUrl(author.profilePictureUrl?.trim() || "");
    setFailed(false);
  }, [author.profilePictureUrl, author.id]);

  useEffect(() => {
    if (imageUrl || !author.profilePictureKey?.trim()) return;
    let cancelled = false;
    void getPublicMediaUrl({
      key: author.profilePictureKey.trim(),
      storageRegion: author.profilePictureStorageRegion,
    })
      .then((r) => {
        if (!cancelled && r?.url) setImageUrl(r.url);
      })
      .catch(() => {
        /* keep initial */
      });
    return () => {
      cancelled = true;
    };
  }, [imageUrl, author.profilePictureKey, author.profilePictureStorageRegion, getPublicMediaUrl]);

  if (imageUrl && !failed) {
    return (
      <span
        className="inline-block overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
        style={{ width: size, height: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={author.username ?? author.fullName ?? "Profile"}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }
  const initial = (author.username ?? author.fullName ?? "V").charAt(0).toUpperCase();
  return (
    <span
      className="grid place-items-center rounded-full bg-vibo-primary font-semibold uppercase text-white"
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.42) }}
    >
      {initial}
    </span>
  );
}

interface PostCardProps {
  post: FeedPost;
  onLike?: (post: FeedPost, liked: boolean) => void;
  viewerProfile?: {
    username?: string;
    profilePictureUrl?: string;
    profilePictureKey?: string;
    profilePictureStorageRegion?: string;
  };
}

/** Heuristic: treat ids that look like Convex docIds (start with non-uppercase
 * alpha + length ≥ 25 chars) as real posts the like mutation can act on. */
function isConvexPostId(id: string): boolean {
  return id.length >= 24 && /^[a-z0-9]/i.test(id) && !/[A-Z]/.test(id.slice(0, 4));
}

function RepostMarkIcon({ size = 16, stroke = 2.4 }: { size?: number; stroke?: number }) {
  const arrowsSize = Math.round(size * 0.9);
  const checkSize = Math.round(size * 0.36);
  return (
    <span className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <RefreshCw
        className="text-white"
        strokeWidth={Math.max(2.6, stroke)}
        style={{ width: arrowsSize, height: arrowsSize }}
      />
      <span className="pointer-events-none absolute inset-0 grid place-items-center">
        <Check
          className="text-white"
          strokeWidth={Math.max(2.2, stroke)}
          style={{ width: checkSize, height: checkSize }}
        />
      </span>
    </span>
  );
}

function ViewerRepostBadge({
  username,
  profilePictureUrl,
  profilePictureKey,
  profilePictureStorageRegion,
  animate,
}: {
  username?: string;
  profilePictureUrl?: string;
  profilePictureKey?: string;
  profilePictureStorageRegion?: string;
  animate?: boolean;
}) {
  const getPublicMediaUrl = useAction(api.media.getPublicMediaUrl);
  const [imageUrl, setImageUrl] = useState(profilePictureUrl?.trim() || "");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setImageUrl(profilePictureUrl?.trim() || "");
    setFailed(false);
  }, [profilePictureUrl, profilePictureKey, username]);

  useEffect(() => {
    if (imageUrl || !profilePictureKey?.trim()) return;
    let cancelled = false;
    void getPublicMediaUrl({
      key: profilePictureKey.trim(),
      storageRegion: profilePictureStorageRegion,
    })
      .then((r) => {
        if (!cancelled && r?.url) setImageUrl(r.url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [imageUrl, profilePictureKey, profilePictureStorageRegion, getPublicMediaUrl]);

  const initial = (username ?? "Y").charAt(0).toUpperCase();

  return (
    <span className="pointer-events-none absolute bottom-3 left-3 z-10 inline-flex items-end">
      <span
        className={`relative inline-block h-11 w-11 rounded-full border-2 border-white bg-white shadow transition-all duration-300 ${
          animate ? "scale-110 opacity-100" : "scale-100 opacity-100"
        }`}
      >
        <span className="block h-full w-full overflow-hidden rounded-full">
          {imageUrl && !failed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt="You reposted"
              className="h-full w-full object-cover"
              loading="lazy"
              onError={() => setFailed(true)}
            />
          ) : (
            <span className="grid h-full w-full place-items-center bg-vibo-primary text-sm font-semibold uppercase text-white">
              {initial}
            </span>
          )}
        </span>
        <span className="absolute -bottom-1.5 -right-1.5 z-20 grid h-5.5 w-5.5 place-items-center rounded-full bg-white shadow">
          <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-[#780025] text-white">
            <RepostMarkIcon size={10} stroke={2.6} />
          </span>
        </span>
      </span>
    </span>
  );
}

export function PostCard({ post, onLike, viewerProfile }: PostCardProps) {
  const { user } = useViboAuth();
  const viewerId = user?.id as Id<"users"> | undefined;

  const [liked, setLiked] = useState(post.likedByMe === true);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [saved, setSaved] = useState(post.isSaved === true);
  const [reposted, setReposted] = useState(post.isReposted === true);
  const [repostCount, setRepostCount] = useState(post.repostCount);
  const [shareCount, setShareCount] = useState(post.shareCount);
  const [shareOpen, setShareOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [repostBusy, setRepostBusy] = useState(false);
  const [repostBadgeAnim, setRepostBadgeAnim] = useState(false);
  const [doubleTapLikeFx, setDoubleTapLikeFx] = useState(false);

  const voteOnPost = useMutation(api.postInteractions.voteOnPost);
  const savePost = useMutation(api.postInteractions.savePost);
  const toggleRepost = useMutation(api.postInteractions.toggleRepost);

  useEffect(() => {
    setLiked(post.likedByMe === true);
    setLikeCount(post.likeCount);
    setSaved(post.isSaved === true);
    setReposted(post.isReposted === true);
    setRepostCount(post.repostCount);
    setShareCount(post.shareCount);
    // Only reset interaction UI when card switches to a different post.
    // Keeping this keyed to `post.id` prevents stale feed re-renders from
    // reverting optimistic like/repost/save state right after user actions.
  }, [post.id]);

  const author = post.author ?? ({ id: "vibo", username: "vibo" } as FeedAuthor);
  const profileHref = author.username ? `/${author.username}` : `/${author.id}`;
  const isOwnPost = Boolean(viewerId && String(author.id) === String(viewerId));

  const handleLikeClick = async () => {
    if (!viewerId || !isConvexPostId(post.id)) return;
    setLikeBusy(true);
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCount((c) => Math.max(0, c + (wasLiked ? -1 : 1)));
    try {
      const r = await voteOnPost({
        postId: post.id as Id<"posts">,
        userId: viewerId,
      });
      setLiked(r.liked);
      setLikeCount(r.likeCount);
      onLike?.(post, r.liked);
    } catch {
      setLiked(wasLiked);
      setLikeCount((c) => Math.max(0, c + (wasLiked ? 1 : -1)));
    } finally {
      setLikeBusy(false);
    }
  };

  /** Instagram-style: double-tap / double-click only adds a like (does not remove). */
  const handleMediaDoubleActivate = async () => {
    if (liked || !viewerId || !isConvexPostId(post.id) || likeBusy) return;
    setLikeBusy(true);
    setDoubleTapLikeFx(true);
    window.setTimeout(() => setDoubleTapLikeFx(false), 520);
    // Make bottom like button/count activate immediately on double-tap.
    setLiked(true);
    setLikeCount((c) => c + 1);
    try {
      const r = await voteOnPost({
        postId: post.id as Id<"posts">,
        userId: viewerId,
      });
      setLiked(r.liked);
      setLikeCount(r.likeCount);
      onLike?.(post, r.liked);
    } catch {
      setLiked(false);
      setLikeCount((c) => Math.max(0, c - 1));
    } finally {
      setLikeBusy(false);
    }
  };

  const handleSave = async () => {
    if (!viewerId || !isConvexPostId(post.id)) return;
    const next = !saved;
    setSaved(next);
    try {
      const r = await savePost({
        postId: post.id as Id<"posts">,
        userId: viewerId,
      });
      setSaved(r.saved);
    } catch {
      setSaved(!next);
    }
  };

  const handleRepost = async () => {
    if (!viewerId || !isConvexPostId(post.id) || isOwnPost || repostBusy) return;
    const next = !reposted;
    setReposted(next);
    setRepostCount((c) => Math.max(0, c + (next ? 1 : -1)));
    if (next) {
      setRepostBadgeAnim(true);
      window.setTimeout(() => setRepostBadgeAnim(false), 320);
    } else {
      setRepostBadgeAnim(false);
    }
    setRepostBusy(true);
    try {
      const r = await toggleRepost({
        postId: post.id as Id<"posts">,
        userId: viewerId,
      });
      setReposted(r.reposted);
      setRepostCount(r.repostCount);
    } catch {
      setReposted(!next);
      setRepostCount((c) => Math.max(0, c + (next ? -1 : 1)));
    } finally {
      setRepostBusy(false);
    }
  };

  return (
    <article className="overflow-hidden rounded-3xl bg-white ring-1 ring-neutral-200 dark:bg-neutral-950 dark:ring-neutral-900">
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <Link href={profileHref} className="flex min-w-0 items-center gap-3">
          <AuthorAvatar author={author} />
          <span className="flex min-w-0 items-center gap-1">
            <span className="truncate text-[15px] font-semibold text-neutral-900 dark:text-white">
              {author.username ?? author.fullName ?? "vibo"}
            </span>
            {author.verificationTier ? (
              <ShieldCheck className="h-4 w-4 shrink-0 text-vibo-primary" strokeWidth={2.2} />
            ) : null}
          </span>
        </Link>
        <button
          type="button"
          aria-label="Post options"
          className="grid h-9 w-9 place-items-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-white"
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </header>

      {(post.type === "image" || post.type === "video") && post.mediaUrl ? (
        <div
          className="relative bg-neutral-100 dark:bg-black"
          onDoubleClick={handleMediaDoubleActivate}
          role="presentation"
        >
          {reposted ? (
            <ViewerRepostBadge
              username={viewerProfile?.username}
              profilePictureUrl={viewerProfile?.profilePictureUrl}
              profilePictureKey={viewerProfile?.profilePictureKey}
              profilePictureStorageRegion={viewerProfile?.profilePictureStorageRegion}
              animate={repostBadgeAnim}
            />
          ) : null}
          {doubleTapLikeFx ? (
            <span className="pointer-events-none absolute inset-0 grid place-items-center">
              <span className="animate-[ping_520ms_ease-out_1]">
                <Heart className="h-20 w-20 fill-white text-white drop-shadow-[0_3px_8px_rgba(0,0,0,0.45)]" />
              </span>
            </span>
          ) : null}
          {post.type === "video" ? (
            <video
              src={post.mediaUrl}
              poster={post.thumbUrl}
              controls
              playsInline
              className="block max-h-[80vh] w-full bg-black object-contain"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.mediaUrl}
              alt={post.caption ?? ""}
              className="block max-h-[80vh] w-full cursor-pointer object-cover select-none"
              loading="lazy"
            />
          )}
        </div>
      ) : (
        <div className="px-5 pb-3 pt-1 text-[15.5px] leading-relaxed text-neutral-900 dark:text-neutral-100">
          {post.caption}
        </div>
      )}

      <footer className="px-4 pt-3">
        <div className="flex items-center justify-between text-neutral-700 dark:text-neutral-200">
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => void handleLikeClick()}
              aria-label={liked ? "Unlike" : "Like"}
              disabled={!viewerId || likeBusy}
              className="inline-flex items-center gap-1.5 text-[15px] font-medium hover:text-neutral-900 disabled:opacity-50 dark:hover:text-white"
            >
              <Heart
                className={`h-6 w-6 transition-colors ${liked ? "fill-red-500 text-red-500" : ""}`}
                strokeWidth={1.8}
              />
              <span>{compactCount(likeCount)}</span>
            </button>
            <button
              type="button"
              aria-label="Comments"
              disabled={!viewerId}
              onClick={() => setCommentsOpen(true)}
              className="inline-flex items-center gap-1.5 text-[15px] font-medium hover:text-neutral-900 disabled:opacity-50 dark:hover:text-white"
            >
              <MessageCircle className="h-6 w-6" strokeWidth={1.8} />
              <span>{compactCount(post.commentCount)}</span>
            </button>
            <button
              type="button"
              aria-label={reposted ? "Remove repost" : "Repost"}
              disabled={!viewerId || isOwnPost || repostBusy}
              title={isOwnPost ? "You can’t repost your own post" : undefined}
              onClick={() => void handleRepost()}
              className="inline-flex items-center gap-1.5 text-[15px] font-medium hover:text-neutral-900 disabled:opacity-40 dark:hover:text-white"
            >
              <RepostMarkIcon size={20} stroke={2.2} />
              <span>{compactCount(repostCount)}</span>
            </button>
            <button
              type="button"
              aria-label="Share"
              disabled={!viewerId}
              onClick={() => setShareOpen(true)}
              className="inline-flex items-center gap-1.5 text-[15px] font-medium hover:text-neutral-900 disabled:opacity-50 dark:hover:text-white"
            >
              <Send className="h-5 w-5" strokeWidth={1.8} />
              <span>{compactCount(shareCount)}</span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => void handleSave()}
            aria-label={saved ? "Remove from saved" : "Save post"}
            disabled={!viewerId}
            className="grid h-9 w-9 place-items-center rounded-full text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-50 dark:text-neutral-300 dark:hover:bg-neutral-900 dark:hover:text-white"
          >
            {saved ? (
              <BookmarkCheck className="h-5 w-5 text-vibo-primary" strokeWidth={2} />
            ) : (
              <Bookmark className="h-5 w-5" strokeWidth={1.8} />
            )}
          </button>
        </div>

        {reposted ? (
          <p className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-neutral-800 dark:text-neutral-200">
            <RepostMarkIcon size={14} stroke={2.2} />
            Reposted
          </p>
        ) : null}

        {likeCount > 0 ? (
          <p className="mt-3 flex items-center gap-2 text-[13px] text-neutral-700 dark:text-neutral-300">
            <AuthorAvatar author={author} size={16} />
            <span>
              Liked by{" "}
              <span className="font-semibold text-neutral-900 dark:text-white">
                {author.username ?? "someone"}
              </span>
              {likeCount > 1 ? ` and ${compactCount(likeCount - 1)} others` : null}
            </span>
          </p>
        ) : null}

        {post.type !== "text" && post.caption ? (
          <p className="mt-2 text-[14.5px] leading-relaxed text-neutral-900 dark:text-neutral-100">
            <Link
              href={profileHref}
              className="me-2 font-semibold text-neutral-900 hover:underline dark:text-white"
            >
              {author.username ?? "vibo"}
            </Link>
            {post.caption}
          </p>
        ) : null}

        {post.captionAr ? (
          <p
            className="mt-1 text-[14px] leading-relaxed text-neutral-700 dark:text-neutral-300"
            dir="rtl"
            style={{ textAlign: "right" }}
          >
            {post.captionAr}
          </p>
        ) : null}

        <p
          suppressHydrationWarning
          className="mt-2 pb-4 text-[12px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500"
        >
          {timeAgo(post.createdAt)}
        </p>
      </footer>

      {viewerId && isConvexPostId(post.id) ? (
        <>
          <SharePostSheet
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            postId={post.id as Id<"posts">}
            viewerId={viewerId}
          />
          <PostCommentsSheet
            open={commentsOpen}
            onClose={() => setCommentsOpen(false)}
            postId={post.id as Id<"posts">}
            viewerId={viewerId}
            post={post}
          />
        </>
      ) : null}
    </article>
  );
}

