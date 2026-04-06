"use client";

import React from "react";
import { ArrowRight, Play, Target, Crown } from "lucide-react";

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

// --- SUB-COMPONENTS ---
function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center transition-transform hover:-translate-y-1 cursor-default">
      <span className="text-xl font-bold text-neutral-900 sm:text-2xl">{value}</span>
      <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium sm:text-xs">{label}</span>
    </div>
  );
}

export default function GlassmorphismTrustHero(props: GlassmorphismTrustHeroProps) {
  // TEMP: For this Vibo landing page we only show one trusted advertiser.
  // (User requested: remove all companies and keep only sirati.bh)
  const clients = [{ name: "Sirati", href: "https://sirati.bh/" }];
  const shouldMarquee = clients.length > 1;

  return (
    <div className="relative w-full text-neutral-900 overflow-hidden font-sans">
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .animate-fade-in {
          animation: fadeSlideIn 0.8s ease-out forwards;
          opacity: 0;
        }
        .animate-marquee {
          animation: marquee 40s linear infinite; /* Slower for readability */
        }
        .delay-100 { animation-delay: 0.1s; }
        .delay-200 { animation-delay: 0.2s; }
        .delay-300 { animation-delay: 0.3s; }
        .delay-400 { animation-delay: 0.4s; }
        .delay-500 { animation-delay: 0.5s; }
      `}</style>

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-8 items-start">
        {/* --- LEFT COLUMN --- */}
        <div className="lg:col-span-7 flex flex-col justify-center space-y-6 pt-2">
          {/* Heading */}
          <h1
            className="animate-fade-in delay-100 text-[1.875rem] sm:text-4xl md:text-[2.25rem] lg:text-5xl xl:text-6xl font-semibold tracking-tighter leading-[1.05] text-neutral-900"
          >
            {props.titleStart}
            <br />
            <span className="bg-gradient-to-br from-vibo-primary via-vibo-primary to-vibo-gold bg-clip-text text-transparent">
              {props.titleAccent}
            </span>
            {props.titleEnd}
          </h1>

          {/* Description */}
          <p className="animate-fade-in delay-200 max-w-xl text-base sm:text-lg text-neutral-600 leading-relaxed">{props.subtitle}</p>

          {/* CTA Buttons */}
          <div className="animate-fade-in delay-300 flex flex-col sm:flex-row gap-4">
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

        {/* --- RIGHT COLUMN --- */}
        <div className="lg:col-span-5 space-y-6 lg:mt-6">
          {/* Stats Card */}
          <div className="animate-fade-in delay-500 relative overflow-hidden rounded-3xl border border-vibo-primary/15 bg-white/75 p-8 backdrop-blur-xl shadow-[0_16px_40px_rgba(75,4,21,0.08)]">
            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-vibo-primary/5 ring-1 ring-vibo-primary/15">
                  <Target className="h-6 w-6 text-vibo-primary" />
                </div>
                <div>
                  <div className="text-3xl font-bold tracking-tight text-neutral-900">150+</div>
                  <div className="text-sm text-neutral-500">Ad campaigns boosted</div>
                </div>
              </div>

              {/* Progress Bar Section */}
              <div className="space-y-3 mb-8">
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">Campaign success rate</span>
                  <span className="text-neutral-900 font-medium">98%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200/70">
                  <div className="h-full w-[98%] rounded-full bg-gradient-to-r from-vibo-primary to-vibo-gold" />
                </div>
              </div>

              <div className="h-px w-full bg-neutral-200 mb-6" />

              {/* Mini Stats Grid */}
              <div className="grid grid-cols-3 gap-4 text-center">
                <StatItem value="5+" label="Creative tools" />
                <div className="w-px h-full bg-neutral-200 mx-auto" />
                <StatItem value="24/7" label="Smart help" />
                <div className="w-px h-full bg-neutral-200 mx-auto" />
                <StatItem value="100%" label="Quality checks" />
              </div>

              {/* Tag Pills */}
              <div className="mt-8 flex flex-wrap gap-2">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-vibo-primary/15 bg-vibo-rose/25 px-3 py-1 text-[10px] font-medium tracking-wide text-neutral-700">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                  LIVE ADS
                </div>
                <div className="inline-flex items-center gap-1.5 rounded-full border border-vibo-primary/15 bg-white/60 px-3 py-1 text-[10px] font-medium tracking-wide text-neutral-700">
                  <Crown className="w-3 h-3 text-vibo-gold" />
                  SMART TOOLS
                </div>
              </div>
            </div>
          </div>

          {/* Marquee Card */}
          <div className="animate-fade-in delay-500 relative overflow-hidden rounded-3xl border border-vibo-primary/15 bg-white/70 py-8 backdrop-blur-xl">
            <h3 className="mb-6 px-8 text-sm font-medium text-neutral-500">Trusted by advertisers</h3>

            {shouldMarquee ? (
              <div
                className="relative flex overflow-hidden"
                style={{
                  maskImage: "linear-gradient(to right, transparent, black 20%, black 80%, transparent)",
                  WebkitMaskImage: "linear-gradient(to right, transparent, black 20%, black 80%, transparent)",
                }}
              >
                <div className="animate-marquee flex gap-12 whitespace-nowrap px-4">
                  {[...clients, ...clients, ...clients].map((client, i) => {
                    return (
                      <a
                        key={`${client.name}-${i}`}
                        href={client.href}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 opacity-70 transition-colors hover:opacity-100 cursor-pointer grayscale hover:grayscale-0"
                      >
                        <span className="text-lg font-bold text-neutral-900 tracking-tight">{client.name}</span>
                      </a>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center px-4">
                {clients.map((client) => {
                  return (
                    <a
                      key={client.name}
                      href={client.href}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center"
                    >
                      <span className="group inline-flex items-center justify-center text-lg font-bold tracking-tight text-neutral-900 transition-colors duration-300 hover:text-[#0A84FF]">
                        {client.name}
                      </span>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

