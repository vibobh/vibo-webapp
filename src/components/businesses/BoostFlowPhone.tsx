"use client";

import { useEffect, useRef, useState } from "react";
import { videoUrl } from "@/lib/videoUrls";

type Props = {
  /** When the boost-flow section is on screen, video plays (and restarts from 0 each time you enter). */
  playWhenVisible: boolean;
  reducesMotion: boolean;
  /** File under `/videos/` or resolved via NEXT_PUBLIC_VIDEO_* / BASE_URL. Default demo clip. */
  videoFile?: string;
  /** Accessible description for the demo video. */
  ariaLabel: string;
};

/**
 * Phone chrome around a single demo video (someone stepping through boost / next in the app).
 * Video element mounts lazily when near the viewport; playback is gated on `playWhenVisible`.
 */
export default function BoostFlowPhone({
  playWhenVisible,
  reducesMotion,
  videoFile = "vid4.mp4",
  ariaLabel,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mounted, setMounted] = useState(false);
  const wasSectionVisible = useRef(false);
  const src = videoUrl(`/videos/${videoFile}`);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setMounted(true);
          io.disconnect();
        }
      },
      { rootMargin: "140px", threshold: 0 },
    );
    io.observe(root);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!mounted || !v) return;

    if (!playWhenVisible || reducesMotion) {
      v.pause();
      if (!playWhenVisible) {
        wasSectionVisible.current = false;
      }
      return;
    }

    if (!wasSectionVisible.current) {
      try {
        v.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    wasSectionVisible.current = true;
    void v.play().catch(() => {});
  }, [playWhenVisible, mounted, reducesMotion]);

  return (
    <div
      ref={rootRef}
      className="relative mx-auto w-full max-w-[min(100%,304px)] select-none"
      dir="ltr"
    >
      <div className="relative rounded-[2.35rem] border border-neutral-800/90 bg-gradient-to-b from-neutral-800 via-neutral-900 to-neutral-950 p-[11px] shadow-[0_28px_70px_rgba(75,4,21,0.28)]">
        <div
          className="absolute left-1/2 top-[13px] z-20 h-[25px] w-[92px] -translate-x-1/2 rounded-full bg-black shadow-inner"
          aria-hidden
        />
        <div className="relative overflow-hidden rounded-[1.85rem] bg-neutral-950 aspect-[9/18.5] min-h-[400px] sm:min-h-[440px]">
          <div className="absolute inset-x-0 top-0 z-10 flex h-9 items-end justify-center pb-1 text-[10px] font-semibold text-neutral-400">
            9:41
          </div>
          <div className="absolute inset-0 top-9">
            {mounted ? (
              <video
                ref={videoRef}
                src={src}
                className="h-full w-full object-cover object-center"
                muted
                playsInline
                loop
                preload="metadata"
                aria-label={ariaLabel}
                onError={() => {
                  console.error(
                    "[BoostFlowPhone] Video failed to load. Set NEXT_PUBLIC_VIDEO_VID4 or NEXT_PUBLIC_VIDEO_BOOST_FLOW / base URL. src:",
                    src,
                  );
                }}
              />
            ) : (
              <div className="h-full w-full bg-neutral-800/90" aria-hidden />
            )}
          </div>
        </div>
      </div>
      <div className="mx-auto mt-2.5 h-[5px] w-[92px] rounded-full bg-neutral-900/25" aria-hidden />
    </div>
  );
}
