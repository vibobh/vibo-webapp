"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Play,
  Repeat2,
  Send,
  ShieldCheck,
  Smile,
  X,
} from "@/components/ui/icons";
import { useMutation, useQuery } from "convex/react";

import { api } from "@convex_app/_generated/api";
import type { Id } from "@convex_app/_generated/dataModel";
import type { FeedPostDetail } from "@/lib/feed/types";
import { useViboAuth } from "@/lib/auth/AuthProvider";

interface ProfileLite {
  username?: string;
  fullName?: string;
  profilePictureUrl?: string;
  verificationTier?: "blue" | "gold" | "gray";
}

interface PostLightboxProps {
  open: boolean;
  posts: FeedPostDetail[];
  index: number;
  onIndexChange: (next: number) => void;
  onClose: () => void;
  owner: ProfileLite;
  isOwn: boolean;
}

function isConvexPostId(id: string): boolean {
  return id.length >= 24 && /^[a-z0-9]/i.test(id) && !/[A-Z]/.test(id.slice(0, 4));
}

function compactCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "")}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

function relativeShort(ms: number): string {
  const diff = Math.max(0, Date.now() - ms);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m} m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w} w`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo} mo`;
  const y = Math.floor(d / 365);
  return `${y} y`;
}

function formatLongDate(ms: number): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toDateString();
  }
}

