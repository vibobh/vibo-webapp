"use client";

import { useEffect, useRef } from "react";
import { Bookmark, Heart, MessageCircle, Music2, Send } from "@/components/ui/icons";

type AccountType = "individual" | "business" | "government";

export type ShowcaseVariant = "posts" | "reels";

interface ShowcasePost {
  img: string;
  avatar: string;
  user: string;
  likes: string;
  type: AccountType;
  verified?: boolean;
}

/** Short MP4 previews (Mixkit) — index matches POSTS; cycles if needed. */
const REEL_VIDEOS: string[] = [
  "https://assets.mixkit.co/videos/preview/mixkit-waves-in-the-water-1164-large.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-tree-with-yellow-flowers-1173-large.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-sunset-landscape-with-a-windmill-1176-large.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-aerial-view-of-a-beach-with-waves-1178-large.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-people-dancing-at-a-concert-1179-large.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-young-woman-talking-on-the-phone-while-drinking-coffee-4259-large.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-woman-running-on-the-beach-4808-large.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-woman-walking-on-the-beach-4807-large.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-woman-doing-yoga-on-the-beach-4806-large.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-woman-doing-yoga-on-the-beach-4805-large.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-going-down-the-road-in-a-desert-landscape-4086-large.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-top-aerial-shot-of-seashore-with-waves-1175-large.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-woman-drinking-coffee-4257-large.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-woman-doing-yoga-on-the-beach-4804-large.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-woman-doing-yoga-on-the-beach-4803-large.mp4",
];

const BADGE_COLORS: Record<AccountType, string> = {
  individual: "fill-sky-400",
  business: "fill-amber-400",
  government: "fill-neutral-400",
};

const RING_CLR = "ring-white/15";

