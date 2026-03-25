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
import LazyVideo from "@/components/LazyVideo";
import { videoUrl } from "@/lib/videoUrls";

const SITE_ORIGIN = "https://joinvibo.com";

const sectionView = { once: true, margin: "-70px" as const };

type HeroAdVariant = "main" | "top" | "bottom";

function AdPreviewCard({
  label,
  profileName,
  adBadge,
  videoFile,
  variant,
  className,
  floatClass,
}: {
  label: string;
  profileName: string;
  adBadge: string;
  videoFile: string;
  variant: HeroAdVariant;
  className?: string;
  floatClass: string;
}) {
  const src = videoUrl(`/videos/${videoFile}`);
  const initial = profileName.trim().charAt(0).toUpperCase() || "V";
  const radius = variant === "main" ? "rounded-[30px]" : "rounded-[22px]";
  const shadow =
    variant === "main"
      ? "shadow-[0_22px_60px_rgba(0,0,0,0.12),0_4px_16px_rgba(0,0,0,0.06)]"
      : "shadow-[0_16px_40px_rgba(0,0,0,0.1),0_2px_8px_rgba(0,0,0,0.05)]";

  return (
    <div
      className={`relative overflow-hidden border border-black/[0.08] bg-neutral-900 ${radius} ${shadow} ${floatClass} ${className ?? ""}`}
    >
      <LazyVideo
        src={src}
        className="absolute inset-0 h-full w-full"
        videoClassName="h-full w-full object-cover"
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/25"
        aria-hidden
      />
      <div
        className={`pointer-events-none absolute start-2.5 top-2.5 flex items-start gap-2 ${variant === "main" ? "end-16" : "end-2"}`}
      >
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/95 text-[10px] font-bold text-vibo-primary shadow-md ring-1 ring-black/5"
          aria-hidden
        >
          {initial}
        </span>
        <div className="min-w-0 pt-0.5">
          <p className="max-w-[8.5rem] truncate text-[11px] font-semibold leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)] sm:max-w-[10rem]">
            {profileName}
          </p>
          <p className="text-[9px] font-medium leading-tight text-white/85 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
            {adBadge}
          </p>
        </div>
      </div>

      {variant === "main" ? (
        <span className="pointer-events-none absolute end-0 top-1/2 z-20 -translate-y-1/2 translate-x-[18%] rounded-full bg-[#1877f2] px-3.5 py-2 text-[10px] font-bold uppercase tracking-wide text-white shadow-[0_4px_14px_rgba(24,119,242,0.45)] sm:px-4 sm:text-[11px] rtl:translate-x-[-18%]">
          {label}
        </span>
      ) : variant === "bottom" ? (
        <span className="pointer-events-none absolute start-2.5 bottom-2.5 max-w-[calc(100%-1rem)] rounded-full bg-white/95 px-3 py-1.5 text-[10px] font-semibold text-neutral-900 shadow-md ring-1 ring-black/5 sm:text-[11px]">
          {label}
        </span>
      ) : (
        <div className="pointer-events-none absolute inset-x-2 bottom-2.5 flex justify-center">
          <span className="inline-flex rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-semibold text-vibo-primary shadow-md ring-1 ring-black/5 sm:px-3 sm:text-[11px]">
            {label}
          </span>
        </div>
      )}
    </div>
  );
}

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

  const heroProfiles = tb.heroAdProfiles;
  const heroMain = {
    variant: "main" as const,
    label: tb.cards.boost,
    profile: heroProfiles[0],
    videoFile: "vid1.mp4",
    float: "motion-safe:animate-float-slow",
  };
  const heroTop = {
    variant: "top" as const,
    label: tb.cards.product,
    profile: heroProfiles[1],
    videoFile: "vid2.mp4",
    float: "motion-safe:animate-float-medium",
  };
  const heroBottom = {
    variant: "bottom" as const,
    label: tb.cards.learn,
    profile: heroProfiles[2],
    videoFile: "vid3.mp4",
    float: "motion-safe:animate-float-fast",
  };

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
            { id: "faq", href: "#faq", label: tb.anchors.faq },
          ]}
        />
        <main className="relative z-[1] text-neutral-900">
          <section
            id="get-started"
            className="max-w-[1400px] mx-auto section-padding pt-[calc(5.5rem+env(safe-area-inset-top))] pb-14 sm:pt-[calc(6rem+env(safe-area-inset-top))] sm:pb-20 scroll-mt-28"
          >
            <div className="grid lg:grid-cols-2 gap-10 items-center">
              <motion.div
                initial={reducesMotion ? false : { opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={sectionView}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                <p className="text-[0.7rem] font-medium uppercase tracking-[0.14em] text-vibo-primary mb-3">
                  {tb.tagline}
                </p>
                <h1 className="text-[clamp(2.1rem,5vw,3.75rem)] leading-[1.06] tracking-[-0.035em] font-bold text-neutral-900 max-w-[560px]">
                  {tb.hero.titleStart}
                  <span className="text-vibo-primary">{tb.hero.titleAccent}</span>
                  {tb.hero.titleEnd}
                </h1>
                <p className="mt-5 text-neutral-600 max-w-[520px] text-[1.02rem] leading-relaxed">
                  {tb.hero.subtitle}
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <a
                    href="#objectives"
                    className="inline-flex h-11 px-6 items-center justify-center rounded-full bg-vibo-primary text-white text-[0.8rem] font-medium hover:bg-vibo-primary-light transition-colors shadow-md shadow-vibo-primary/20"
                  >
                    {tb.hero.ctaPrimary}
                  </a>
                  <a
                    href="#creative"
                    className="inline-flex h-11 px-6 items-center justify-center rounded-full bg-neutral-900 text-white text-[0.8rem] font-medium hover:bg-neutral-800 transition-colors"
                  >
                    {tb.hero.ctaSecondary}
                  </a>
                  <a
                    href={`${SITE_ORIGIN}/`}
                    className="inline-flex h-11 px-5 items-center justify-center rounded-full border border-vibo-primary/25 text-[0.8rem] font-semibold text-vibo-primary hover:bg-vibo-rose/60 transition-colors"
                  >
                    {tb.createAd}
                  </a>
                </div>
              </motion.div>

              <motion.div
                className="relative mx-auto flex w-full max-w-[20.5rem] flex-col items-center gap-8 overflow-visible sm:max-w-[23rem] md:flex-row md:items-center md:justify-end md:gap-0 md:pe-2 lg:mx-0 lg:max-w-none lg:justify-end lg:pe-2"
                initial={reducesMotion ? false : { opacity: 0, scale: 0.96 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={sectionView}
                transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="relative z-20 shrink-0 md:-translate-y-1">
                  <AdPreviewCard
                    key={heroMain.label}
                    variant={heroMain.variant}
                    label={heroMain.label}
                    profileName={heroMain.profile.name}
                    adBadge={heroMain.profile.adBadge}
                    videoFile={heroMain.videoFile}
                    className="h-[288px] w-[200px] sm:h-[308px] sm:w-[214px] md:h-[340px] md:w-[232px]"
                    floatClass={heroMain.float}
                  />
                </div>
                <div className="relative z-10 flex w-full max-w-[19rem] shrink-0 flex-row items-start justify-center gap-4 sm:max-w-none sm:gap-5 md:max-w-none md:-translate-x-4 md:flex-col md:items-stretch md:gap-5 md:pt-2 md:rtl:translate-x-4">
                  <AdPreviewCard
                    key={heroTop.label}
                    variant={heroTop.variant}
                    label={heroTop.label}
                    profileName={heroTop.profile.name}
                    adBadge={heroTop.profile.adBadge}
                    videoFile={heroTop.videoFile}
                    className="h-[210px] w-[136px] sm:h-[224px] sm:w-[144px] md:h-[248px] md:w-[152px]"
                    floatClass={heroTop.float}
                  />
                  <AdPreviewCard
                    key={heroBottom.label}
                    variant={heroBottom.variant}
                    label={heroBottom.label}
                    profileName={heroBottom.profile.name}
                    adBadge={heroBottom.profile.adBadge}
                    videoFile={heroBottom.videoFile}
                    className="h-[178px] w-[148px] sm:h-[190px] sm:w-[156px] md:mt-1 md:h-[200px] md:w-[168px]"
                    floatClass={heroBottom.float}
                  />
                </div>
              </motion.div>
            </div>
          </section>

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

          <section className="max-w-[1400px] mx-auto section-padding py-14 sm:py-20">
            <div className="grid lg:grid-cols-2 gap-10 items-center">
              <motion.div
                initial={reducesMotion ? false : { opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={sectionView}
                transition={{ duration: 0.55 }}
              >
                <p className="text-[11px] uppercase tracking-[0.16em] text-vibo-primary font-semibold">
                  {tb.insightsLabel}
                </p>
                <h2 className="mt-2 text-[clamp(1.75rem,3.4vw,2.85rem)] font-bold tracking-[-0.03em] text-neutral-900">
                  {tb.insightsTitleBefore}
                  <span className="text-vibo-primary">{tb.insightsTitleAccent}</span>
                </h2>
                <p className="mt-4 text-neutral-600 leading-relaxed max-w-[520px]">{tb.insightsBody}</p>
              </motion.div>
              <motion.div
                className="rounded-[30px] border border-vibo-primary/15 bg-white/90 aspect-[9/16] max-w-[360px] mx-auto shadow-[0_16px_40px_rgba(75,4,21,0.08)]"
                initial={reducesMotion ? false : { opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={sectionView}
                transition={{ duration: 0.55, delay: 0.05 }}
              />
            </div>
          </section>

          <section className="relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-vibo-primary via-vibo-primary-light to-vibo-primary-dark" />
            <div className="absolute inset-0 opacity-25 bg-[radial-gradient(circle_at_20%_50%,rgba(255,255,255,.35),transparent_50%)]" />
            <div className="relative max-w-[1400px] mx-auto section-padding py-16 sm:py-20 text-center">
              <motion.h2
                className="text-[clamp(1.6rem,3vw,2.4rem)] font-bold tracking-[-0.03em] text-white"
                initial={reducesMotion ? false : { opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={sectionView}
                transition={{ duration: 0.5 }}
              >
                {tb.ctaBandHeading}
              </motion.h2>
              <motion.p
                className="mt-3 text-white/85 max-w-xl mx-auto text-[0.95rem] leading-relaxed"
                initial={reducesMotion ? false : { opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={sectionView}
                transition={{ duration: 0.5, delay: 0.05 }}
              >
                {tb.ctaBandBody}
              </motion.p>
              <motion.div
                className="mt-8 flex flex-wrap justify-center gap-3"
                initial={reducesMotion ? false : { opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={sectionView}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                <a
                  href="#"
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-white px-6 text-[0.85rem] font-semibold text-vibo-primary hover:bg-vibo-cream transition-colors"
                >
                  {tb.ctaBandButton}
                  <svg className="h-4 w-4 rtl:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </a>
                <a
                  href={`${SITE_ORIGIN}/newsroom?lang=${lang}`}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-white/40 px-6 text-[0.85rem] font-semibold text-white hover:bg-white/10 transition-colors"
                >
                  {t.nav.newsroom}
                </a>
              </motion.div>
            </div>
          </section>

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

            <div className="mt-8 grid md:grid-cols-2 gap-x-12 gap-y-1">
              {tb.faqs.map((item: { q: string; a: string }, i: number) => (
                <motion.div
                  key={item.q}
                  className="border-b border-neutral-200/90"
                  initial={reducesMotion ? false : { opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={sectionView}
                  transition={{ duration: 0.4, delay: i * 0.04 }}
                >
                  <button
                    type="button"
                    aria-expanded={openFaq === i}
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full text-left py-4 flex items-start justify-between gap-4 group"
                  >
                    <span className="text-[1.12rem] sm:text-[1.2rem] leading-snug font-medium text-neutral-900 group-hover:text-vibo-primary transition-colors">
                      {item.q}
                    </span>
                    <span
                      className={`mt-1 shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full border border-vibo-primary/15 text-vibo-primary transition-transform duration-200 ${
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
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                      >
                        <p className="pb-4 text-[0.92rem] text-neutral-600 leading-relaxed pe-2">{item.a}</p>
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
