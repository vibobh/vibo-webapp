/**
 * Server-only: [LibreTranslate](https://libretranslate.com/) HTTP API.
 *
 * The public instance requires an API key (see “Get API Key” on their site).
 * Self-hosted: set `LIBRETRANSLATE_URL` to your instance; `LIBRETRANSLATE_API_KEY` optional if your server allows open access.
 */

const DEFAULT_BASE = "https://libretranslate.com";
const MAX_SEGMENT_CHARS = 100_000;

type TranslateFormat = "text" | "html";

function getBaseUrl(): string {
  const raw = process.env.LIBRETRANSLATE_URL?.trim();
  const base = (raw || DEFAULT_BASE).replace(/\/$/, "");
  try {
    new URL(base);
  } catch {
    throw new Error("Invalid LIBRETRANSLATE_URL");
  }
  return base;
}

function getApiKey(): string | undefined {
  const k = process.env.LIBRETRANSLATE_API_KEY?.trim();
  return k || undefined;
}

/** Public libretranslate.com needs a key; self-hosted custom host may work without one. */
export function isLibreTranslateConfigured(): boolean {
  const key = getApiKey();
  if (key) return true;
  const raw = process.env.LIBRETRANSLATE_URL?.trim();
  if (!raw) return false;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    if (host === "libretranslate.com" || host === "www.libretranslate.com") return false;
    return true;
  } catch {
    return false;
  }
}

async function translateOne(text: string, format: TranslateFormat): Promise<string> {
  if (text.length > MAX_SEGMENT_CHARS) {
    throw new Error("Translation segment too long");
  }
  const base = getBaseUrl();
  const apiKey = getApiKey();

  const body: Record<string, string> = {
    q: text,
    source: "en",
    target: "ar",
    format,
  };
  if (apiKey) body.api_key = apiKey;

  const res = await fetch(`${base}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`LibreTranslate failed: ${res.status} ${err.slice(0, 300)}`);
  }

  const data = (await res.json()) as { translatedText?: string; error?: string };
  if (data.error) {
    throw new Error(`LibreTranslate: ${data.error}`);
  }
  if (typeof data.translatedText !== "string") {
    throw new Error("LibreTranslate returned unexpected JSON");
  }
  return data.translatedText;
}

/**
 * Translates each segment in order (sequential to stay within public API limits).
 */
export async function translateStringsEnToAr(
  parts: { text: string; format: TranslateFormat }[],
): Promise<string[]> {
  if (!isLibreTranslateConfigured()) {
    throw new Error("MISSING_KEY");
  }
  const out: string[] = [];
  for (const p of parts) {
    out.push(await translateOne(p.text, p.format));
  }
  return out;
}
