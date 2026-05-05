"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "@/components/ui/icons";
import { useAction } from "convex/react";

import { api } from "@convex_app/_generated/api";
import type { StoryUser } from "@/lib/feed/types";

interface StoriesRailProps {
  users: StoryUser[];
  /** Authenticated user data so the first bubble can show their avatar. */
  currentUser: {
    username?: string;
    fullName?: string;
    profilePictureUrl?: string;
    profilePictureKey?: string;
    profilePictureStorageRegion?: string;
  };
  /** Open a story viewer for the user at this index. */
  onOpen: (index: number) => void;
  /** Open the story camera / composer. */
  onAddStory?: () => void;
}

export function StoriesRail({ users, currentUser, onOpen, onAddStory }: StoriesRailProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const getPublicMediaUrl = useAction(api.media.getPublicMediaUrl);
  const [selfAvatarUrl, setSelfAvatarUrl] = useState(
    currentUser.profilePictureUrl?.trim() || "",
  );
  const [selfAvatarFailed, setSelfAvatarFailed] = useState(false);

  useEffect(() => {
    setSelfAvatarUrl(currentUser.profilePictureUrl?.trim() || "");
    setSelfAvatarFailed(false);
  }, [currentUser.profilePictureUrl]);

  useEffect(() => {
    if (selfAvatarUrl || !currentUser.profilePictureKey?.trim()) return;
    let cancelled = false;
    void getPublicMediaUrl({
      key: currentUser.profilePictureKey.trim(),
      storageRegion: currentUser.profilePictureStorageRegion,
    })
      .then((r) => {
        if (!cancelled && r?.url) setSelfAvatarUrl(r.url);
      })
      .catch(() => {
        /* keep placeholder */
      });
    return () => {
      cancelled = true;
    };
  }, [
    selfAvatarUrl,
    currentUser.profilePictureKey,
    currentUser.profilePictureStorageRegion,
    getPublicMediaUrl,
  ]);

  const updateArrows = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateArrows();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    return () => {
      el.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", updateArrows);
    };
  }, [users.length]);

  const scrollBy = (delta: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: delta, behavior: "smooth" });
  };

  return (
    <section className="relative">
      {canPrev ? (
        <button
          type="button"
          aria-label="Scroll stories left"
          onClick={() => scrollBy(-280)}
          className="absolute left-1 top-[42px] z-10 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-white text-neutral-700 shadow-md ring-1 ring-black/5 hover:bg-neutral-50 dark:bg-neutral-900 dark:text-neutral-200 dark:ring-white/10 dark:hover:bg-neutral-800"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      ) : null}
      {canNext ? (
        <button
          type="button"
          aria-label="Scroll stories right"
          onClick={() => scrollBy(280)}
          className="absolute right-1 top-[42px] z-10 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-white text-neutral-700 shadow-md ring-1 ring-black/5 hover:bg-neutral-50 dark:bg-neutral-900 dark:text-neutral-200 dark:ring-white/10 dark:hover:bg-neutral-800"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      ) : null}

      <div
        ref={scrollRef}
        className="no-scrollbar flex gap-4 overflow-x-auto px-1 pb-2 pt-1"
      >
        {/* Your story */}
        <button
          type="button"
          onClick={() => onAddStory?.()}
          className="group flex w-[80px] shrink-0 flex-col items-center gap-1.5"
        >
          <div className="relative">
            <div className="rounded-full bg-neutral-200 p-[2.5px] dark:bg-neutral-800">
              <div className="rounded-full bg-white p-[2.5px] dark:bg-black">
                <div className="relative h-[60px] w-[60px] overflow-hidden rounded-full bg-vibo-primary">
                  {selfAvatarUrl && !selfAvatarFailed ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selfAvatarUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={() => setSelfAvatarFailed(true)}
                    />
                  ) : (
                    <span className="grid h-full w-full place-items-center text-[20px] font-bold uppercase text-white">
                      {(currentUser.username ?? currentUser.fullName ?? "V").charAt(0)}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-vibo-primary text-white ring-2 ring-white dark:ring-black">
              <Plus className="h-3 w-3" strokeWidth={3} />
            </span>
          </div>
          <p className="w-full truncate text-center text-[12px] text-neutral-700 dark:text-neutral-300">
            Your story
          </p>
        </button>

        {users.map((u, i) => (
          <button
            type="button"
            key={u.username}
            onClick={() => onOpen(i)}
            className="group flex w-[80px] shrink-0 flex-col items-center gap-1.5"
          >
            <div
              className={`rounded-full p-[2.5px] transition-transform group-hover:scale-[1.03] ${
                u.hasUnseen
                  ? "bg-gradient-to-tr from-[#feda75] via-[#fa7e1e] to-[#d62976]"
                  : "bg-neutral-300 dark:bg-neutral-700"
              }`}
            >
              <div className="rounded-full bg-white p-[2.5px] dark:bg-black">
                <div className="h-[60px] w-[60px] overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                  {u.profilePictureUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={u.profilePictureUrl}
                      alt={u.username}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="grid h-full w-full place-items-center bg-vibo-primary text-[20px] font-bold uppercase text-white">
                      {(u.username ?? "V").charAt(0)}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <p className="w-full truncate text-center text-[12px] text-neutral-700 dark:text-neutral-300">
              {u.username}
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}

