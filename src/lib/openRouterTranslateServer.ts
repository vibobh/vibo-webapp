/**
 * Server-only: OpenRouter chat API for EN→AR when LibreTranslate is not configured.
 * Uses the same env vars as Convex help (OPENROUTER_API_KEY, optional model/referer/title).
 */

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-4o-mini";
/** Rough cap per segment to stay within model context and latency. */
const MAX_TEXT_CHARS = 16_000;
const MAX_HTML_CHARS = 72_000;

export function isOpenRouterTranslateConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

function stripCodeFences(s: string, format: "text" | "html"): string {
  const t = s.trim();
  if (format === "html") {
    const m = t.match(/^```(?:html)?\s*([\s\S]*?)```$/i);
    if (m) return m[1].trim();
  }
  const m2 = t.match(/^```\s*([\s\S]*?)```$/);
  if (m2) return m2[1].trim();
  return t;
}

async function translateOne(text: string, format: "text" | "html"): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error("MISSING_OPENROUTER_KEY");

  const model = process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;
  const referer = process.env.OPENROUTER_HTTP_REFERER?.trim() || "https://joinvibo.com";
  const appTitle = process.env.OPENROUTER_APP_TITLE?.trim() || "Vibo";

  const slice = format === "html" ? text.slice(0, MAX_HTML_CHARS) : text.slice(0, MAX_TEXT_CHARS);

  const system =
    format === "html"
      ? "You translate English blog HTML into Modern Standard Arabic. Preserve every HTML tag, attribute, and structure exactly; translate only human-readable text content. Output only the translated HTML fragment—no markdown code fences, no preamble or explanation."
      : "You translate English into Modern Standard Arabic. Output only the Arabic translation—no quotation marks around the whole text, no notes.";

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
      max_tokens: format === "html" ? 16_384 : 4_096,
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Translate to Arabic:\n\n${slice}` },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`OpenRouter translate failed: ${res.status} ${err.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string | null } }[];
    error?: { message?: string };
  };

  if (data.error?.message) {
    throw new Error(`OpenRouter: ${data.error.message}`);
  }

  let out = data.choices?.[0]?.message?.content?.trim() ?? "";
  out = stripCodeFences(out, format);
  return out;
}

/** Sequential calls (same pattern as LibreTranslate). */
export async function translateStringsEnToArOpenRouter(
  parts: { text: string; format: "text" | "html" }[],
): Promise<string[]> {
  if (!isOpenRouterTranslateConfigured()) {
    throw new Error("MISSING_OPENROUTER_KEY");
  }
  const out: string[] = [];
  for (const p of parts) {
    if (!p.text.trim()) {
      out.push("");
      continue;
    }
    out.push(await translateOne(p.text, p.format));
  }
  return out;
}
