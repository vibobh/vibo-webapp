import { FAKE_CREATORS } from "./feed";
import { avatarUrlFor } from "./posts";

export interface MockNote {
  id: string;
  username: string;
  fullName: string;
  avatarUrl: string;
  text: string;
  isYou?: boolean;
}

export interface MockConversation {
  id: string;
  username: string;
  fullName: string;
  avatarUrl: string;
  lastMessage: string;
  /** Pre-formatted age string ("2h", "6w") so we never trigger SSR/hydration drift. */
  timeAgo: string;
  unread?: boolean;
  isAttachment?: boolean;
  isYouSentLast?: boolean;
}

const NOTE_TEXTS = [
  "Today's vibe...",
  "Coffee?",
  "Late night",
  "Beach day",
  "Studio sesh",
  "Loving this",
];

export function mockNotes(currentUsername?: string): MockNote[] {
  const out: MockNote[] = [];

  out.push({
    id: "you",
    username: currentUsername ?? "you",
    fullName: currentUsername ?? "You",
    avatarUrl: avatarUrlFor(currentUsername ?? "you"),
    text: "Your note",
    isYou: true,
  });

  FAKE_CREATORS.slice(0, 5).forEach((c, i) => {
    out.push({
      id: c.username,
      username: c.username,
      fullName: c.fullName,
      avatarUrl: avatarUrlFor(c.username),
      text: NOTE_TEXTS[i % NOTE_TEXTS.length] ?? "...",
    });
  });

  return out;
}

const PREVIEWS = [
  "You sent an attachment.",
  "Sounds good!",
  "Catch up tomorrow?",
  "Thanks habibi",
  "Sent a video",
  "Sent a photo",
  "Liked a post",
  "Reacted with",
  "Hahaha that's wild",
  "On my way",
  "Yalla, see you there",
  "Replied to you",
];

const TIMES = ["2m", "12m", "45m", "1h", "3h", "6h", "1d", "2d", "5d", "1w", "3w", "6w"];

export function mockConversations(currentUsername?: string): MockConversation[] {
  void currentUsername;
  return FAKE_CREATORS.map((c, i) => ({
    id: c.username,
    username: c.username,
    fullName: c.fullName,
    avatarUrl: avatarUrlFor(c.username),
    lastMessage: PREVIEWS[i % PREVIEWS.length] ?? "...",
    timeAgo: TIMES[i % TIMES.length] ?? "1w",
    unread: i % 4 === 0,
    isAttachment: i % 5 === 0,
    isYouSentLast: i % 3 === 0,
  }));
}
