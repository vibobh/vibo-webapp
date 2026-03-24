"use client";

import { motion, useReducedMotion } from "framer-motion";
import LazyVideo from "@/components/LazyVideo";
import { videoUrl } from "@/lib/videoUrls";

type ReelCommentCopy = {
  badge: string;
  username: string;
  handle: string;
  message: string;
  likesLabel: string;
  heartCount: string;
  reply: string;
};

type Props = {
  copy: ReelCommentCopy;
  /** Defaults to hero reel `vid2` for a distinct clip in this section */
  videoFile?: string;
};

export default function BusinessesReelShowcase({ copy, videoFile = "vid2.mp4" }: Props) {
  const reducesMotion = useReducedMotion();
  const src = videoUrl(`/videos/${videoFile}`);

  return (
    <div className="relative mx-auto w-full max-w-[min(100%,320px)]">
      <div className="rounded-[28px] border border-vibo-primary/10 bg-gradient-to-br from-vibo-cream via-vibo-rose/80 to-vibo-mint p-3 sm:p-4 shadow-[0_20px_50px_rgba(75,4,21,0.14)]">
        <div
          className="relative overflow-hidden rounded-[22px] border border-white/80 bg-neutral-900 shadow-inner"
          style={{ aspectRatio: "9 / 16", maxHeight: "min(72vh, 520px)" }}
        >
          <LazyVideo
            src={src}
            className="absolute inset-0 h-full w-full"
            videoClassName="h-full w-full object-cover"
          />

          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/25"
            aria-hidden
          />

          <div className="pointer-events-none absolute start-3 top-3 rounded-full bg-black/35 px-2.5 py-1 text-[10px] font-bold tracking-wide text-white backdrop-blur-sm">
            {copy.badge}
          </div>

          <div className="pointer-events-none absolute end-2 top-1/2 flex -translate-y-1/2 flex-col items-center gap-4 text-white">
            <span className="flex min-h-10 min-w-10 flex-col items-center justify-center rounded-full bg-black/35 px-1.5 py-1 text-[10px] backdrop-blur-sm">
              <span className="text-lg leading-none">♥</span>
              <span className="mt-0.5 max-w-[3.5rem] text-center font-semibold leading-tight opacity-90">
                {copy.heartCount}
              </span>
            </span>
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-sm backdrop-blur-sm">
              💬
            </span>
          </div>

          <motion.div
            className="absolute inset-x-3 bottom-3 rounded-2xl border border-white/20 bg-white/[0.94] p-3 shadow-[0_8px_30px_rgba(0,0,0,0.18)] backdrop-blur-md"
            initial={reducesMotion ? false : { opacity: 0, y: 16, scale: 0.98 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{
              duration: reducesMotion ? 0 : 0.45,
              delay: reducesMotion ? 0 : 0.15,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <div className="flex gap-2.5">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-vibo-primary to-vibo-gold text-xs font-bold text-white shadow-sm"
                aria-hidden
              >
                {copy.username
                  .split(/\s+/)
                  .map((w) => w[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
                  <span className="text-[13px] font-semibold text-neutral-900">{copy.username}</span>
                  <span className="text-[11px] text-neutral-500">{copy.handle}</span>
                </div>
                <p className="mt-1 text-[12px] leading-snug text-neutral-800">{copy.message}</p>
                <div className="mt-2 flex items-center gap-3 text-[11px] text-neutral-500">
                  <span className="inline-flex items-center gap-1 font-medium text-rose-600">
                    <span aria-hidden>♥</span>
                    {copy.likesLabel}
                  </span>
                  <span className="text-vibo-primary/80">{copy.reply}</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
