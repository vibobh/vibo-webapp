"use client";

import React from "react";
import {
  ArrowRight,
  Play,
  Target,
  Crown,
  Star,
  // Brand icons
  Hexagon,
  Triangle,
  Command,
  Ghost,
  Gem,
  Cpu,
  type LucideIcon,
} from "lucide-react";

type HeroProfile = {
  name: string;
  adBadge: string;
};

export type GlassmorphismTrustHeroProps = {
  tagline: string;
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

// Map each client to an icon to keep the marquee visually interesting.
const ICONS: LucideIcon[] = [Hexagon, Triangle, Command, Ghost, Gem, Cpu];

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
  const clients = [
    { name: "Sirati", icon: Cpu as LucideIcon, href: "https://sirati.bh/" },
  ];

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

      {/* Subtle background wash so "glass" panels read on the app's light gradient */}
      <div
        className="absolute inset-0 -z-10"
        aria-hidden
        style={{
          backgroundImage: `
            radial-gradient(ellipse 60% 55% at 85% 15%, rgba(196,168,124,0.20), transparent 55%),
            radial-gradient(ellipse 55% 60% at 10% 45%, rgba(75,4,21,0.10), transparent 55%),
            radial-gradient(ellipse 35% 35% at 50% 85%, rgba(75,4,21,0.08), transparent 60%)
          `,
        }}
      />

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-8 items-start">
        {/* --- LEFT COLUMN --- */}
        <div className="lg:col-span-7 flex flex-col justify-center space-y-8 pt-2">
          {/* Badge */}
          <div className="animate-fade-in delay-100">
            <div className="inline-flex items-center gap-2 rounded-full border border-vibo-primary/15 bg-white/70 px-3 py-1.5 backdrop-blur-md transition-colors hover:bg-white/85">
              <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-neutral-700 flex items-center gap-2">
                {props.tagline}
                <Star className="w-3.5 h-3.5 text-vibo-gold fill-vibo-gold" />
              </span>
            </div>
          </div>

          {/* Heading */}
          <h1
            className="animate-fade-in delay-200 text-[2.6rem] sm:text-6xl lg:text-7xl xl:text-8xl font-semibold tracking-tighter leading-[0.95] text-neutral-900"
          >
            {props.titleStart}
            <br />
            <span className="bg-gradient-to-br from-vibo-primary via-vibo-primary to-vibo-gold bg-clip-text text-transparent">
              {props.titleAccent}
            </span>
            {props.titleEnd}
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

        {/* --- RIGHT COLUMN --- */}
        <div className="lg:col-span-5 space-y-6 lg:mt-6">
          {/* Stats Card */}
          <div className="animate-fade-in delay-500 relative overflow-hidden rounded-3xl border border-vibo-primary/15 bg-white/75 p-8 backdrop-blur-xl shadow-[0_16px_40px_rgba(75,4,21,0.08)]">
            {/* Card Glow Effect */}
            <div className="absolute top-0 right-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-vibo-gold/20 blur-3xl pointer-events-none" />

            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-vibo-primary/5 ring-1 ring-vibo-primary/15">
                  <Target className="h-6 w-6 text-vibo-primary" />
                </div>
                <div>
                  <div className="text-3xl font-bold tracking-tight text-neutral-900">150+</div>
                  <div className="text-sm text-neutral-500">Projects delivered</div>
                </div>
              </div>

              {/* Progress Bar Section */}
              <div className="space-y-3 mb-8">
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">Client satisfaction</span>
                  <span className="text-neutral-900 font-medium">98%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200/70">
                  <div className="h-full w-[98%] rounded-full bg-gradient-to-r from-vibo-primary to-vibo-gold" />
                </div>
              </div>

              <div className="h-px w-full bg-neutral-200 mb-6" />

              {/* Mini Stats Grid */}
              <div className="grid grid-cols-3 gap-4 text-center">
                <StatItem value="5+" label="Years" />
                <div className="w-px h-full bg-neutral-200 mx-auto" />
                <StatItem value="24/7" label="Support" />
                <div className="w-px h-full bg-neutral-200 mx-auto" />
                <StatItem value="100%" label="Quality" />
              </div>

              {/* Tag Pills */}
              <div className="mt-8 flex flex-wrap gap-2">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-vibo-primary/15 bg-vibo-rose/25 px-3 py-1 text-[10px] font-medium tracking-wide text-neutral-700">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                  ACTIVE
                </div>
                <div className="inline-flex items-center gap-1.5 rounded-full border border-vibo-primary/15 bg-white/60 px-3 py-1 text-[10px] font-medium tracking-wide text-neutral-700">
                  <Crown className="w-3 h-3 text-vibo-gold" />
                  PREMIUM
                </div>
              </div>
            </div>
          </div>

          {/* Marquee Card */}
          <div className="animate-fade-in delay-500 relative overflow-hidden rounded-3xl border border-vibo-primary/15 bg-white/70 py-8 backdrop-blur-xl">
            <h3 className="mb-6 px-8 text-sm font-medium text-neutral-500">Trusted by advertisers</h3>

            <div
              className="relative flex overflow-hidden"
              style={{
                maskImage: "linear-gradient(to right, transparent, black 20%, black 80%, transparent)",
                WebkitMaskImage: "linear-gradient(to right, transparent, black 20%, black 80%, transparent)",
              }}
            >
              <div className="animate-marquee flex gap-12 whitespace-nowrap px-4">
                {[...clients, ...clients, ...clients].map((client, i) => {
                  const Icon = client.icon;
                  return (
                      <a
                        key={`${client.name}-${i}`}
                        href={client.href}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 opacity-70 transition-all hover:opacity-100 hover:scale-[1.02] cursor-pointer grayscale hover:grayscale-0"
                      >
                        {/* Brand Icon */}
                        <Icon className="h-6 w-6 text-neutral-900/80 fill-current" />
                        <span className="text-lg font-bold text-neutral-900 tracking-tight">{client.name}</span>
                      </a>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

