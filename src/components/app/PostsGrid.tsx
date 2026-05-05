"use client";

import Link from "next/link";
import { ImagePlus, Play } from "@/components/ui/icons";

import type { FeedPost } from "@/lib/feed/types";

export function PostsGrid({
  posts,
  isLoading,
  emptyMessage = "No posts yet.",
  showOwnHint = false,
  onPostClick,
}: {
  posts: FeedPost[];
  isLoading?: boolean;
  emptyMessage?: string;
  showOwnHint?: boolean;
  /** When provided, clicking a tile calls back instead of navigating. */
  onPostClick?: (index: number) => void;
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-1">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="aspect-square animate-pulse bg-neutral-100 dark:bg-neutral-900"
          />
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-200 bg-white px-6 py-10 text-center dark:border-neutral-800 dark:bg-neutral-950">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-vibo-primary/15 text-vibo-primary">
          <ImagePlus className="h-5 w-5" />
        </div>
        <p className="text-sm text-neutral-700 dark:text-neutral-300">{emptyMessage}</p>
        {showOwnHint ? (
          <Link
            href="/create-post"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-vibo-primary px-4 py-2 text-sm font-medium text-white hover:bg-vibo-primary/90"
          >
            Create your first post
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-1">
      {posts.map((p, i) => {
        const inner = (
          <>
            {p.mediaUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.thumbUrl ?? p.mediaUrl}
                alt={p.caption ?? ""}
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                loading="lazy"
              />
            ) : (
              <span className="grid h-full w-full place-items-center px-3 text-center text-xs text-neutral-500 dark:text-neutral-400">
                {p.caption?.slice(0, 80) ?? ""}
              </span>
            )}
            {p.type === "video" ? (
              <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white">
                <Play className="h-3 w-3" fill="currentColor" />
              </span>
            ) : null}
            {p.collaborationPending ? (
              <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/50">
                <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-neutral-900 shadow">
                  Pending
                </span>
              </span>
            ) : (
              <span className="pointer-events-none absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20" />
            )}
          </>
        );

        const tileClass =
          "group relative block aspect-square overflow-hidden bg-neutral-100 text-left dark:bg-neutral-900";

        if (p.collaborationPending) {
          return (
            <div key={p.id} className={`${tileClass} cursor-default`}>
              {inner}
            </div>
          );
        }

        if (onPostClick) {
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onPostClick(i)}
              className={tileClass}
            >
              {inner}
            </button>
          );
        }

        return (
          <Link key={p.id} href={`/${p.shortId}`} className={tileClass}>
            {inner}
          </Link>
        );
      })}
    </div>
  );
}

