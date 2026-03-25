"use client";

import { BarChart3, Mail, Smartphone } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

import { Card, CardContent } from "@/components/ui/card";

const sectionView = { once: true, margin: "-70px" as const };

export type GrowthCardCopy = { title: string; body: string };

export type BusinessGrowthContactCopy = {
  insightsLabel: string;
  insightsTitleBefore: string;
  insightsTitleAccent: string;
  insightsBody: string;
  growthCards: GrowthCardCopy[];
  growthCtaHeading: string;
  growthCtaBody: string;
  growthCtaContact: string;
  growthCtaNewsroom: string;
  growthCtaDownload: string;
};

const icons = [BarChart3, Smartphone, Mail] as const;

type Props = {
  copy: BusinessGrowthContactCopy;
  siteOrigin: string;
  lang: string;
  rtl: boolean;
};

export default function BusinessGrowthContactSection({ copy, siteOrigin, lang, rtl }: Props) {
  const reducesMotion = useReducedMotion();
  const cards = copy.growthCards.slice(0, 3);

  return (
    <section
      id="insights"
      className="relative scroll-mt-28 border-y border-vibo-primary/[0.07] bg-[#fdfcf9]"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.45]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(75, 4, 21, 0.06) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(75, 4, 21, 0.06) 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
        }}
        aria-hidden
      />
      <div className="relative max-w-[1400px] mx-auto section-padding py-14 sm:py-20">
        <motion.div
          initial={reducesMotion ? false : { opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={sectionView}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-3xl"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-vibo-primary">
            {copy.insightsLabel}
          </p>
          <h2 className="mt-2 text-[clamp(1.75rem,3.4vw,2.85rem)] font-bold tracking-[-0.03em] text-neutral-900">
            {copy.insightsTitleBefore}
            <span className="text-vibo-primary">{copy.insightsTitleAccent}</span>
          </h2>
          <p className="mt-4 text-neutral-600 leading-relaxed">{copy.insightsBody}</p>
        </motion.div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((item, i) => {
            const Icon = icons[i] ?? BarChart3;
            return (
              <motion.div
                key={item.title}
                initial={reducesMotion ? false : { opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={sectionView}
                transition={{ duration: 0.5, delay: i * 0.06 }}
              >
                <Card className="h-full overflow-hidden border-vibo-primary/12 bg-white/90 shadow-[0_12px_36px_rgba(75,4,21,0.06)] backdrop-blur-sm transition-shadow hover:shadow-[0_16px_44px_rgba(75,4,21,0.09)]">
                  <CardContent className="pt-7 pb-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-vibo-rose/80 text-vibo-primary ring-1 ring-vibo-primary/10">
                      <Icon className="h-6 w-6" strokeWidth={1.75} aria-hidden />
                    </div>
                    <h3 className="mt-5 text-lg font-semibold tracking-[-0.02em] text-neutral-900">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-neutral-600">{item.body}</p>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={reducesMotion ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={sectionView}
          transition={{ duration: 0.55, delay: 0.08 }}
          className="relative mt-12 overflow-hidden rounded-[1.75rem] shadow-[0_24px_60px_rgba(75,4,21,0.25)]"
        >
          <div className="relative rounded-[1.75rem] bg-gradient-to-r from-vibo-primary via-vibo-primary-light to-vibo-primary-dark px-6 py-10 sm:px-10 sm:py-12 text-center">
            <div
              className="pointer-events-none absolute inset-0 opacity-25 bg-[radial-gradient(circle_at_20%_30%,rgba(255,255,255,.4),transparent_50%)]"
              aria-hidden
            />
            <div className="relative">
              <h3 className="text-[clamp(1.5rem,2.8vw,2.25rem)] font-bold tracking-[-0.03em] text-white">
                {copy.growthCtaHeading}
              </h3>
              <p className="mx-auto mt-3 max-w-2xl text-[0.95rem] leading-relaxed text-white/88">
                {copy.growthCtaBody}
              </p>
              <div
                className={`mt-9 flex flex-wrap items-center justify-center gap-3 ${
                  rtl ? "flex-row-reverse" : ""
                }`}
              >
                <a
                  href="#contact"
                  className="inline-flex min-h-[44px] min-w-[10rem] items-center justify-center rounded-full bg-white px-6 text-[0.85rem] font-semibold text-vibo-primary shadow-md transition hover:bg-vibo-cream"
                >
                  {copy.growthCtaContact}
                </a>
                <a
                  href={`${siteOrigin}/newsroom?lang=${lang}`}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-white/45 px-6 text-[0.85rem] font-semibold text-white transition hover:bg-white/10"
                >
                  {copy.growthCtaNewsroom}
                </a>
                <a
                  href="#"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-white/25 bg-white/5 px-6 text-[0.85rem] font-semibold text-white/95 transition hover:bg-white/10"
                >
                  {copy.growthCtaDownload}
                  <svg
                    className={`ms-2 h-4 w-4 ${rtl ? "rotate-180" : ""}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
