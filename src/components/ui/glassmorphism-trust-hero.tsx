"use client";

import React from "react";
import { ArrowRight, Play } from "@/components/ui/icons";
import WorldGlobe from "@/components/ui/WorldGlobe";

type HeroProfile = {
  name: string;
  adBadge: string;
};

export type GlassmorphismTrustHeroProps = {
  titleStart: string;
  titleAccent: string;
  titleEnd: string;
  subtitle: string;
  ctaPrimary: string;
  ctaSecondary: string;
  createAd: string;
  siteOrigin: string;
  heroAdProfiles: HeroProfile[];
};

export default function GlassmorphismTrustHero(props: GlassmorphismTrustHeroProps) {
  return (
    <div className="relative w-full text-neutral-900 overflow-x-hidden overflow-y-visible font-sans">
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fadeSlideIn 0.8s ease-out forwards;
          opacity: 0;
        }
        .delay-100 { animation-delay: 0.1s; }
        .delay-200 { animation-delay: 0.2s; }
        .delay-300 { animation-delay: 0.3s; }
        .delay-400 { animation-delay: 0.4s; }
        .delay-500 { animation-delay: 0.5s; }
      `}</style>

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-8 items-start">
        {/* --- LEFT COLUMN --- */}
        <div className="lg:col-span-7 flex min-w-0 flex-col justify-center space-y-8 pt-2">
          {/* Keeps headline vertical rhythm similar to when the pill badge was above */}
          <div className="h-9 sm:h-10 shrink-0" aria-hidden />

          {/* Heading — three lines, smaller type than before */}
          <h1
            className="animate-fade-in delay-200 text-[1.65rem] sm:text-4xl lg:text-5xl xl:text-6xl font-semibold tracking-tighter leading-[1.05] text-neutral-900 overflow-visible"
          >
            {props.titleStart.trim()}
            <br />
            <span
              className="inline-block bg-gradient-to-br from-vibo-primary via-vibo-primary to-vibo-gold bg-clip-text text-transparent tracking-tight pr-[0.28em] pb-[0.06em]"
            >
              {props.titleAccent.trim()}
            </span>
            <br />
            {props.titleEnd.trim()}
          </h1>

          {/* Description */}
          <p className="animate-fade-in delay-300 max-w-xl text-lg text-neutral-600 leading-relaxed">{props.subtitle}</p>

          {/* CTA Buttons */}
          <div className="animate-fade-in delay-400 flex flex-col sm:flex-row gap-4">
            <a
              href="#objectives"
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-vibo-primary px-8 py-4 text-sm font-semibold text-white transition-all hover:scale-[1.02] hover:bg-vibo-primary-light active:scale-[0.98]"
            >
              {props.ctaPrimary}
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </a>

            <a
              href="#creative"
              className="group inline-flex items-center justify-center gap-2 rounded-full border border-vibo-primary/20 bg-white/70 px-8 py-4 text-sm font-semibold text-neutral-900 backdrop-blur-sm transition-colors hover:bg-white/90 hover:border-vibo-primary/30 active:scale-[0.98]"
            >
              <Play className="w-4 h-4 fill-current text-vibo-primary" />
              {props.ctaSecondary}
            </a>

            <a
              href={`${props.siteOrigin}/`}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-vibo-primary/25 px-5 py-4 text-sm font-semibold text-vibo-primary hover:bg-vibo-rose/60 transition-colors"
            >
              {props.createAd}
            </a>
          </div>
        </div>

        {/* --- RIGHT COLUMN: globe only (no card) --- */}
        <div className="flex justify-center lg:col-span-5 lg:mt-2 lg:justify-end">
          <div className="animate-fade-in delay-500 w-full max-w-[min(100%,560px)]">
            <WorldGlobe className="max-w-none w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}


