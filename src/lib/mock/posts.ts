import type { FeedPostShape } from "@/components/app/PostCard";

const CAPTIONS = [
  "Golden hour ✨",
  "Coffee + code = happiness",
  "Weekend in the mountains 🏔️",
  "Studio sessions 🎶",
  "Late night thoughts",
  "Friends, food, forever",
  "Behind the scenes",
  "Sunday slow morning",
  "On set 🎬",
  "City lights",
  "New drop, who dis?",
  "Throwback to summer",
  "Caught in the moment",
  "Dreaming in colour",
  "Brand new chapter",
];

const VIDEO_CAPTIONS = [
  "Quick tutorial — save this!",
  "Day in the life vlog",
  "Studio session, full track soon",
  "Trip recap 📍",
  "BTS reel",
  "30 seconds of pure vibes",
];

const COMMENT_BANK: { username: string; text: string }[] = [
  { username: "ali.k", text: "🔥🔥🔥" },
  { username: "noor", text: "love this!! ❤️" },
  { username: "sara_m", text: "okay but how" },
  { username: "yousef", text: "the lighting tho 😍" },
  { username: "lina", text: "obsessed with this" },
  { username: "dimitri", text: "👏👏👏" },
  { username: "rania.h", text: "where is this?" },
  { username: "mahmoud", text: "first 🚀" },
  { username: "kareem_s", text: "underrated post fr" },
  { username: "tala", text: "🥹🥹🥹" },
  { username: "h.qanbar", text: "🌹" },
  { username: "edaqqaq", text: "ما شاء الله" },
];

/** Hash a string to a 32-bit integer (xmur3-lite). */
function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return Math.abs(h);
}

function pseudoRandom(seed: string): () => number {
  let state = hashSeed(seed) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) | 0;
    return ((state >>> 0) % 100000) / 100000;
  };
}

const SHORT_ID_ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** TikTok-style 11-character short ID (deterministic for a given seed/index pair). */
export function makeShortPostId(seed: string, n: number): string {
  const rand = pseudoRandom(`${seed}/post/${n}/short`);
  let id = "";
  for (let i = 0; i < 11; i++) {
    id += SHORT_ID_ALPHA[Math.floor(rand() * SHORT_ID_ALPHA.length)];
  }
  return id;
}

/** Stable picsum avatar for a username/seed. */
export function avatarUrlFor(seed: string): string {
  return `https://picsum.photos/seed/${encodeURIComponent(`${seed}-avatar`)}/200/200`;
}

/**
 * Returns true if `s` looks like a Vibo short post ID:
 *  - 11 characters
 *  - Alphanumeric (mixed case)
 *  - Contains at least one uppercase AND one digit (cheap way to distinguish from
 *    typical lowercase usernames).
 */
export function looksLikeShortPostId(s: string): boolean {
  if (s.length !== 11) return false;
  if (!/^[A-Za-z0-9]+$/.test(s)) return false;
  return /[A-Z]/.test(s) && /[0-9]/.test(s);
}

export interface MockComment {
  id: string;
  username: string;
  text: string;
  createdAt: number;
  likeCount: number;
}

export interface MockPost extends FeedPostShape {
  shortId: string;
  comments: MockComment[];
  location?: string;
}

const LOCATIONS = [
  "Manama, Bahrain",
  "Dubai, UAE",
  "Riyadh",
  "Beirut",
  "Amman",
  "Doha",
  "Istanbul",
  "Cairo",
  "Marrakech",
];

/**
 * Generate deterministic fake posts for a given seed (e.g. a username).
 * Uses picsum.photos to provide reliable square thumbnails.
 */
export function mockPostsForUser(
  seed: string,
  count: number = 9,
  kind: "mixed" | "video" = "mixed",
): MockPost[] {
  const rand = pseudoRandom(seed);
  const posts: MockPost[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const isVideo = kind === "video" ? true : rand() > 0.78;
    const captionList = isVideo ? VIDEO_CAPTIONS : CAPTIONS;
    const caption = captionList[Math.floor(rand() * captionList.length)] ?? "";
    const imgSeed = `${seed}-${i + 1}`;
    const mediaUrl = `https://picsum.photos/seed/${encodeURIComponent(imgSeed)}/900/900`;
    const shortId = makeShortPostId(seed, i);

    const commentCount = Math.floor(rand() * 6) + (isVideo ? 1 : 0);
    const comments: MockComment[] = [];
    for (let c = 0; c < commentCount; c++) {
      const pick = COMMENT_BANK[Math.floor(rand() * COMMENT_BANK.length)]!;
      comments.push({
        id: `${shortId}-c${c}`,
        username: pick.username,
        text: pick.text,
        createdAt: now - Math.floor(rand() * 1000 * 60 * 60 * 24 * 60),
        likeCount: Math.floor(rand() * 50),
      });
    }

    posts.push({
      id: shortId,
      shortId,
      type: isVideo ? "video" : "image",
      caption,
      mediaUrl,
      thumbUrl: mediaUrl,
      likeCount: Math.floor(rand() * 4500) + 12,
      commentCount: comments.length + Math.floor(rand() * 40),
      repostCount: Math.floor(rand() * 80),
      shareCount: Math.floor(rand() * 60),
      createdAt: now - Math.floor(rand() * 1000 * 60 * 60 * 24 * 90),
      author: {
        id: seed,
        username: seed,
        profilePictureUrl: avatarUrlFor(seed),
      },
      likedByMe: rand() > 0.6,
      comments,
      location: rand() > 0.55 ? LOCATIONS[Math.floor(rand() * LOCATIONS.length)] : undefined,
    });
  }

  return posts;
}
