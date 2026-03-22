"use client";

import { useRef, useEffect, useState } from "react";

type LazyVideoProps = {
  src: string;
  className?: string;
  videoClassName?: string;
};

/**
 * 1) Mounts <video> only when near viewport (saves bandwidth + initial decode).
 * 2) play() while visible, pause() when off-screen (limits concurrent decoders).
 */
export default function LazyVideo({
  src,
  className = "",
  videoClassName = "w-full h-full object-cover",
}: LazyVideoProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mounted, setMounted] = useState(false);

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
      { rootMargin: "100px", threshold: 0 }
    );
    io.observe(root);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const root = rootRef.current;
    const video = videoRef.current;
    if (!root || !video) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            void video.play().catch(() => {});
          } else {
            video.pause();
          }
        }
      },
      { rootMargin: "60px", threshold: 0.1 }
    );
    io.observe(root);
    return () => io.disconnect();
  }, [mounted]);

  return (
    <div ref={rootRef} className={className}>
      {mounted ? (
        <video
          ref={videoRef}
          src={src}
          muted
          playsInline
          loop
          preload="metadata"
          className={videoClassName}
          onError={() => {
            console.error("[LazyVideo] Failed to load video. Check NEXT_PUBLIC_VIDEO_BASE_URL and that the URL opens in a new tab:", src);
          }}
        />
      ) : (
        <div className={`${videoClassName} bg-neutral-300/40`} aria-hidden />
      )}
    </div>
  );
}
