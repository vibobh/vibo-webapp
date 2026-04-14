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
/** Max English strings per one OpenRouter JSON batch (keeps each model call short for Vercel limits). */
const MAX_TEXT_BATCH = 10;

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

/** Undici request headers require ByteString values (0..255). */
function toHeaderByteString(value: string): string {
  return value.replace(/[^\u0000-\u00FF]/g, "-");
}

async function openRouterChat(messages: { role: "system" | "user"; content: string }[], maxTokens: number) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error("MISSING_OPENROUTER_KEY");

  const model = getModel();
  const referer = process.env.OPENROUTER_HTTP_REFERER?.trim() || "https://joinvibo.com";
  const appTitle = process.env.OPENROUTER_APP_TITLE?.trim() || "Vibo";
  const titleHeader = toHeaderByteString(`${appTitle} EN-AR`);

  const c = new AbortController();
  const tid = setTimeout(() => c.abort(), 110_000);

  try {
    const res = await fetch(OPENROUTER_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": referer,
        "X-Title": titleHeader,
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
You will receive JSON: {"strings":["..."]} with exactly ${texts.length} English strings.
You MUST respond with a single JSON object only, with this exact shape: {"translations":["..."]}
where "translations" is an array of exactly ${texts.length} Arabic strings in the same order as "strings".
Each item is plain text (no HTML). Escape quotes inside strings as needed for valid JSON.`;

  const raw = await openRouterChatJson(
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
  if (!Array.isArray(tr)) {
    throw new Error("OpenRouter batch: translations is not an array");
  }
  if (tr.length < texts.length) {
    throw new Error(`OpenRouter batch: got ${tr.length} translations, need ${texts.length}`);
  }
  const slice = tr.slice(0, texts.length);
  return slice.map((s) => (typeof s === "string" ? s : String(s ?? "")));
}

/** Like openRouterChat but requests JSON object mode when the model supports it (fewer parse failures). */
async function openRouterChatJson(
  messages: { role: "system" | "user"; content: string }[],
  maxTokens: number,
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error("MISSING_OPENROUTER_KEY");

  const model = getModel();
  const referer = process.env.OPENROUTER_HTTP_REFERER?.trim() || "https://joinvibo.com";
  const appTitle = process.env.OPENROUTER_APP_TITLE?.trim() || "Vibo";
  const titleHeader = toHeaderByteString(`${appTitle} EN-AR JSON`);

  const c = new AbortController();
  const tid = setTimeout(() => c.abort(), 55_000);

  try {
    const buildBody = (withJsonMode: boolean): Record<string, unknown> => ({
      model,
      temperature: 0.1,
      max_tokens: maxTokens,
      messages,
      ...(withJsonMode ? { response_format: { type: "json_object" } } : {}),
    });

    let res = await fetch(OPENROUTER_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": referer,
        "X-Title": titleHeader,
      },
      body: JSON.stringify(buildBody(true)),
      signal: c.signal,
    });

    if (!res.ok) {
      let errText = await res.text().catch(() => res.statusText);
      if (res.status === 400 && /response_format|json_object|json mode/i.test(errText)) {
        res = await fetch(OPENROUTER_CHAT_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": referer,
            "X-Title": titleHeader,
          },
          body: JSON.stringify(buildBody(false)),
          signal: c.signal,
        });
        if (!res.ok) {
          errText = await res.text().catch(() => res.statusText);
          throw new Error(`OpenRouter translate failed: ${res.status} ${errText.slice(0, 500)}`);
        }
      } else {
        throw new Error(`OpenRouter translate failed: ${res.status} ${errText.slice(0, 500)}`);
      }
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
      console.error("[openRouterTranslate] empty JSON content", { finish_reason: fr, model });
      throw new Error(`OpenRouter returned empty content (finish_reason=${fr})`);
    }

    return raw;
  } finally {
    clearTimeout(tid);
  }
}

/**
 * Batch translate with split-on-failure (parallel halves). Avoids the old sequential fallback
 * that could run dozens of OpenRouter calls and exceed Vercel time limits (502).
 */
async function translateManyPlainRobust(texts: string[]): Promise<string[]> {
  if (texts.length === 0) return [];
  if (texts.length === 1) {
    return [texts[0].trim() ? await translateOnePlain(texts[0]) : ""];
  }

  try {
    return await translateManyPlainTextsOpenRouter(texts);
  } catch (e) {
    console.warn("[openRouterTranslate] batch failed, splitting", texts.length, e);
    if (texts.length === 2) {
      return await Promise.all(
        texts.map((t) => (t.trim() ? translateOnePlain(t) : Promise.resolve(""))),
      );
    }
    const mid = Math.floor(texts.length / 2);
    const safeMid = mid >= 1 ? mid : 1;
    const left = texts.slice(0, safeMid);
    const right = texts.slice(safeMid);
    if (right.length === 0) {
      return translateManyPlainRobust(left);
    }
    const [L, R] = await Promise.all([
      translateManyPlainRobust(left),
      translateManyPlainRobust(right),
    ]);
    return [...L, ...R];
  }
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

    const translated = await translateManyPlainRobust(batchTexts);
    for (let k = 0; k < len; k++) {
      result[start + k] = translated[k]?.trim() ?? "";
    }
  }

  return result;
}