const POSTS: ShowcasePost[] = [
  { type: "individual", verified: true, img: "https://images.unsplash.com/photo-1518684079-3c830dcef090?w=300&h=300&fit=crop", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&crop=face", user: "sara_k", likes: "2.4K" },
  { type: "individual", verified: true, img: "https://images.unsplash.com/photo-1464983308776-3c7215084895?w=300&h=300&fit=crop", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=face", user: "yousif", likes: "15.6K" },
  { type: "individual", img: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=300&h=300&fit=crop", avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=80&h=80&fit=crop&crop=face", user: "nora.art", likes: "891" },
  { type: "individual", img: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=300&h=300&fit=crop", avatar: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=80&h=80&fit=crop&crop=face", user: "layla", likes: "4.5K" },
  { type: "individual", img: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=300&h=300&fit=crop", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&h=80&fit=crop&crop=face", user: "ahmed.m", likes: "1.8K" },
  { type: "business", verified: true, img: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=300&h=300&fit=crop", avatar: "https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=80&h=80&fit=crop", user: "dar_kitchen", likes: "5.2K" },
  { type: "business", verified: true, img: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=300&h=300&fit=crop", avatar: "https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=80&h=80&fit=crop", user: "vibo_cafe", likes: "3.7K" },
  { type: "business", verified: true, img: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=300&h=300&fit=crop", avatar: "https://images.unsplash.com/photo-1556740758-90de374c12ad?w=80&h=80&fit=crop", user: "lux_brand", likes: "7.3K" },
  { type: "business", verified: true, img: "https://images.unsplash.com/photo-1549388604-817d15aa0110?w=300&h=300&fit=crop", avatar: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=80&h=80&fit=crop", user: "dar_style", likes: "2.9K" },
  { type: "business", verified: true, img: "https://images.unsplash.com/photo-1542051841857-5f90071e7989?w=300&h=300&fit=crop", avatar: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=80&h=80&fit=crop", user: "al_baker", likes: "6.4K" },
  { type: "government", verified: true, img: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=300&h=300&fit=crop", avatar: "https://images.unsplash.com/photo-1577495508048-b635879837f1?w=80&h=80&fit=crop", user: "moi_bh", likes: "12.1K" },
  { type: "government", verified: true, img: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=300&h=300&fit=crop", avatar: "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=80&h=80&fit=crop", user: "moe_edu", likes: "8.9K" },
  { type: "government", verified: true, img: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=300&h=300&fit=crop", avatar: "https://images.unsplash.com/photo-1574362848149-11496d93a7c7?w=80&h=80&fit=crop", user: "infra_gov", likes: "4.2K" },
  { type: "government", verified: true, img: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=300&h=300&fit=crop", avatar: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=80&h=80&fit=crop", user: "health_bh", likes: "1.1K" },
  { type: "government", verified: true, img: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&h=300&fit=crop", avatar: "https://images.unsplash.com/photo-1555636222-cae831e670b3?w=80&h=80&fit=crop", user: "tourism_sa", likes: "926" },
];

const COL_LEFT = POSTS.filter((_, i) => i % 3 === 0);
const COL_MID = POSTS.filter((_, i) => i % 3 === 1);
const COL_RIGHT = POSTS.filter((_, i) => i % 3 === 2);

function reelVideoFor(postIndex: number): string {
  return REEL_VIDEOS[postIndex % REEL_VIDEOS.length] ?? REEL_VIDEOS[0];
}

function postIndexInAllPosts(post: ShowcasePost): number {
  return POSTS.findIndex((p) => p.user === post.user && p.img === post.img);
}

function VerifiedBadge({ type }: { type: AccountType }) {
  return (
    <svg viewBox="0 0 16 16" className={`h-2.5 w-2.5 shrink-0 ${BADGE_COLORS[type]}`}>
      <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0Zm3.65 5.35a.9.9 0 0 0-1.3 0L7 8.7 5.65 7.35a.9.9 0 1 0-1.3 1.3l2 2a.9.9 0 0 0 1.3 0l4-4a.9.9 0 0 0 0-1.3Z" />
    </svg>
  );
}

/** Play when visible; pause when off-screen — limits concurrent decode. */
function ReelVideo({ src, poster }: { src: string; poster: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) void el.play().catch(() => {});
        else el.pause();
      },
      { root: null, threshold: 0.12, rootMargin: "40px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      muted
      playsInline
      loop
      preload="metadata"
      className="h-full w-full object-cover"
    />
  );
}

function PostCard({ post }: { post: ShowcasePost }) {
  return (
    <div className="overflow-hidden rounded-xl bg-neutral-950 shadow-lg shadow-black/30">
      <div className="flex items-center gap-1.5 px-2.5 py-2">
        <div className={`h-[18px] w-[18px] shrink-0 overflow-hidden rounded-full ring-[1.5px] ${RING_CLR}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.avatar}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        </div>
        <span className="truncate text-[9px] font-semibold leading-none text-white/80">
          {post.user}
        </span>
        {post.verified && <VerifiedBadge type={post.type} />}
        <div className="ms-auto flex gap-[2px]">
          <span className="h-[3px] w-[3px] rounded-full bg-white/40" />
          <span className="h-[3px] w-[3px] rounded-full bg-white/40" />
          <span className="h-[3px] w-[3px] rounded-full bg-white/40" />
        </div>
      </div>

      <div className="aspect-square bg-vibo-primary-dark">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={post.img}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      </div>

      <div className="flex items-center px-2.5 py-2">
        <div className="flex items-center gap-2.5">
          <Heart className="h-3 w-3 fill-red-500 text-red-500" />
          <MessageCircle className="h-3 w-3 text-white/60" />
          <Send className="h-3 w-3 -rotate-12 text-white/60" />
        </div>
        <Bookmark className="ms-auto h-3 w-3 text-white/60" />
      </div>

      <div className="px-2.5 pb-2">
        <span className="text-[8px] font-bold leading-none text-white/80">
          {post.likes} likes
        </span>
      </div>
    </div>
  );
}

function ReelCard({ post }: { post: ShowcasePost }) {
  const idx = postIndexInAllPosts(post);
  const videoSrc = idx >= 0 ? reelVideoFor(idx) : REEL_VIDEOS[0];

  return (
    <div className="overflow-hidden rounded-xl bg-neutral-950 shadow-lg shadow-black/30">
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <div className={`h-[16px] w-[16px] shrink-0 overflow-hidden rounded-full ring-[1.5px] ${RING_CLR}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={post.avatar} alt="" className="h-full w-full object-cover" loading="lazy" />
        </div>
        <span className="truncate text-[8px] font-semibold text-white/90">{post.user}</span>
        {post.verified && <VerifiedBadge type={post.type} />}
        <span className="ms-auto rounded bg-white/10 px-1 py-0.5 text-[6px] font-bold uppercase tracking-wide text-white/70">
          Reels
        </span>
      </div>

      <div className="relative aspect-[9/16] w-full bg-black">
        <ReelVideo src={videoSrc} poster={post.img} />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20" />
        <div className="absolute bottom-2 start-2 end-10 flex items-center gap-1 text-[7px] text-white/90">
          <Music2 className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate font-medium">Original audio</span>
        </div>
        <div className="absolute bottom-12 end-1 flex flex-col items-center gap-2">
          <Heart className="h-3.5 w-3.5 fill-white text-white drop-shadow" />
          <MessageCircle className="h-3.5 w-3.5 text-white drop-shadow" />
          <Send className="h-3.5 w-3.5 text-white drop-shadow" />
        </div>
      </div>

      <div className="px-2 py-1.5">
        <span className="text-[8px] font-bold text-white/80">{post.likes} · views</span>
      </div>
    </div>
  );
}

function MediaCard({ post, variant }: { post: ShowcasePost; variant: ShowcaseVariant }) {
  if (variant === "reels") return <ReelCard post={post} />;
  return <PostCard post={post} />;
}

function ScrollingColumn({
  posts,
  direction,
  variant,
}: {
  posts: ShowcasePost[];
  direction: "up" | "down";
  variant: ShowcaseVariant;
}) {
  const loop = [...posts, ...posts];
  return (
    <div className="h-[min(85vh,780px)] min-h-0 flex-1 overflow-hidden">
      <div
        className={
          direction === "up"
            ? "flex flex-col gap-2 animate-showcase-scroll-up"
            : "flex flex-col gap-2 animate-showcase-scroll-down"
        }
      >
        {loop.map((post, i) => (
          <MediaCard key={`${direction}-${variant}-${i}-${post.user}`} post={post} variant={variant} />
        ))}
      </div>
    </div>
  );
}

export interface ViboAuthShowcaseProps {
  variant?: ShowcaseVariant;
}

export function ViboAuthShowcase({ variant = "posts" }: ViboAuthShowcaseProps) {
  const scale = variant === "reels" ? 1.22 : 1.32;

  return (
    <div
      dir="ltr"
      className="relative flex h-full min-h-screen w-full items-center justify-center overflow-hidden"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,rgba(196,168,124,0.12),transparent)]" />

      <div
        className="absolute left-1/2 top-1/2 w-[min(96vw,640px)]"
        style={{
          transform: `translate(-50%, -50%) rotate(-15deg) scale(${scale})`,
        }}
      >
        <div className="flex gap-2">
          <ScrollingColumn posts={COL_LEFT} direction="down" variant={variant} />

          <div className="h-[min(85vh,780px)] min-h-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex min-h-full flex-col justify-center gap-2 py-1">
              {COL_MID.map((post) => (
                <MediaCard key={`mid-${variant}-${post.user}`} post={post} variant={variant} />
              ))}
            </div>
          </div>

          <ScrollingColumn posts={COL_RIGHT} direction="up" variant={variant} />
        </div>
      </div>
    </div>
  );
}

