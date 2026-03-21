import type { NewsArticle } from "@/types/news";

/**
 * Text used for filtering (title + description + start of content).
 */
function articleText(a: Pick<NewsArticle, "title" | "description" | "content">): string {
  const bits = [a.title, a.description, (a.content || "").slice(0, 400)];
  return bits.join(" \n ").toLowerCase();
}

/**
 * Hard block: violence, war, adult, illegal / disallowed topics for a family-friendly social brand.
 * Case-insensitive; tuned to reduce false positives (e.g. avoid matching "award").
 */
const BLOCKED_REGEX: RegExp[] = [
  // War / conflict / violence
  /\bwar\s+in\b/i,
  /\bwar\s+on\b/i,
  /\b(civil\s+war|world\s+war|guerrilla|airstrike|air\s*strike|drone\s+strike)\b/i,
  /\b(missile|ballistic|artillery|infantry|troops|invasion|occupation|genocide)\b/i,
  /\b(terroris[mt]|isis|al[- ]qaeda|mass\s+shooting|school\s+shooting)\b/i,
  /\b(bombing|detonat|hostage|beheading|executed\s+by)\b/i,
  /\b(massacre|genocide|ethnic\s+cleansing)\b/i,
  /\b(killed\s+\d+|death\s+toll|casualties)\b/i,
  /\b(military\s+strike|naval\s+fleet|pentagon\s+says)\b/i,

  // Adult / sexual content
  /\b(porn|pornograph|xxx\b|nsfw|onlyfans|sex\s+tape|nude\s+leak|sexual\s+assault)\b/i,
  /\b(rape\b|gang\s*rape|erotic|escort\s+service|adult\s+film)\b/i,
  /\b(strip\s+club|prostitut)\b/i,

  // Drugs / illegal substances (news angle)
  /\b(cocaine|heroin|fentanyl|meth\s+lab|drug\s+cartel)\b/i,

  // Hate / extremism
  /\b(holocaust\s+denial|white\s+supremacist)\b/i,

  // Gambling (optional brand safety)
  /\b(online\s+casino|sports\s+betting\s+scandal)\b/i,
];

/** Must look related to social / creator / digital community space. */
const SOCIAL_TERMS = [
  "tiktok",
  "instagram",
  "youtube",
  "snapchat",
  "facebook",
  "threads",
  "twitter",
  "reddit",
  "discord",
  "linkedin",
  "pinterest",
  "twitch",
  "kick",
  "whatsapp",
  "bluesky",
  "clubhouse",
  "social media",
  "social network",
  "content creator",
  "influencer",
  "viral video",
  "viral tiktok",
  "short-form video",
  "short form video",
  "livestream",
  "live stream",
  "reels",
  "instagram stories",
  "hashtag",
  "creator economy",
  "for you page",
  "fyp",
  "subreddit",
  "streamer",
  "vtuber",
  "messaging app",
  "community guidelines",
  "digital wellness",
  "online safety",
  "parasocial",
  "meta platforms",
  "snap inc",
  "be real",
  "duet",
  "stitch",
  "feed algorithm",
  "x platform",
];

const SOCIAL_MEDIA_REGEX = new RegExp(
  SOCIAL_TERMS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
  "i",
);

export function containsBlockedContent(text: string): boolean {
  const t = text.toLowerCase();
  return BLOCKED_REGEX.some((re) => re.test(t));
}

export function isSocialMediaRelated(text: string): boolean {
  return SOCIAL_MEDIA_REGEX.test(text);
}

/**
 * Keeps stories that fit Vibo: social / creator / platform angle, and drops unsafe topics.
 */
export function filterArticlesForVibo(articles: NewsArticle[]): NewsArticle[] {
  return articles.filter((a) => {
    const text = articleText(a);
    if (containsBlockedContent(text)) return false;
    if (!isSocialMediaRelated(text)) return false;
    return true;
  });
}
