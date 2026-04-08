/** Production site URL — never use localhost in metadata or JSON-LD */
export const SITE_URL = "https://joinvibo.com" as const;

export const DEFAULT_PAGE_TITLE = "Vibo – The Next Generation Social Media Platform";

export const DEFAULT_DESCRIPTION =
  "Vibo (فايبو) is a next-generation social media app for sharing videos, photos, and connecting with the world.";

/** Target brand + discovery keywords (metadata keywords) */
export const DEFAULT_KEYWORDS = [
  "vibo",
  "فايبو",
  "vibo app",
  "social media app",
  "reels alternative",
  "instagram alternative",
  "vibo social media",
] as const;

export const OG_IMAGE_PATH = "/og.png";

export function absoluteUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${p}`;
}

/** Open Graph / Twitter image (absolute) */
export function ogImageAbsoluteUrl(): string {
  return absoluteUrl(OG_IMAGE_PATH);
}

/**
 * Optional social profile URLs for JSON-LD `sameAs`.
 * Set in Vercel / env, e.g. NEXT_PUBLIC_SOCIAL_INSTAGRAM=https://instagram.com/...
 */
export function getSocialSameAs(): string[] {
  const keys = [
    "NEXT_PUBLIC_SOCIAL_INSTAGRAM",
    "NEXT_PUBLIC_SOCIAL_X",
    "NEXT_PUBLIC_SOCIAL_LINKEDIN",
    "NEXT_PUBLIC_SOCIAL_TIKTOK",
    "NEXT_PUBLIC_SOCIAL_YOUTUBE",
  ] as const;
  const out: string[] = [];
  for (const k of keys) {
    const v = process.env[k];
    if (v && /^https?:\/\//i.test(v.trim())) out.push(v.trim());
  }
  return out;
}
