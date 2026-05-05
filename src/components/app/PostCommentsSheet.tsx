"use client";

import { useState } from "react";
import { Bookmark, Heart, MessageCircle, Repeat2, Send, X } from "@/components/ui/icons";
import { useMutation, useQuery } from "convex/react";

import { ResolvedProfileAvatar } from "@/components/messaging/ResolvedProfileAvatar";
import type { FeedPost } from "@/lib/feed/types";
import { api } from "@convex_app/_generated/api";
import type { Id } from "@convex_app/_generated/dataModel";
import { readStoredLang } from "@/i18n/useViboLang";

export function PostCommentsSheet({
  open,
  onClose,
  postId,
  viewerId,
  post,
}: {
  open: boolean;
  onClose: () => void;
  postId: Id<"posts">;
  viewerId: Id<"users">;
  post: FeedPost;
}) {
  const [lang] = useState<"en" | "ar">(() => {
    const stored = readStoredLang();
    if (stored === "ar" || stored === "en") return stored;
    if (typeof document !== "undefined" && document.documentElement.lang === "ar") return "ar";
    return "en";
  });
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const isAr = lang === "ar";
  const t = {
    comments: isAr ? "التعليقات" : "Comments",
    closeComments: isAr ? "إغلاق التعليقات" : "Close comments",
    close: isAr ? "إغلاق" : "Close",
    postLabel: isAr ? "منشور" : "Post",
    loading: isAr ? "جارٍ التحميل…" : "Loading…",
    noComments: isAr ? "لا توجد تعليقات بعد." : "No comments yet.",
    like: isAr ? "إعجاب" : "Like",
    comment: isAr ? "تعليق" : "Comment",
    repost: isAr ? "إعادة نشر" : "Repost",
    share: isAr ? "مشاركة" : "Share",
    save: isAr ? "حفظ" : "Save",
    addComment: isAr ? "أضف تعليقًا…" : "Add a comment…",
    post: isAr ? "نشر" : "Post",
  };

  const data = useQuery(
    api.comments.getPostCommentsLight,
    open ? { postId, viewerUserId: viewerId, limit: 40 } : "skip",
  ) as { comments?: unknown[] } | undefined;

  const addComment = useMutation(api.comments.addComment);

  const comments = data?.comments ?? [];

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || posting) return;
    setPosting(true);
    try {
      await addComment({ postId, text, userId: viewerId });
      setDraft("");
    } finally {
      setPosting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/85 p-2 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={t.comments}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        type="button"
        aria-label={t.closeComments}
        onClick={onClose}
        className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-white/90 hover:bg-white/10"
      >
        <X className="h-5 w-5" />
      </button>
      <div className="flex h-[92vh] w-full max-w-[1120px] overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-neutral-950">
        <div className="relative hidden flex-1 items-center justify-center bg-black md:flex">
          {post.type === "video" ? (
            <video
              src={post.mediaUrl}
              poster={post.thumbUrl}
              controls
              playsInline
              className="max-h-[92vh] max-w-full object-contain"
            />
          ) : post.mediaUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.mediaUrl}
              alt={post.caption ?? ""}
              className="max-h-[92vh] max-w-full object-contain"
              draggable={false}
            />
          ) : (
            <div className="px-6 text-center text-sm text-white/85">{post.caption ?? t.postLabel}</div>
          )}
        </div>

        <div className="flex w-full max-w-[420px] shrink-0 flex-col border-l border-neutral-200 dark:border-neutral-900">
          <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-900">
            <p className="text-[16px] font-semibold text-neutral-900 dark:text-white">{t.comments}</p>
            <button
              type="button"
              aria-label={t.close}
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-full text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-900"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>

          <ul className="min-h-0 flex-1 divide-y divide-neutral-100 overflow-y-auto dark:divide-neutral-900">
          {data === undefined ? (
            <li className="px-4 py-10 text-center text-[13px] text-neutral-500">{t.loading}</li>
          ) : comments.length === 0 ? (
            <li className="px-4 py-10 text-center text-[13px] text-neutral-500">{t.noComments}</li>
          ) : (
            (comments as Array<Record<string, unknown>>).map((c) => {
              const id = String(c._id ?? "");
              const author = c.author as Record<string, unknown> | null | undefined;
              const username = (author?.username as string | undefined) ?? "user";
              const text = String(c.text ?? "");
              const createdAt = Number(c.createdAt) || Date.now();
              const initial = username.charAt(0);
              return (
                <li key={id} className="flex gap-3 px-4 py-3">
                  <ResolvedProfileAvatar
                    profilePictureUrl={author?.profilePictureUrl as string | undefined}
                    profilePictureKey={author?.profilePictureKey as string | undefined}
                    profilePictureStorageRegion={
                      author?.profilePictureStorageRegion as string | undefined
                    }
                    initial={initial}
                    size={36}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] text-neutral-900 dark:text-neutral-100">
                      <span className="font-semibold">{username}</span>{" "}
                      <span className="whitespace-pre-wrap break-words">{text}</span>
                    </p>
                    <p
                      suppressHydrationWarning
                      className="mt-1 text-[11px] uppercase tracking-wide text-neutral-400"
                    >
                      {new Date(createdAt).toLocaleString()}
                    </p>
                  </div>
                </li>
              );
            })
          )}
          </ul>

          <div className="shrink-0 border-t border-neutral-200 px-4 py-3 dark:border-neutral-900">
            <div className="flex items-center justify-between text-neutral-800 dark:text-neutral-100">
              <div className="flex items-center gap-4">
                <button type="button" aria-label={t.like} className="inline-flex items-center gap-1 text-[14px]">
                  <Heart className="h-5 w-5" />
                  <span>{post.likeCount}</span>
                </button>
                <button type="button" aria-label={t.comment} className="inline-flex items-center gap-1 text-[14px]">
                  <MessageCircle className="h-5 w-5" />
                  <span>{post.commentCount}</span>
                </button>
                <button type="button" aria-label={t.repost} className="inline-flex items-center gap-1 text-[14px]">
                  <Repeat2 className="h-5 w-5" />
                  <span>{post.repostCount}</span>
                </button>
                <button type="button" aria-label={t.share} className="inline-flex items-center gap-1 text-[14px]">
                  <Send className="h-4.5 w-4.5" />
                  <span>{post.shareCount}</span>
                </button>
              </div>
              <button type="button" aria-label={t.save} className="grid h-8 w-8 place-items-center">
                <Bookmark className="h-5 w-5" />
              </button>
            </div>
          </div>

          <form
            onSubmit={onSubmit}
            className="flex shrink-0 gap-2 border-t border-neutral-200 p-3 dark:border-neutral-800"
          >
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t.addComment}
              className="min-w-0 flex-1 rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-[14px] text-neutral-900 focus:outline-none focus:ring-2 focus:ring-vibo-primary/30 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white"
            />
            <button
              type="submit"
              disabled={!draft.trim() || posting}
              className="rounded-full bg-vibo-primary px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
            >
              {posting ? "…" : t.post}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

