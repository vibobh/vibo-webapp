/**
 * Blog / news auto-translation: uses OpenRouter when OPENROUTER_API_KEY is set (recommended on Vercel),
 * otherwise LibreTranslate when configured.
 */

import {
  isLibreTranslateConfigured,
  translateStringsEnToAr as translateViaLibre,
} from "./libreTranslateServer";
import {
  isOpenRouterTranslateConfigured,
  translateStringsEnToArOpenRouter,
} from "./openRouterTranslateServer";

export type TranslateFormat = "text" | "html";

export function isEnToArTranslationConfigured(): boolean {
  return isOpenRouterTranslateConfigured() || isLibreTranslateConfigured();
}

export async function translateStringsEnToAr(
  parts: { text: string; format: TranslateFormat }[],
): Promise<string[]> {
  if (isOpenRouterTranslateConfigured()) {
    return translateStringsEnToArOpenRouter(parts);
  }
  if (isLibreTranslateConfigured()) {
    return translateViaLibre(parts);
  }
  throw new Error("MISSING_KEY");
}
