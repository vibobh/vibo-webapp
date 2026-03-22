import DOMPurify from "isomorphic-dompurify";

/** Safe HTML for external news article bodies (lists, links, emphasis). */
export function sanitizeNewsArticleHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
  });
}

export function looksLikeHtml(text: string): boolean {
  const t = text.trim();
  if (!t.includes("<")) return false;
  return /<[a-z][\s\S]*>/i.test(t);
}