/** Long-form relative time (e.g. "30 minutes ago", "2 days ago"). Falls back to a date for old posts. */
function timeAgoLong(ms: number): string {
  const diff = Math.max(0, Date.now() - ms);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w} week${w === 1 ? "" : "s"} ago`;
  return formatLongDate(ms);
}

function Avatar({
  url,
  name,
  size = 32,
}: {
  url?: string;
  name?: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className="grid shrink-0 place-items-center overflow-hidden rounded-full bg-vibo-primary text-white"
      style={{ height: size, width: size }}
    >
      {url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={name ?? ""}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="text-[12px] font-bold uppercase">{(name ?? "V").charAt(0)}</span>
      )}
    </div>
  );
}

export function PostLightbox({
  open,
  posts,
  index,
  onIndexChange,
  onClose,
  owner,
  isOwn,
}: PostLightboxProps) {
  const { user } = useViboAuth();
  const post = posts[index];
  const viewerId = user?.id as Id<"users"> | undefined;
  const isOwnPost =
    Boolean(viewerId && post?.author?.id)
      ? String(post.author.id) === String(viewerId)
      : false;
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [reposted, setReposted] = useState(false);
  const [repostCount, setRepostCount] = useState(0);
  const [saved, setSaved] = useState(false);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [gifAttachment, setGifAttachment] = useState<{
    giphyId: string;
    previewUrl: string;
    fullUrl: string;
    width: number;
    height: number;
    kind: "gif" | "sticker";
  } | null>(null);

  const voteOnPost = useMutation(api.postInteractions.voteOnPost);
  const savePost = useMutation(api.postInteractions.savePost);
  const addComment = useMutation(api.comments.addComment);
  const toggleRepost = useMutation(api.postInteractions.toggleRepost);

  const commentsLight = useQuery(
    api.comments.getPostCommentsLight,
    post && isConvexPostId(post.id)
      ? {
          postId: post.id as Id<"posts">,
          viewerUserId: user?.id as Id<"users"> | undefined,
          limit: 30,
        }
      : "skip",
  ) as { comments?: any[] } | undefined;

  const hasPrev = index > 0;
  const hasNext = index < posts.length - 1;

  const goPrev = useCallback(() => {
    if (hasPrev) onIndexChange(index - 1);
  }, [hasPrev, index, onIndexChange]);
  const goNext = useCallback(() => {
    if (hasNext) onIndexChange(index + 1);
  }, [hasNext, index, onIndexChange]);

  // Sync per-post local state.
  useEffect(() => {
    if (post) {
      setLiked(!!post.likedByMe);
      setLikeCount(post.likeCount ?? 0);
      setSaved(post.isSaved === true);
      setReposted(post.isReposted === true);
      setRepostCount(post.repostCount ?? 0);
      setDraft("");
      setGifAttachment(null);
    }
    // We intentionally key off the post id only — toggling other fields on the
    // same post (e.g. like count) shouldn't clobber the user's draft or the
    // current optimistic like state.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset UI when navigating to another post
  }, [post?.id]);

  const [repostBusy, setRepostBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);

  const handleSave = async () => {
    if (!viewerId || !post || !isConvexPostId(post.id) || saveBusy) return;
    const next = !saved;
    setSaved(next);
    setSaveBusy(true);
    try {
      const r = await savePost({
        postId: post.id as Id<"posts">,
        userId: viewerId,
      });
      setSaved(r.saved);
    } catch {
      setSaved(!next);
    } finally {
      setSaveBusy(false);
    }
  };

  const handleRepost = async () => {
    if (!viewerId || !post || !isConvexPostId(post.id) || repostBusy) return;
    if (isOwnPost) return; // Backend rejects reposting your own post.
    const next = !reposted;
    setReposted(next);
    setRepostCount((c) => Math.max(0, c + (next ? 1 : -1)));
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

  // Keyboard: Esc / arrows
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose, goPrev, goNext]);

  // Lock background scroll while open.
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  const captionRow = useMemo(() => {
    if (!post) return null;
    const handle = owner.username ?? post.author.username ?? "vibo";
    return (
      <div className="flex gap-3 px-4 py-3">
        <Avatar url={owner.profilePictureUrl} name={handle} size={32} />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] leading-snug text-neutral-900 dark:text-neutral-100">
            <span className="font-semibold">{handle}</span>{" "}
            <span>{post.caption ?? ""}</span>
          </p>
          <p
            suppressHydrationWarning
            className="mt-1 text-[11px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500"
          >
            {relativeShort(post.createdAt)}
          </p>
        </div>
      </div>
    );
  }, [post, owner]);

  if (!open || !post) return null;

  const ownerHandle = owner.username ?? post.author.username ?? "vibo";
  const commentRows = commentsLight?.comments ?? post.comments ?? [];

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-2 sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Top-right close (outside the card) */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full text-white/90 hover:bg-white/10 hover:text-white"
      >
        <X className="h-6 w-6" strokeWidth={2.2} />
      </button>

      {/* Prev arrow */}
      {hasPrev ? (
        <button
          type="button"
          onClick={goPrev}
          aria-label="Previous post"
          className="absolute left-3 top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white backdrop-blur-sm hover:bg-white/25"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      ) : null}

      {/* Next arrow */}
      {hasNext ? (
        <button
          type="button"
          onClick={goNext}
          aria-label="Next post"
          className="absolute right-3 top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white backdrop-blur-sm hover:bg-white/25"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      ) : null}

      {/* Modal card */}
      <div
        className="relative flex max-h-[92vh] w-full max-w-[1100px] overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-neutral-950"
        role="dialog"
        aria-modal="true"
        aria-label="Post"
      >
        {/* Image side */}
        <div className="relative grid flex-1 place-items-center bg-black">
          {post.mediaUrl ? (
            post.type === "video" ? (
              <video
                src={post.mediaUrl}
                poster={post.thumbUrl}
                controls
                playsInline
                className="max-h-[92vh] max-w-full object-contain"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.mediaUrl}
                alt={post.caption ?? ""}
                className="max-h-[92vh] max-w-full object-contain"
                draggable={false}
              />
            )
          ) : (
            <div className="grid h-full min-h-[60vh] w-full place-items-center px-6 text-center text-sm text-white/80">
              {post.caption ?? "No media"}
            </div>
          )}
          {post.type === "video" && !post.mediaUrl ? (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="grid h-16 w-16 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm">
                <Play className="h-7 w-7" fill="currentColor" />
              </div>
            </div>
          ) : null}
        </div>

        {/* Sidebar */}
        <div className="hidden w-[400px] shrink-0 flex-col border-l border-neutral-200 bg-white text-neutral-900 md:flex dark:border-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-900">
            <Avatar url={owner.profilePictureUrl} name={ownerHandle} size={36} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <p className="truncate text-[14px] font-semibold">{ownerHandle}</p>
                {owner.verificationTier ? (
                  <ShieldCheck
                    className="h-3.5 w-3.5 shrink-0 text-vibo-primary"
                    strokeWidth={2.4}
                  />
                ) : null}
                {!isOwn ? (
                  <>
                    <span className="text-neutral-300 dark:text-neutral-700">·</span>
                    <button
                      type="button"
                      className="text-[13px] font-semibold text-vibo-primary hover:opacity-80"
                    >
                      Follow
                    </button>
                  </>
                ) : null}
              </div>
              {post.location ? (
                <p className="truncate text-[12px] text-neutral-500 dark:text-neutral-400">
                  {post.location}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="More"
              className="grid h-8 w-8 place-items-center rounded-full text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-900"
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
          </div>

          {/* Caption + comments */}
          <div className="min-h-0 flex-1 divide-y divide-neutral-100 overflow-y-auto dark:divide-neutral-900">
            {captionRow}

            {commentRows.length === 0 ? (
              <div className="flex-1 px-4 py-10 text-center text-sm text-neutral-500 dark:text-neutral-400">
                No comments yet.
                <br />
                Be the first to say something.
              </div>
            ) : (
              commentRows.map((c: any) => (
                <div key={String(c._id ?? c.id)} className="flex gap-3 px-4 py-3">
                  <Avatar
                    url={c.author?.profilePictureUrl}
                    name={c.author?.username ?? c.username}
                    size={32}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-[13.5px] leading-snug text-neutral-900 dark:text-neutral-100">
                      <span className="font-semibold">
                        {c.author?.username ?? c.username ?? "user"}
                      </span>{" "}
                      {c.text}
                    </p>
                    {c.gifAttachment?.previewUrl || c.gifAttachment?.fullUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.gifAttachment.previewUrl ?? c.gifAttachment.fullUrl}
                        alt="GIF"
                        className="mt-2 max-h-52 w-auto rounded-xl object-contain"
                        loading="lazy"
                      />
                    ) : null}
                    <div className="mt-1 flex items-center gap-3 text-[11.5px] text-neutral-400 dark:text-neutral-500">
                      <span suppressHydrationWarning>
                        {relativeShort(c.createdAt ?? Date.now())}
                      </span>
                      {(c.likeCount ?? 0) > 0 ? (
                        <span>{compactCount(c.likeCount ?? 0)} likes</span>
                      ) : null}
                      <button type="button" className="font-semibold hover:text-neutral-700 dark:hover:text-neutral-300">
                        Reply
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Like comment"
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                  >
                    <Heart className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
            {gifAttachment ? (
              <div className="mb-2 rounded-xl border border-neutral-200 p-2 dark:border-neutral-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={gifAttachment.previewUrl}
                  alt="Selected GIF"
                  className="max-h-40 w-auto rounded-lg object-contain"
                />
                <button
                  type="button"
                  onClick={() => setGifAttachment(null)}
                  className="mt-2 text-xs font-semibold text-vibo-primary"
                >
                  Remove GIF
                </button>
              </div>
            ) : null}
          </div>

          {/* Actions */}
          <div className="border-t border-neutral-200 px-4 pt-3 dark:border-neutral-900">
            <div className="flex items-center justify-between text-neutral-800 dark:text-neutral-100">
              <div className="flex items-center gap-5">
                <button
                  type="button"
                  onClick={async () => {
                    if (!user?.id || !post || !isConvexPostId(post.id)) return;
                    const was = liked;
                    setLiked(!was);
                    try {
                      const r = await voteOnPost({
                        postId: post.id as Id<"posts">,
                        userId: user.id as Id<"users">,
                      });
                      setLiked(r.liked);
                      setLikeCount(r.likeCount);
                    } catch {
                      setLiked(was);
                    }
                  }}
                  aria-label={liked ? "Unlike" : "Like"}
                  className="inline-flex items-center gap-1.5 text-[14px] font-medium hover:opacity-80"
                >
                  <Heart
                    className={`h-6 w-6 transition-colors ${liked ? "fill-red-500 text-red-500" : ""}`}
                    strokeWidth={1.8}
                  />
                  <span>{compactCount(likeCount)}</span>
                </button>
                <button
                  type="button"
                  aria-label="Comment"
                  className="inline-flex items-center gap-1.5 text-[14px] font-medium hover:opacity-80"
                >
                  <MessageCircle className="h-6 w-6" strokeWidth={1.8} />
                  <span>{compactCount(post.commentCount)}</span>
                </button>
                <button
                  type="button"
                  aria-label={reposted ? "Remove repost" : "Repost"}
                  onClick={() => void handleRepost()}
                  disabled={isOwnPost || repostBusy}
                  className={`inline-flex items-center gap-1.5 text-[14px] font-medium hover:opacity-80 disabled:opacity-60`}
                >
                  <Repeat2
                    className={`h-6 w-6 transition-colors ${
                      reposted ? "fill-emerald-500 text-emerald-500" : ""
                    }`}
                    strokeWidth={1.8}
                  />
                  <span>{compactCount(repostCount)}</span>
                </button>
                <button
                  type="button"
                  aria-label="Share"
                  className="inline-flex items-center gap-1.5 text-[14px] font-medium hover:opacity-80"
                >
                  <Send className="h-5 w-5" strokeWidth={1.8} />
                  <span>{compactCount(post.shareCount)}</span>
                </button>
              </div>
              <button
                type="button"
                aria-label={saved ? "Unsave" : "Save"}
                onClick={() => void handleSave()}
                disabled={!viewerId || saveBusy}
                className="grid h-9 w-9 place-items-center rounded-full text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-900"
              >
                <Bookmark
                  className={`h-6 w-6 ${saved ? "fill-current" : ""}`}
                  strokeWidth={1.8}
                />
              </button>
            </div>

            {post.likeCount > 0 ? (
              <div className="mt-3 flex items-center gap-2 text-[13px] text-neutral-700 dark:text-neutral-300">
                <Avatar
                  url={owner.profilePictureUrl}
                  name={ownerHandle}
                  size={20}
                />
                <span>
                  Liked by{" "}
                  <span className="font-semibold text-neutral-900 dark:text-white">
                    {ownerHandle}
                  </span>
                  {post.likeCount > 1 ? ` and ${compactCount(post.likeCount - 1)} others` : null}
                </span>
              </div>
            ) : null}

            <p
              suppressHydrationWarning
              className="mt-2 pb-3 text-[11px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500"
              title={formatLongDate(post.createdAt)}
            >
              {timeAgoLong(post.createdAt)}
            </p>
          </div>

          {/* Comment input */}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const trimmed = draft.trim();
              if ((!trimmed && !gifAttachment) || !post || !user?.id) return;
              if (!isConvexPostId(post.id)) {
                setDraft("");
                return;
              }
              setPosting(true);
              try {
                await addComment({
                  postId: post.id as Id<"posts">,
                  text: trimmed,
                  userId: user.id as Id<"users">,
                  ...(gifAttachment ? { gifAttachment } : {}),
                });
                setDraft("");
                setGifAttachment(null);
              } finally {
                setPosting(false);
              }
            }}
            className="flex items-center gap-2 border-t border-neutral-200 px-4 py-3 dark:border-neutral-900"
          >
            <button
              type="button"
              aria-label="Insert GIF"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
              onClick={() => {
                const url = window.prompt("Paste GIPHY GIF URL");
                if (!url) return;
                const clean = url.trim();
                if (!/^https?:\/\//i.test(clean)) return;
                setGifAttachment({
                  giphyId: `manual-${Date.now()}`,
                  previewUrl: clean,
                  fullUrl: clean,
                  width: 480,
                  height: 270,
                  kind: "gif",
                });
              }}
            >
              <Smile className="h-5 w-5" />
            </button>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a comment..."
              className="min-w-0 flex-1 bg-transparent text-[14px] text-neutral-900 placeholder:text-neutral-500 focus:outline-none dark:text-neutral-100"
            />
            <button
              type="submit"
              disabled={(draft.trim().length === 0 && !gifAttachment) || posting}
              className={`text-[13px] font-semibold ${
                (draft.trim().length === 0 && !gifAttachment) || posting
                  ? "text-vibo-primary/40"
                  : "text-vibo-primary hover:opacity-80"
              }`}
            >
              {posting ? "Posting…" : "Post"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

