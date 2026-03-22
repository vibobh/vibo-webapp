"use client";

import { useCallback, useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BlogManagement from "@/components/blog/BlogManagement";
import { getTranslations, type Lang, isRTL } from "@/i18n";

export default function BlogManagementPage() {
  const [lang, setLang] = useState<Lang>("en");
  const t = getTranslations(lang);
  const rtl = isRTL(lang);
  const ui = t.blogManagement;

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = rtl ? "rtl" : "ltr";
    document.body.classList.toggle("font-ar", rtl);
    document.body.classList.toggle("font-en", !rtl);
  }, [lang, rtl]);

  const switchLang = useCallback(() => {
    setLang((prev) => (prev === "en" ? "ar" : "en"));
  }, []);

  return (
    <div className="min-h-screen bg-[#fafafa] text-neutral-900">
      <Navbar t={t} lang={lang} onSwitchLang={switchLang} />
      <main className="relative z-[1] pt-[72px] lg:pt-[80px] pb-16">
        <div className="max-w-[1100px] mx-auto section-padding py-10 sm:py-12">
          <BlogManagement ui={ui} />
        </div>
      </main>
      <Footer t={t} lang={lang} onSwitchLang={switchLang} />
    </div>
  );
}
