"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { getTranslations, isRTL } from "@/i18n";
import { useViboLang } from "@/i18n/useViboLang";
import GradientBg from "@/components/GradientBg";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Marquee from "@/components/Marquee";
import BoostFlowPhone from "@/components/businesses/BoostFlowPhone";
import BusinessesReelShowcase from "@/components/businesses/BusinessesReelShowcase";
import BusinessContactSection from "@/components/businesses/BusinessContactSection";
import BusinessGrowthContactSection from "@/components/businesses/BusinessGrowthContactSection";
import GlassmorphismTrustHero from "@/components/ui/glassmorphism-trust-hero";

const SITE_ORIGIN = "https://joinvibo.com";

const sectionView = { once: true, margin: "-70px" as const };

export default function BusinessesPage() {
  const { lang, switchLang } = useViboLang();
  const t = getTranslations(lang);
  const rtl = isRTL(lang);
  const reducesMotion = useReducedMotion();
  const tb = t.businesses;
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [boostStep, setBoostStep] = useState(0);
  const [boostFlowVisible, setBoostFlowVisible] = useState(false);
  const boostStepRefs = useRef<(HTMLDivElement | null)[]>([]);
  const boostFlowSectionRef = useRef<HTMLElement | null>(null);
  const pauseBoostAutoUntil = useRef(0);
  const boostFlowWasVisible = useRef(false);
  /** Skip one mobile auto-scroll after the user taps a step (they already scroll explicitly). */
  const skipMobileStepScrollRef = useRef(false);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = rtl ? "rtl" : "ltr";
    document.body.classList.toggle("font-ar", rtl);
    document.body.classList.toggle("font-en", !rtl);
  }, [lang, rtl]);

  const stepCount = tb.steps.length;

  useEffect(() => {
    const el = boostFlowSectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => setBoostFlowVisible(e.isIntersecting),
      { threshold: [0, 0.08, 0.14, 0.22], rootMargin: "0px 0px -5% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (boostFlowVisible && !boostFlowWasVisible.current) {
      setBoostStep(0);
    }
    boostFlowWasVisible.current = boostFlowVisible;
  }, [boostFlowVisible]);

  useEffect(() => {
    if (!boostFlowVisible || reducesMotion || stepCount < 1) return;
    const intervalMs = 3200;
    const id = window.setInterval(() => {
      if (Date.now() < pauseBoostAutoUntil.current) return;
      setBoostStep((s) => (s + 1) % stepCount);
    }, intervalMs);
    return () => clearInterval(id);
  }, [boostFlowVisible, reducesMotion, stepCount]);

  const pauseBoostAutoplay = (ms = 14000) => {
    pauseBoostAutoUntil.current = Date.now() + ms;
  };

  useEffect(() => {
    if (!boostFlowVisible || reducesMotion) return;
    if (typeof window === "undefined" || window.matchMedia("(min-width: 1024px)").matches) return;
    if (skipMobileStepScrollRef.current) {
      skipMobileStepScrollRef.current = false;
      return;
    }
    const el = boostStepRefs.current[boostStep];
    if (!el) return;
    const id = window.setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    return () => clearTimeout(id);
  }, [boostStep, boostFlowVisible, reducesMotion]);

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

          <section id="creative" className="max-w-[1400px] mx-auto section-padding py-14 sm:py-20 scroll-mt-28">
            <motion.h2
              className="text-[clamp(1.6rem,3vw,2.45rem)] font-bold tracking-[-0.03em] max-w-[960px] text-neutral-900"
              initial={reducesMotion ? false : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={sectionView}
              transition={{ duration: 0.55 }}
            >
              {tb.creativeHeading}
            </motion.h2>
            <div className="mt-10 grid lg:grid-cols-[0.95fr_1.05fr] gap-10 items-center">
              <motion.div
                className="flex justify-center lg:justify-start"
                initial={reducesMotion ? false : { opacity: 0, x: rtl ? 24 : -24 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={sectionView}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                <BusinessesReelShowcase copy={tb.reelComment} />
              </motion.div>
              <motion.div
                initial={reducesMotion ? false : { opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={sectionView}
                transition={{ duration: 0.55, delay: 0.08 }}
              >
                <p className="text-[11px] uppercase tracking-[0.16em] text-vibo-primary font-semibold">
                  {tb.creativeKicker}
                </p>
                <p className="mt-2 text-[1.35rem] leading-snug font-semibold text-neutral-900">{tb.creativeLead}</p>
                <p className="mt-4 text-neutral-600 leading-relaxed">{tb.creativeBody}</p>
              </motion.div>
            </div>
          </section>

          <section
            ref={boostFlowSectionRef}
            id="boost-flow"
            className="max-w-[1400px] mx-auto section-padding max-lg:py-8 max-lg:pt-5 sm:py-14 lg:py-20 scroll-mt-28"
          >
            <div className="grid grid-cols-1 gap-6 sm:gap-8 lg:grid-cols-2 lg:gap-12 lg:items-start">
              <motion.div
                className="relative z-30 mx-auto w-full max-lg:max-w-[320px] max-lg:sticky max-lg:top-[4.65rem] max-lg:-mt-1 max-lg:bg-[#fdfcf9]/88 max-lg:backdrop-blur-md max-lg:py-2 max-lg:rounded-3xl lg:sticky lg:top-[5.75rem] lg:z-auto lg:mx-0 lg:bg-transparent lg:py-0 lg:backdrop-blur-none"
                initial={reducesMotion ? false : { opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={sectionView}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="absolute -inset-6 -z-10 rounded-[3rem] bg-gradient-to-br from-vibo-gold/35 via-vibo-primary/12 to-vibo-cream blur-2xl opacity-90 max-lg:opacity-75" aria-hidden />
                <BoostFlowPhone
                  activeStep={Math.min(boostStep, stepCount - 1)}
                  reducesMotion={!!reducesMotion}
                  phoneUi={tb.phoneUi}
                />
              </motion.div>
              <div className="space-y-3 max-lg:scroll-mt-[calc(4.65rem+140px)]">
                {tb.steps.map((stepTitle: string, i: number) => (
                  <motion.div
                    key={stepTitle}
                    ref={(el) => {
                      boostStepRefs.current[i] = el;
                    }}
                    role="button"
                    tabIndex={0}
                    layout="position"
                    onClick={() => {
                      pauseBoostAutoplay();
                      skipMobileStepScrollRef.current = true;
                      setBoostStep(i);
                      boostStepRefs.current[i]?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        pauseBoostAutoplay();
                        skipMobileStepScrollRef.current = true;
                        setBoostStep(i);
                        boostStepRefs.current[i]?.scrollIntoView({ behavior: "smooth", block: "center" });
                      }
                    }}
                    animate={
                      reducesMotion
                        ? undefined
                        : { scale: boostStep === i ? 1 : 0.993 }
                    }
                    className={`cursor-pointer rounded-2xl border-2 px-5 py-4 text-start transition-[border-color,background-color,box-shadow] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] focus:outline-none focus-visible:ring-2 focus-visible:ring-vibo-primary/40 ${
                      boostStep === i
                        ? "border-vibo-primary bg-vibo-rose/45 shadow-lg shadow-vibo-primary/[0.12]"
                        : "border-neutral-200/80 bg-white/70 hover:border-vibo-primary/22 hover:bg-white"
                    }`}
                    initial={reducesMotion ? false : { opacity: 0, x: rtl ? -22 : 22 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={sectionView}
                    transition={{
                      layout: { type: "spring", stiffness: 320, damping: 34 },
                      opacity: reducesMotion
                        ? { duration: 0 }
                        : { duration: 0.52, delay: i * 0.045, ease: [0.16, 1, 0.3, 1] },
                      x: reducesMotion
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 210, damping: 27, mass: 0.72, delay: i * 0.05 },
                      scale: { type: "spring", stiffness: 280, damping: 30, mass: 0.55 },
                    }}
                  >
                    <div className="flex items-start gap-3.5">
                      <motion.span
                        layout
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                          boostStep === i ? "bg-vibo-primary text-white" : "bg-neutral-200/95 text-neutral-600"
                        }`}
                        transition={{ type: "spring", stiffness: 320, damping: 24 }}
                      >
                        {i + 1}
                      </motion.span>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[1.2rem] sm:text-[1.42rem] font-semibold tracking-[-0.02em] text-neutral-900">
                          {stepTitle}
                        </h3>
                        <p className="mt-2 text-[0.9rem] sm:text-[0.95rem] leading-relaxed text-neutral-600">
                          {tb.stepDetails[i]}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          <BusinessGrowthContactSection copy={tb} siteOrigin={SITE_ORIGIN} lang={lang} rtl={rtl} />

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
