"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { getTranslations, isRTL } from "@/i18n";
import { useViboLang } from "@/i18n/useViboLang";
import GradientBg from "@/components/GradientBg";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Marquee from "@/components/Marquee";
import BusinessContactSection from "@/components/businesses/BusinessContactSection";
import GlassmorphismTrustHero from "@/components/ui/glassmorphism-trust-hero";
import Pricing from "@/components/ui/pricing";

const SITE_ORIGIN = "https://joinvibo.com";

const sectionView = { once: true, margin: "-70px" as const };

export default function BusinessesPage() {
  const { lang, switchLang } = useViboLang();
  const t = getTranslations(lang);
  const rtl = isRTL(lang);
  const reducesMotion = useReducedMotion();
  const tb = t.businesses;
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = rtl ? "rtl" : "ltr";
    document.body.classList.toggle("font-ar", rtl);
    document.body.classList.toggle("font-en", !rtl);
  }, [lang, rtl]);

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
        <Navbar
          t={t}
          lang={lang}
          onSwitchLang={switchLang}
          siteOrigin={SITE_ORIGIN}
          headerAnchorNav={[
            { id: "get-started", href: "#get-started", label: tb.anchors.getStarted },
            { id: "objectives", href: "#objectives", label: tb.anchors.ads },
            { id: "creative", href: "#creative", label: tb.anchors.creative },
            { id: "contact", href: "#contact", label: tb.anchors.contact },
            { id: "faq", href: "#faq", label: tb.anchors.faq },
          ]}
        />
        <main className="relative z-[1] text-neutral-900">
          {/* Solid block so the global GradientBg grid + washes don’t show through the hero */}
          <div className="w-full bg-[#fdfcf9]">
            <section
              id="get-started"
              className="max-w-[1400px] mx-auto section-padding pt-[calc(5.5rem+env(safe-area-inset-top))] pb-14 sm:pt-[calc(6rem+env(safe-area-inset-top))] sm:pb-20 scroll-mt-28"
            >
              <motion.div
                initial={reducesMotion ? false : { opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={sectionView}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                <GlassmorphismTrustHero
                  titleStart={tb.hero.titleStart}
                  titleAccent={tb.hero.titleAccent}
                  titleEnd={tb.hero.titleEnd}
                  subtitle={tb.hero.subtitle}
                  ctaPrimary={tb.hero.ctaPrimary}
                  ctaSecondary={tb.hero.ctaSecondary}
                  createAd={tb.createAd}
                  siteOrigin={SITE_ORIGIN}
                  heroAdProfiles={tb.heroAdProfiles}
                />
              </motion.div>
            </section>
          </div>

          <Marquee />

          <section
            id="objectives"
            className="max-w-[1400px] mx-auto section-padding py-16 sm:py-20 scroll-mt-28"
          >
            <motion.p
              className="text-[11px] uppercase tracking-[0.16em] text-vibo-primary font-semibold"
              initial={reducesMotion ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={sectionView}
              transition={{ duration: 0.5 }}
            >
              {tb.objectivesLabel}
            </motion.p>
            <motion.h2
              className="mt-2 text-[clamp(1.65rem,3.3vw,2.75rem)] font-bold tracking-[-0.03em] max-w-[900px] text-neutral-900"
              initial={reducesMotion ? false : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={sectionView}
              transition={{ duration: 0.55, delay: 0.05 }}
            >
              {tb.objectivesHeading}
            </motion.h2>

            <StaggerGoals goals={tb.goals} reducesMotion={!!reducesMotion} />
          </section>

          <Pricing copy={tb.verifiedUsers} siteOrigin={SITE_ORIGIN} />

          <BusinessContactSection copy={tb.contact} siteOrigin={SITE_ORIGIN} />

          <section id="faq" className="max-w-[1400px] mx-auto section-padding py-16 sm:py-24 scroll-mt-28">
            <motion.h2
              className="text-[clamp(1.7rem,3vw,2.55rem)] tracking-[-0.03em] font-bold text-neutral-900"
              initial={reducesMotion ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={sectionView}
              transition={{ duration: 0.5 }}
            >
              {tb.faqTitleBefore}
              <span className="text-vibo-primary">{tb.faqTitleAccent}</span>
            </motion.h2>
            <motion.p
              className="mt-2 text-neutral-600"
              initial={reducesMotion ? false : { opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={sectionView}
              transition={{ duration: 0.45, delay: 0.05 }}
            >
              {tb.faqSub}
            </motion.p>

            <div className="mt-8 grid md:grid-cols-2 gap-x-12 gap-y-3">
              {tb.faqs.map((item: { q: string; a: string }, i: number) => (
                <motion.div
                  key={item.q}
                  className={`border border-neutral-200/90 rounded-2xl bg-white/70 backdrop-blur-sm transition-colors ${
                    openFaq === i ? "bg-vibo-rose/10 border-vibo-primary/20" : "hover:bg-white/90"
                  }`}
                  initial={reducesMotion ? false : { opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={sectionView}
                  transition={{ duration: 0.4, delay: i * 0.04 }}
                >
                  <button
                    type="button"
                    aria-expanded={openFaq === i}
                    aria-controls={`faq-panel-${i}`}
                    id={`faq-button-${i}`}
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full text-start py-5 px-5 flex items-start justify-between gap-4 group focus:outline-none focus-visible:ring-2 focus-visible:ring-vibo-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                  >
                    <span className="text-[1.08rem] sm:text-[1.18rem] leading-snug font-medium text-neutral-900 group-hover:text-vibo-primary transition-colors">
                      {item.q}
                    </span>
                    <span
                      className={`mt-0.5 shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-full border transition-transform duration-200 ${
                        openFaq === i
                          ? "border-vibo-primary/30 bg-vibo-primary/10"
                          : "border-vibo-primary/15 bg-white/60"
                      } text-vibo-primary ${
                        openFaq === i ? "rotate-180" : ""
                      }`}
                      aria-hidden
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {openFaq === i && (
                      <motion.div
                        id={`faq-panel-${i}`}
                        role="region"
                        aria-labelledby={`faq-button-${i}`}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                      >
                        <p className="pb-5 px-5 text-[0.92rem] text-neutral-600 leading-relaxed">
                          {item.a}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>
          </section>
        </main>
        <Footer t={t} lang={lang} onSwitchLang={switchLang} siteOrigin={SITE_ORIGIN} />
      </motion.div>
    </AnimatePresence>
  );
}

function StaggerGoals({
  goals,
  reducesMotion,
}: {
  goals: { title: string; text: string }[];
  reducesMotion: boolean;
}) {
  return (
    <div className="mt-12 grid md:grid-cols-3 gap-8 lg:gap-10">
      {goals.map((goal, i) => (
        <motion.article
          key={goal.title}
          className="border-s-[3px] border-vibo-gold ps-6"
          initial={reducesMotion ? false : { opacity: 0, y: 22 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={sectionView}
          transition={{ duration: 0.5, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
          <h3 className="text-[1.65rem] sm:text-[1.85rem] tracking-[-0.02em] font-semibold text-neutral-900">
            {goal.title}
          </h3>
          <p className="mt-3 text-neutral-600 leading-relaxed">{goal.text}</p>
        </motion.article>
      ))}
    </div>
  );
}
