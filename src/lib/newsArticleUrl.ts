import type { NewsArticle } from "@/types/news";

/** Keep URLs under browser limits (~8k); trim long fields. */
function slimForUrl(a: NewsArticle): NewsArticle {
  return {
    ...a,
    description: a.description
      ? a.description.length > 2000
        ? `${a.description.slice(0, 2000)}…`
        : a.description
      : "",
    content:
      a.content && a.content.length > 6000
        ? `${a.content.slice(0, 6000)}…`
        : a.content ?? null,
  };
}

/** Base64url(JSON) for ?d= — works in browser and Node (SSR) */
export function encodeArticleForSearchParam(a: NewsArticle): string {
  const json = JSON.stringify(slimForUrl(a));
  if (typeof btoa === "function") {
    const u8 = new TextEncoder().encode(json);
    let bin = "";
    u8.forEach((b) => {
      bin += String.fromCharCode(b);
    });
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  return Buffer.from(json, "utf-8").toString("base64url");
}

export function decodeArticleFromSearchParam(d: string | null): NewsArticle | null {
  if (!d?.length) return null;
  try {
    const padLen = (4 - (d.length % 4)) % 4;
    const padded = d + "=".repeat(padLen);
    const b64 = padded.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const json = new TextDecoder().decode(u8);
    const parsed = JSON.parse(json) as NewsArticle;
    if (!parsed?.title || !parsed?.url) return null;
    return parsed;
  } catch {
    return null;
  }
}
