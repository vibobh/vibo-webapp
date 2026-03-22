import sanitizeHtml from "sanitize-html";

/**
 * Rich text from the blog editor (Quill).
 *
 * Uses `sanitize-html` (not DOMPurify/jsdom) so API routes work on Vercel:
 * `isomorphic-dompurify` pulls `jsdom` → `html-encoding-sniffer` → ERR_REQUIRE_ESM
 * with Node’s `require()` of ESM-only `@exodus/bytes`.
 */
const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "sub",
  "sup",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "a",
  "blockquote",
  "pre",
  "code",
  "span",
  "div",
] as const;

export function sanitizeBlogHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [...ALLOWED_TAGS],
    allowedAttributes: {
      a: ["href", "target", "rel", "class", "style"],
      "*": ["class", "style"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: {},
    allowProtocolRelative: false,
  });
}
