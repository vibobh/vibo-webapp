/**
 * Server-only: OpenRouter chat API for EN→AR (blog / news auto-translate on Next.js).
 * Env: OPENROUTER_API_KEY (required). Optional: OPENROUTER_TRANSLATE_MODEL, OPENROUTER_MODEL,
 * OPENROUTER_HTTP_REFERER, OPENROUTER_APP_TITLE (same as Convex help).
 *
 * Blog/news **lists** send many short strings; we batch them in one API call per chunk to stay
 * under Vercel function time limits (sequential per-string calls easily exceed 10–60s).
 */

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-4o-mini";
/** Single HTML segment cap (full post body). */
const MAX_HTML_CHARS = 72_000;
/** Max English strings per one OpenRouter JSON batch (list pages). */
const MAX_TEXT_BATCH = 40;

export function isOpenRouterTranslateConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

function stripCodeFences(s: string, format: "text" | "html"): string {
  const t = s.trim();
  if (format === "html") {
    const m = t.match(/^```(?:html)?\s*([\s\S]*?)```$/i);
    if (m) return m[1].trim();
  }
  const m2 = t.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  if (m2) return m2[1].trim();
  const m3 = t.match(/^```\s*([\s\S]*?)```$/);
  if (m3) return m3[1].trim();
  return t;
}

function getModel(): string {
  return (
    process.env.OPENROUTER_TRANSLATE_MODEL?.trim() ||
    process.env.OPENROUTER_MODEL?.trim() ||
    DEFAULT_MODEL
  );
}

async function openRouterChat(messages: { role: "system" | "user"; content: string }[], maxTokens: number) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error("MISSING_OPENROUTER_KEY");

  const model = getModel();
  const referer = process.env.OPENROUTER_HTTP_REFERER?.trim() || "https://joinvibo.com";
  const appTitle = process.env.OPENROUTER_APP_TITLE?.trim() || "Vibo";

  const c = new AbortController();
  const tid = setTimeout(() => c.abort(), 110_000);

  try {
    const res = await fetch(OPENROUTER_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": referer,
        "X-Title": `${appTitle} EN→AR`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.15,
        max_tokens: maxTokens,
        messages,
      }),
      signal: c.signal,
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`OpenRouter translate failed: ${res.status} ${err.slice(0, 500)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{
        message?: { content?: string | null | Array<{ type?: string; text?: string }> };
        finish_reason?: string | null;
      }>;
      error?: { message?: string };
    };

    if (data.error?.message) {
      throw new Error(`OpenRouter: ${data.error.message}`);
    }

    const choice = data.choices?.[0];
    const msg = choice?.message;
    let raw = "";
    const content = msg?.content;
    if (typeof content === "string") {
      raw = content.trim();
    } else if (Array.isArray(content)) {
      raw = content
        .filter((p): p is { type?: string; text?: string } => p && typeof p === "object")
        .filter((p) => p.type === "text" && typeof p.text === "string")
        .map((p) => p.text)
        .join("")
        .trim();
    }

    if (!raw) {
      const fr = choice?.finish_reason ?? "unknown";
      console.error("[openRouterTranslate] empty content", { finish_reason: fr, model });
      throw new Error(
        `OpenRouter returned empty translation (finish_reason=${fr}). Check credits at openrouter.ai or set OPENROUTER_TRANSLATE_MODEL=openai/gpt-4o-mini.`,
      );
    }

    return raw;
  } finally {
    clearTimeout(tid);
  }
}

/** One segment: English HTML → Arabic HTML (tags preserved). */
async function translateOneHtml(text: string): Promise<string> {
  const slice = text.slice(0, MAX_HTML_CHARS);
  const system =
    "You translate English blog HTML into Modern Standard Arabic. Preserve every HTML tag, attribute, and structure exactly; translate only human-readable text content. Output only the translated HTML fragment—no markdown code fences, no preamble or explanation.";

  const raw = await openRouterChat(
    [
      { role: "system", content: system },
      { role: "user", content: `Translate to Arabic:\n\n${slice}` },
    ],
    16_384,
  );

  return stripCodeFences(raw, "html");
}

/** One segment: plain English → Arabic. */
async function translateOnePlain(text: string): Promise<string> {
  const slice = text.slice(0, 16_000);
  const system =
    "You translate English into Modern Standard Arabic. Output only the Arabic translation—no quotation marks around the whole text, no notes.";

  const raw = await openRouterChat(
    [
      { role: "system", content: system },
      { role: "user", content: `Translate to Arabic:\n\n${slice}` },
    ],
    4_096,
  );

  return stripCodeFences(raw, "text");
}

/**
 * Many short strings in **one** request (JSON in / JSON out).
 */
async function translateManyPlainTextsOpenRouter(texts: string[]): Promise<string[]> {
  if (texts.length === 0) return [];

  const payload = JSON.stringify({ strings: texts });
  const system = `You translate UI strings from English to Modern Standard Arabic.
