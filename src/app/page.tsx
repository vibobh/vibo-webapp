"use client";

import { useState, useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getTranslations, Lang, isRTL } from "@/i18n";
import GradientBg from "@/components/GradientBg";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Marquee from "@/components/Marquee";
import About from "@/components/About";
import PhoneShowcase from "@/components/PhoneShowcase";
import BentoGrid from "@/components/BentoGrid";
import Creators from "@/components/Creators";
import Cinematic from "@/components/Cinematic";
import CTA from "@/components/CTA";
import Footer from "@/components/Footer";

export default function Home() {
  const [lang, setLang] = useState<Lang>("en");
  const t = getTranslations(lang);
  const rtl = isRTL(lang);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = rtl ? "rtl" : "ltr";
    document.body.classList.toggle("font-ar", rtl);
    document.body.classList.toggle("font-en", !rtl);
  }, [lang, rtl]);

  const switchLang = useCallback(() => {
    setLang((prev) => (prev === "en" ? "ar" : "en"));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={lang}
        initial={{ opacity: 1 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
      >
        <GradientBg />
        <Navbar t={t} lang={lang} onSwitchLang={switchLang} />
        <main className="relative z-[1]">
          <Hero t={t} />
          <Marquee />
          <About t={t} />
          <PhoneShowcase t={t} />
          <BentoGrid t={t} />
          <Creators t={t} />
          <Cinematic t={t} />
          <CTA t={t} />
        </main>
        <Footer t={t} lang={lang} onSwitchLang={switchLang} />
      </motion.div>
    </AnimatePresence>
  );
}
