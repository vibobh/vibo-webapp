import { avatarUrlFor } from "./posts";
import { FAKE_CREATORS } from "./feed";

export interface StorySegment {
  id: string;
  mediaUrl: string;
  createdAt: number;
}

export interface StoryUser {
  username: string;
  fullName: string;
  avatarUrl: string;
  hasUnseen: boolean;
  segments: StorySegment[];
}

/** Hash a string to a deterministic int (xmur3-lite). */
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

/**
 * Returns a deterministic mock list of users with active stories.
 * Each user has 1–3 vertical 9:16 segments.
 */
export function mockStoryUsers(count: number = 9): StoryUser[] {
  const out: StoryUser[] = [];
  const now = Date.now();

  for (let i = 0; i < Math.min(count, FAKE_CREATORS.length); i++) {
    const c = FAKE_CREATORS[i]!;
    const rand = pseudoRandom(`${c.username}-stories`);
    const segments: StorySegment[] = [];
    const segCount = 1 + Math.floor(rand() * 3);
    for (let s = 0; s < segCount; s++) {
      const mediaUrl = `https://picsum.photos/seed/${encodeURIComponent(
        `${c.username}-story-${s + 1}`,
      )}/720/1280`;
      segments.push({
        id: `${c.username}-s${s + 1}`,
        mediaUrl,
        createdAt: now - Math.floor(rand() * 1000 * 60 * 60 * 23),
      });
    }
    out.push({
      username: c.username,
      fullName: c.fullName,
      avatarUrl: avatarUrlFor(c.username),
      hasUnseen: rand() > 0.25,
      segments,
    });
  }

  return out;
}