You will receive JSON: {"strings":["..."]} with exactly ${texts.length} English strings (indices 0..${texts.length - 1}).
Respond with ONLY valid JSON (no markdown fences): {"translations":["..."]} — exactly ${texts.length} Arabic strings in the same order.
Each translation must be plain text (no HTML). Preserve meaning and tone suitable for a social app blog.`;

  const raw = await openRouterChat(
    [
      { role: "system", content: system },
      { role: "user", content: payload },
    ],
    Math.min(16_384, 800 + texts.length * 600),
  );

  const cleaned = stripCodeFences(raw, "text");
  let parsed: { translations?: string[] };
  try {
    parsed = JSON.parse(cleaned) as { translations?: string[] };
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      parsed = JSON.parse(cleaned.slice(start, end + 1)) as { translations?: string[] };
    } else {
      throw new Error("OpenRouter batch: could not parse JSON");
    }
  }

  const tr = parsed.translations;
  if (!Array.isArray(tr) || tr.length !== texts.length) {
    throw new Error(
      `OpenRouter batch: expected ${texts.length} translations, got ${Array.isArray(tr) ? tr.length : "invalid"}`,
    );
  }

  return tr.map((s) => (typeof s === "string" ? s : String(s ?? "")));
}

/** Sequential single-string fallback if batch JSON fails. */
async function translateManyPlainFallback(texts: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const t of texts) {
    out.push(t.trim() ? await translateOnePlain(t) : "");
  }
  return out;
}

/**
 * Translates parts in order. Consecutive **text** segments are batched (one OpenRouter call per batch).
 * **html** segments use a dedicated HTML prompt (one call each).
 */
export async function translateStringsEnToArOpenRouter(
  parts: { text: string; format: "text" | "html" }[],
): Promise<string[]> {
  if (!isOpenRouterTranslateConfigured()) {
    throw new Error("MISSING_OPENROUTER_KEY");
  }

  const result: string[] = new Array(parts.length).fill("");
  let i = 0;

  while (i < parts.length) {
    const p = parts[i];

    if (p.format === "html") {
      result[i] = p.text.trim() ? await translateOneHtml(p.text) : "";
      i++;
      continue;
    }

    const start = i;
    const batchTexts: string[] = [];
    while (i < parts.length && parts[i].format === "text" && batchTexts.length < MAX_TEXT_BATCH) {
      batchTexts.push(parts[i].text);
      i++;
    }
    const len = i - start;

    try {
      const translated = await translateManyPlainTextsOpenRouter(batchTexts);
      for (let k = 0; k < len; k++) {
        result[start + k] = translated[k]?.trim() ?? "";
      }
    } catch (e) {
      console.error("[openRouterTranslate] batch failed, falling back to sequential", e);
      const fallback = await translateManyPlainFallback(batchTexts);
      for (let k = 0; k < len; k++) {
        result[start + k] = fallback[k] ?? "";
      }
    }
  }

  return result;
}
