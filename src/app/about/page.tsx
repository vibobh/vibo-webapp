"use client";

import { useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Check, ShieldCheck, Sparkles, Users } from "lucide-react";
import { getTranslations, isRTL } from "@/i18n";
import { useViboLang } from "@/i18n/useViboLang";
import GradientBg from "@/components/GradientBg";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const ease = [0.22, 1, 0.36, 1] as const;

const fadeUp = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-48px" },
  transition: { duration: 0.55, ease },
};

const pillarIcons = [Sparkles, Users, ShieldCheck] as const;

export default function AboutPage() {
  const { lang, switchLang } = useViboLang();
  const t = getTranslations(lang);
  const rtl = isRTL(lang);
  const a = t.about.page;

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = rtl ? "rtl" : "ltr";
    document.body.classList.toggle("font-ar", rtl);
    document.body.classList.toggle("font-en", !rtl);
  }, [lang, rtl]);

  const blogHref = `/blogs?lang=${lang}`;

  return (
    <div className="min-h-screen text-neutral-900">
      <GradientBg />
      <Navbar t={t} lang={lang} onSwitchLang={switchLang} />

      <main className="relative z-[1] pt-[72px] lg:pt-[80px]">
        {/* Hero */}
        <section className="relative overflow-hidden section-padding max-w-[1200px] mx-auto pb-16 sm:pb-20 lg:pb-24 pt-10 sm:pt-14">
          <div
            className="pointer-events-none absolute -top-24 sm:-top-32 start-[-20%] h-[min(100vw,520px)] w-[min(100vw,520px)] rounded-full bg-vibo-primary/[0.08] blur-3xl"
            aria-hidden
          />
          <div className="relative max-w-3xl text-start">
            <motion.p
              className="text-xs uppercase tracking-[0.18em] text-vibo-primary font-semibold mb-4"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease }}
            >
              {a.kicker}
            </motion.p>
            <motion.h1
              className="text-[clamp(2rem,4.5vw,3.15rem)] font-bold tracking-[-0.035em] text-neutral-900 leading-[1.08] mb-6"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.05, ease }}
            >
              {a.title}
            </motion.h1>
            <motion.p
              className="text-[1.05rem] sm:text-[1.125rem] text-neutral-600 leading-relaxed max-w-2xl"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.12, ease }}
            >
              {a.lede}
            </motion.p>
          </div>
        </section>

        {/* Belief — statement */}
        <section className="section-padding max-w-[1200px] mx-auto pb-16 sm:pb-20">
          <motion.div
            {...fadeUp}
            className="relative rounded-[1.75rem] border border-vibo-primary/[0.12] bg-white/[0.72] backdrop-blur-md shadow-[0_24px_80px_-32px_rgba(75,4,21,0.18)] px-6 py-10 sm:px-10 sm:py-12 lg:px-14 lg:py-14"
          >
            <p className="text-xs uppercase tracking-[0.16em] text-vibo-primary font-semibold mb-6">
              {a.quoteLabel}
            </p>
            <blockquote className="border-s-4 border-vibo-primary/40 ps-6 sm:ps-8">
              <p className="text-[clamp(1.15rem,2.1vw,1.55rem)] font-semibold leading-[1.5] text-neutral-800 tracking-[-0.02em]">
                {t.about.statement}
              </p>
            </blockquote>
          </motion.div>
        </section>

        {/* Pillars */}
        <section className="section-padding max-w-[1200px] mx-auto pb-16 sm:pb-20 lg:pb-24">
          <motion.h2
            {...fadeUp}
            className="text-start text-2xl sm:text-[1.65rem] font-bold tracking-[-0.03em] text-neutral-900 mb-10 sm:mb-12 max-w-xl"
          >
            {a.pillarsTitle}
          </motion.h2>
          <div className="grid gap-5 sm:gap-6 md:grid-cols-3">
            {a.pillars.map((pillar, i) => {
              const Icon = pillarIcons[i] ?? Sparkles;
              return (
                <motion.article
                  key={pillar.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.5, delay: i * 0.08, ease }}
                  className="group relative flex flex-col rounded-2xl border border-neutral-200/90 bg-[#fdfcf9]/90 p-6 sm:p-7 shadow-sm transition-shadow duration-300 hover:shadow-md hover:border-vibo-primary/20"
                >
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-vibo-primary/[0.09] text-vibo-primary ring-1 ring-vibo-primary/10 transition-transform duration-300 group-hover:scale-[1.03]">
                    <Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
                  </div>
                  <h3 className="text-lg font-bold text-neutral-900 tracking-[-0.02em] mb-2">
                    {pillar.title}
                  </h3>
                  <p className="text-[0.95rem] leading-relaxed text-neutral-600 flex-1">{pillar.body}</p>
                </motion.article>
              );
            })}
          </div>
        </section>

        {/* Story + features */}
        <section className="border-t border-vibo-primary/10 bg-[#fdfcf9]/75">
          <div className="section-padding max-w-[1200px] mx-auto py-16 sm:py-20 lg:py-24">
            <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-start">
              <motion.div {...fadeUp}>
                <h2 className="text-2xl sm:text-[1.65rem] font-bold tracking-[-0.03em] text-neutral-900 mb-5">
                  {a.storyTitle}
                </h2>
                <p className="text-[1.02rem] sm:text-[1.06rem] leading-relaxed text-neutral-600">
                  {a.storyBody}
                </p>
              </motion.div>
              <motion.div
                initial={fadeUp.initial}
                whileInView={fadeUp.whileInView}
                viewport={fadeUp.viewport}
                transition={{ duration: 0.55, ease, delay: 0.1 }}
              >
                <h3 className="text-sm uppercase tracking-[0.14em] text-vibo-primary font-semibold mb-5">
                  {a.featuresTitle}
                </h3>
                <ul className="space-y-4">
                  {a.features.map((item) => (
                    <li key={item} className="flex gap-3 text-start">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-vibo-primary text-white">
                        <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                      </span>
                      <span className="text-[0.98rem] sm:text-[1.02rem] leading-relaxed text-neutral-700 pt-0.5">
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="section-padding max-w-[1200px] mx-auto py-16 sm:py-20 lg:py-24">
          <motion.div
            {...fadeUp}
            className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-vibo-primary via-[#6d0a24] to-[#4b0415] px-6 py-10 sm:px-10 sm:py-12 text-center shadow-[0_28px_80px_-24px_rgba(75,4,21,0.45)]"
          >
            <div
              className="pointer-events-none absolute -top-20 end-[-10%] h-56 w-56 rounded-full bg-white/10 blur-2xl"
              aria-hidden
            />
            <h2 className="relative text-2xl sm:text-3xl font-bold tracking-[-0.03em] text-white mb-3">
              {a.ctaTitle}
            </h2>
            <p className="relative text-white/85 text-[0.98rem] sm:text-[1.05rem] max-w-lg mx-auto leading-relaxed mb-8">
              {a.ctaBody}
            </p>
            <div className="relative flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
              <a
                href="#"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-white text-vibo-primary px-7 py-3 text-sm font-semibold shadow-md hover:bg-neutral-50 transition-colors min-w-[200px]"
              >
                {a.ctaPrimary}
              </a>
              <Link
                href={blogHref}
                className="inline-flex items-center justify-center rounded-full border border-white/35 bg-white/10 px-7 py-3 text-sm font-medium text-white hover:bg-white/15 transition-colors min-w-[200px]"
              >
                {a.ctaSecondary}
              </Link>
            </div>
          </motion.div>
        </section>
      </main>

      <Footer t={t} lang={lang} onSwitchLang={switchLang} />
    </div>
  );
}
