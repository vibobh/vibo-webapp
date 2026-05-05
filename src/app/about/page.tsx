"use client";

import { useEffect } from "react";
import { getTranslations, isRTL } from "@/i18n";
import { useViboLang } from "@/i18n/useViboLang";
import GradientBg from "@/components/GradientBg";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Marquee from "@/components/Marquee";
import PhoneShowcase from "@/components/PhoneShowcase";
import BlogSection from "@/components/BlogSection";
import Creators from "@/components/Creators";
import Cinematic from "@/components/Cinematic";
import CTA from "@/components/CTA";
import Footer from "@/components/Footer";

export default function AboutPage() {
  const { lang, switchLang } = useViboLang();
  const t = getTranslations(lang);
  const rtl = isRTL(lang);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = rtl ? "rtl" : "ltr";
    document.body.classList.toggle("font-ar", rtl);
    document.body.classList.toggle("font-en", !rtl);
  }, [lang, rtl]);

  return (
    <div key={lang}>
      <GradientBg />
      <Navbar t={t} lang={lang} onSwitchLang={switchLang} />
      <main className="relative z-[1]">
        <Hero t={t} />
        <Marquee />
        <PhoneShowcase t={t} />
        <BlogSection
          lang={lang}
          label={t.blog.sectionLabel}
          heading={t.blog.sectionHeading}
          viewAll={t.blog.viewAll}
          readMore={t.blog.readMore}
          sectionEmpty={t.blog.sectionEmpty}
          categories={t.blog.categories}
        />
        <Creators t={t} />
        <Cinematic t={t} />
        <CTA t={t} />
      </main>
      <Footer t={t} lang={lang} onSwitchLang={switchLang} />
    </div>
  );
}
