"use client";

import { useEffect } from "react";

import { ViboAuthPage } from "@/components/auth/ViboAuthPage";
import type { Lang } from "@/i18n";
import { getTranslations, isRTL } from "@/i18n";
import { useViboLang } from "@/i18n/useViboLang";

export interface AuthPageClientProps {
  authMode: "login" | "signup";
  /** From server `searchParams.lang` so first paint matches URL (RTL/LTR). */
  initialUrlLang?: Lang;
}

export function AuthPageClient({ authMode, initialUrlLang }: AuthPageClientProps) {
  const { lang, switchLang } = useViboLang({ initialUrlLang });
  const t = getTranslations(lang);
  const rtl = isRTL(lang);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = rtl ? "rtl" : "ltr";
    document.body.classList.toggle("font-ar", rtl);
    document.body.classList.toggle("font-en", !rtl);
  }, [lang, rtl]);

  return <ViboAuthPage t={t} lang={lang} onSwitchLang={switchLang} authMode={authMode} />;
}
