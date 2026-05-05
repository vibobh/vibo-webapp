"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Heart, MoreHorizontal, Pause, Play, Send, X } from "@/components/ui/icons";
import { useMutation } from "convex/react";

import { api } from "@convex_app/_generated/api";
import type { Id } from "@convex_app/_generated/dataModel";
import type { StoryUser } from "@/lib/feed/types";
import { useViboAuth } from "@/lib/auth/AuthProvider";

function isConvexId(id: string): boolean {
  return id.length >= 24 && /^[a-z0-9]/i.test(id) && !/[A-Z]/.test(id.slice(0, 4));
}

const SEGMENT_DURATION_MS = 5000;

interface StoryViewerProps {
  open: boolean;
  users: StoryUser[];
  /** Index of the user whose stories are being viewed. */
  index: number;
  onIndexChange: (next: number) => void;
  onClose: () => void;
}

function relativeShort(ms: number): string {
  const diff = Math.max(0, Date.now() - ms);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export function StoryViewer({ open, users, index, onIndexChange, onClose }: StoryViewerProps) {
  const { user: viewer } = useViboAuth();
  const user = users[index];
  const [segIndex, setSegIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [draft, setDraft] = useState("");

  const startedAtRef = useRef<number>(0);
  const elapsedAtPauseRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const recordViewMutation = useMutation(api.stories.recordView);

  const cancelRaf = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const goNextUser = useCallback(() => {
    if (index < users.length - 1) {
      onIndexChange(index + 1);
    } else {
      onClose();
    }
  }, [index, users.length, onIndexChange, onClose]);

  const goPrevUser = useCallback(() => {
    if (index > 0) {
      onIndexChange(index - 1);
    }
  }, [index, onIndexChange]);

  const goNextSegment = useCallback(() => {
    if (!user) return;
    if (segIndex < user.segments.length - 1) {
      setSegIndex((i) => i + 1);
      setProgress(0);
      elapsedAtPauseRef.current = 0;
    } else {
      goNextUser();
    }
  }, [user, segIndex, goNextUser]);

  const goPrevSegment = useCallback(() => {
    if (!user) return;
    if (segIndex > 0) {
      setSegIndex((i) => i - 1);
      setProgress(0);
      elapsedAtPauseRef.current = 0;
    } else if (index > 0) {
      // Jump to last segment of previous user
      const prev = users[index - 1];
      onIndexChange(index - 1);
      setSegIndex(prev ? prev.segments.length - 1 : 0);
      setProgress(0);
      elapsedAtPauseRef.current = 0;
    } else {
      // Restart current segment
      setProgress(0);
      elapsedAtPauseRef.current = 0;
      startedAtRef.current = performance.now();
    }
  }, [user, segIndex, index, users, onIndexChange]);

  // Reset segment index when the active user changes.
  useEffect(() => {
    if (open) {
      setSegIndex(0);
      setProgress(0);
      elapsedAtPauseRef.current = 0;
      setPaused(false);
    }
  }, [open, index]);

  // Mark the current segment as viewed (best-effort, fires once per segment).
  useEffect(() => {
    if (!open || !user) return;
    const segment = user.segments[segIndex];
    if (!segment) return;
    if (!isConvexId(segment.id)) return;
    if (!viewer?.id) return;
    recordViewMutation({
      storyId: segment.id as Id<"stories">,
      viewerId: viewer.id as Id<"users">,
    }).catch(() => {});
  }, [open, user, segIndex, recordViewMutation, viewer?.id]);

  // Animation loop: advance progress for current segment.
  useEffect(() => {
    if (!open || !user || paused) {
      cancelRaf();
      return;
    }
    startedAtRef.current = performance.now() - elapsedAtPauseRef.current;

    const tick = () => {
      const elapsed = performance.now() - startedAtRef.current;
      const next = Math.min(1, elapsed / SEGMENT_DURATION_MS);
      setProgress(next);
      if (next >= 1) {
        cancelRaf();
        elapsedAtPauseRef.current = 0;
        goNextSegment();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return cancelRaf;
  }, [open, user, segIndex, paused, goNextSegment]);

  // Keyboard
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") goNextSegment();
      else if (e.key === "ArrowLeft") goPrevSegment();
      else if (e.key === " ") setPaused((p) => !p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, goNextSegment, goPrevSegment]);

  // Lock background scroll while open.
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  const handleHoldStart = () => {
    elapsedAtPauseRef.current = performance.now() - startedAtRef.current;
    setPaused(true);
  };
  const handleHoldEnd = () => setPaused(false);

  if (!open || !user) return null;

  const segment = user.segments[segIndex];
  const hasPrevUser = index > 0;
  const hasNextUser = index < users.length - 1;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/95 p-2 sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close stories"
        className="absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-full text-white/90 hover:bg-white/10 hover:text-white"
      >
        <X className="h-6 w-6" strokeWidth={2.2} />
      </button>

      {hasPrevUser ? (
        <button
          type="button"
          onClick={goPrevUser}
          aria-label="Previous story"
          className="absolute left-3 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white backdrop-blur-sm hover:bg-white/25 sm:grid"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      ) : null}

      {hasNextUser ? (
        <button
          type="button"
          onClick={goNextUser}
          aria-label="Next story"
          className="absolute right-3 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white backdrop-blur-sm hover:bg-white/25 sm:grid"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      ) : null}

      {/* Story canvas */}
      <div
        className="relative flex h-[min(92vh,820px)] aspect-[9/16] flex-col overflow-hidden rounded-2xl bg-neutral-900 shadow-2xl"
        onPointerDown={handleHoldStart}
        onPointerUp={handleHoldEnd}
        onPointerLeave={handleHoldEnd}
        onPointerCancel={handleHoldEnd}
      >
        {/* Image */}
        {segment ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={segment.mediaUrl}
            alt=""
            className="absolute inset-0 h-full w-full select-none object-cover"
            draggable={false}
          />
        ) : null}

        {/* Top fade for legibility */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/55 to-transparent" />
        {/* Bottom fade */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/55 to-transparent" />

        {/* Progress bars */}
        <div className="relative z-10 flex gap-1 px-3 pt-2">
          {user.segments.map((s, i) => (
            <div key={s.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/35">
              <div
                className="h-full bg-white"
                style={{
                  width: `${
                    i < segIndex ? 100 : i === segIndex ? Math.round(progress * 100) : 0
                  }%`,
                  transition: i === segIndex ? "none" : "width 200ms linear",
                }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="relative z-10 flex items-center gap-3 px-3 pt-3">
          <div className="h-9 w-9 overflow-hidden rounded-full bg-neutral-700 ring-2 ring-white/20">
            {user.profilePictureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.profilePictureUrl}
                alt={user.username}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="grid h-full w-full place-items-center text-[12px] font-bold uppercase text-white">
                {(user.username ?? "V").charAt(0)}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <p className="truncate text-[14px] font-semibold text-white">{user.username}</p>
              {segment ? (
                <span className="text-[12px] text-white/70">
                  {relativeShort(segment.createdAt)}
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            aria-label={paused ? "Play" : "Pause"}
            onClick={(e) => {
              e.stopPropagation();
              setPaused((p) => !p);
            }}
            className="grid h-9 w-9 place-items-center rounded-full text-white/90 hover:bg-white/10"
          >
            {paused ? (
              <Play className="h-5 w-5" fill="currentColor" />
            ) : (
              <Pause className="h-5 w-5" fill="currentColor" />
            )}
          </button>
          <button
            type="button"
            aria-label="More"
            onClick={(e) => e.stopPropagation()}
            className="grid h-9 w-9 place-items-center rounded-full text-white/90 hover:bg-white/10"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </div>

        {/* Tap zones (under header) */}
        <button
          type="button"
          aria-label="Previous segment"
          onClick={(e) => {
            e.stopPropagation();
            goPrevSegment();
          }}
          className="absolute bottom-[68px] left-0 top-[60px] z-[5] w-1/3"
        />
        <button
          type="button"
          aria-label="Next segment"
          onClick={(e) => {
            e.stopPropagation();
            goNextSegment();
          }}
          className="absolute bottom-[68px] right-0 top-[60px] z-[5] w-2/3"
        />

        {/* Reply bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setDraft("");
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-2 px-3 pb-3"
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Reply to ${user.username}...`}
            className="h-10 min-w-0 flex-1 rounded-full border border-white/40 bg-transparent px-4 text-[14px] text-white placeholder:text-white/70 focus:border-white focus:outline-none"
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
          />
          <button
            type="button"
            aria-label="Like"
            className="grid h-10 w-10 place-items-center rounded-full text-white hover:bg-white/10"
          >
            <Heart className="h-6 w-6" strokeWidth={1.8} />
          </button>
          <button
            type="button"
            aria-label="Share"
            className="grid h-10 w-10 place-items-center rounded-full text-white hover:bg-white/10"
          >
            <Send className="h-6 w-6" strokeWidth={1.8} />
          </button>
        </form>
      </div>
    </div>
  );
}

