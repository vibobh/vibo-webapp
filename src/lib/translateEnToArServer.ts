/**
 * Blog / news auto-translation: prefers LibreTranslate when configured, otherwise OpenRouter.
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
  return isLibreTranslateConfigured() || isOpenRouterTranslateConfigured();
}

export async function translateStringsEnToAr(
  parts: { text: string; format: TranslateFormat }[],
): Promise<string[]> {
  if (isLibreTranslateConfigured()) {
    return translateViaLibre(parts);
  }
  if (isOpenRouterTranslateConfigured()) {
    return translateStringsEnToArOpenRouter(parts);
  }
  throw new Error("MISSING_KEY");
}
