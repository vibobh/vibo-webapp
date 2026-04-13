"use client";

import { useCallback, useEffect, useState } from "react";
import type { Lang } from "./index";

export const VIBO_LANG_KEY = "vibo-lang";

export function readStoredLang(): Lang | null {
  if (typeof window === "undefined") return null;
  const s = localStorage.getItem(VIBO_LANG_KEY);
  if (s === "ar" || s === "en") return s;
  return null;
}

export function writeStoredLang(lang: Lang) {
  if (typeof window === "undefined") return;
  localStorage.setItem(VIBO_LANG_KEY, lang);
}

export type UseViboLangOptions = {
  /** When set (e.g. from server `searchParams`), first client render matches the URL for RTL/LTR. */
  initialUrlLang?: Lang;
};

/**
 * Shared language for the marketing site: `?lang=` in the URL wins, then localStorage.
 * Persists on change. `ready` is false until client init runs (use for fetches that depend on lang).
 */
export function useViboLang(options?: UseViboLangOptions): {
  lang: Lang;
  switchLang: () => void;
  setLang: (next: Lang) => void;
  ready: boolean;
} {
  const [lang, setLangState] = useState<Lang>(() => {
    const hint = options?.initialUrlLang;
    if (hint === "ar" || hint === "en") return hint;
    return "en";
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const q = url.searchParams.get("lang");
    let initial: Lang = "en";
    if (q === "ar" || q === "en") initial = q;
    else {
      const s = readStoredLang();
      if (s) initial = s;
    }
    setLangState(initial);
    writeStoredLang(initial);
    setReady(true);
  }, []);

  const switchLang = useCallback(() => {
    setLangState((prev) => {
      const next: Lang = prev === "en" ? "ar" : "en";
      writeStoredLang(next);
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("lang", next);
        window.history.replaceState(null, "", url.toString());
        document.documentElement.lang = next;
        document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
      }
      return next;
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    writeStoredLang(next);
  }, []);

  return { lang, switchLang, setLang, ready };
}
