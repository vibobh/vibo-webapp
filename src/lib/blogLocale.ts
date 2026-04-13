import type { Lang } from "@/i18n";

type ArFields = {
  title: string;
  excerpt: string;
  titleAr?: string | null;
  excerptAr?: string | null;
};

type ArBodyFields = ArFields & {
  bodyHtml: string;
  bodyHtmlAr?: string | null;
};

function arOrFallback(ar: string | null | undefined, en: string): string {
  const t = ar?.trim();
  return t ? t : en;
}

/** Title for list cards / article header */
export function pickBlogTitle(post: ArFields, lang: Lang): string {
  if (lang === "ar") return arOrFallback(post.titleAr, post.title);
  return post.title;
}

export function pickBlogExcerpt(post: ArFields, lang: Lang): string {
  if (lang === "ar") return arOrFallback(post.excerptAr, post.excerpt);
  return post.excerpt;
}

/** Article body HTML (caller should still run DOMPurify) */
export function pickBlogBodyHtml(post: ArBodyFields, lang: Lang): string {
  if (lang === "ar") return arOrFallback(post.bodyHtmlAr, post.bodyHtml);
  return post.bodyHtml;
}
