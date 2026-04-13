"use client";

import { useEffect } from "react";
import { getTranslations, isRTL } from "@/i18n";
import { useViboLang } from "@/i18n/useViboLang";
import GradientBg from "@/components/GradientBg";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function CareersPage() {
  const { lang, switchLang } = useViboLang();
  const t = getTranslations(lang);
  const rtl = isRTL(lang);
  const c = t.careersPage;

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = rtl ? "rtl" : "ltr";
    document.body.classList.toggle("font-ar", rtl);
    document.body.classList.toggle("font-en", !rtl);
  }, [lang, rtl]);

  return (
    <div className="min-h-screen text-neutral-900">
      <GradientBg />
      <Navbar t={t} lang={lang} onSwitchLang={switchLang} />
      <main className="relative z-[1] pt-[72px] lg:pt-[80px]">
        <div className="max-w-[720px] mx-auto section-padding py-12 sm:py-16 text-start">
          <p className="text-xs uppercase tracking-[0.15em] text-vibo-primary font-medium mb-3">
            {t.nav.careers}
          </p>
          <h1 className="text-[clamp(1.6rem,3vw,2.4rem)] font-bold tracking-[-0.03em] text-neutral-900 leading-[1.12] mb-6">
            {c.title}
          </h1>
          <p className="text-[0.95rem] sm:text-[1.05rem] text-neutral-600 leading-relaxed mb-8">{c.description}</p>
          <p className="text-sm text-neutral-400">{c.footnote}</p>
        </div>
      </main>
      <Footer t={t} lang={lang} onSwitchLang={switchLang} />
    </div>
  );
}
