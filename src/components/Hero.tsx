"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import LazyVideo from "@/components/LazyVideo";
import { videoUrl } from "@/lib/videoUrls";

interface HeroProps {
  t: any;
}

/** Mobile-first widths/heights; stagger margins only on lg+ */
const cards = [
  {
    src: videoUrl("/videos/vid1.mp4"),
    w: "w-[132px] min-w-[132px] sm:w-[180px] sm:min-w-[180px] md:w-[220px] lg:w-[260px]",
    h: "h-[210px] sm:h-[280px] md:h-[350px] lg:h-[400px]",
    mt: "mt-0 lg:mt-16 xl:mt-20",
  },
  {
    src: videoUrl("/videos/vid2.mp4"),
    w: "w-[140px] min-w-[140px] sm:w-[200px] sm:min-w-[200px] md:w-[250px] lg:w-[290px]",
    h: "h-[224px] sm:h-[330px] md:h-[420px] lg:h-[480px]",
    mt: "mt-0 lg:mt-4 xl:mt-6",
  },
  {
    src: videoUrl("/videos/vid3.mp4"),
    w: "w-[148px] min-w-[148px] sm:w-[220px] sm:min-w-[220px] md:w-[270px] lg:w-[320px]",
    h: "h-[236px] sm:h-[360px] md:h-[460px] lg:h-[530px]",
    mt: "mt-0",
  },
  {
    src: videoUrl("/videos/vid4.mp4"),
    w: "w-[136px] min-w-[136px] sm:w-[190px] sm:min-w-[190px] md:w-[240px] lg:w-[280px]",
    h: "h-[216px] sm:h-[300px] md:h-[380px] lg:h-[440px]",
    mt: "mt-0 lg:mt-10 xl:mt-14",
  },
];

export default function Hero({ t }: HeroProps) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const textO = useTransform(scrollYProgress, [0, 0.35], [1, 0]);
  const textY = useTransform(scrollYProgress, [0, 0.35], [0, -40]);

  return (
    <section
      ref={ref}
      className="relative min-h-[100dvh] lg:h-[110vh] overflow-hidden bg-transparent supports-[min-height:100svh]:min-h-[100svh]"
    >
      <div className="absolute bottom-0 inset-x-0 h-16 sm:h-24 bg-gradient-to-t from-[#fdfcf9]/80 to-transparent pointer-events-none z-[5]" />

      <div className="relative z-10 flex h-full min-h-0 flex-col lg:flex-row">
        {/* Copy + CTAs — full width on mobile, left column on desktop */}
        <motion.div
          className="flex w-full flex-shrink-0 flex-col justify-center section-padding pt-[calc(5.5rem+env(safe-area-inset-top))] pb-6 text-center sm:pb-8 sm:pt-[calc(6rem+env(safe-area-inset-top))] lg:w-[38%] lg:max-w-none lg:pb-0 lg:pt-0 lg:text-start"
          style={{ opacity: textO, y: textY }}
        >
          <h1 className="mb-4 text-[clamp(1.65rem,5.2vw,3.6rem)] font-bold leading-[1.08] tracking-[-0.035em] text-neutral-900 sm:mb-5 lg:mb-6">
            {t.hero.headline}
          </h1>
          <p className="mx-auto mb-6 max-w-[min(100%,22rem)] text-[clamp(0.875rem,3.2vw,0.95rem)] leading-relaxed text-neutral-400 sm:mb-8 sm:max-w-[320px] lg:mx-0 lg:mb-10">
            {t.hero.subtitle}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3 lg:justify-start">
            <a
              href="#"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-full bg-vibo-primary px-4 py-2.5 text-[0.8rem] font-medium text-white transition-colors duration-200 hover:bg-vibo-primary-light sm:px-5"
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
              </svg>
              App Store
            </a>
            <a
              href="#"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-full bg-neutral-900 px-4 py-2.5 text-[0.8rem] font-medium text-white transition-colors duration-200 hover:bg-neutral-800 sm:px-5"
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.199l2.807 1.626a1 1 0 010 1.732l-2.807 1.627L15.206 12l2.492-2.492zM5.864 2.658L16.8 8.99l-2.302 2.302-8.634-8.634z" />
              </svg>
              Google Play
            </a>
          </div>
        </motion.div>

        {/* Video strip: horizontal scroll on small screens, row on lg+ */}
        <div className="relative flex min-h-0 w-full flex-1 flex-col lg:block">
          <div
            className="no-scrollbar flex w-full flex-1 flex-row flex-nowrap items-end gap-3 overflow-x-auto overflow-y-visible overscroll-x-contain px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 [-webkit-overflow-scrolling:touch] snap-x snap-mandatory scroll-smooth sm:gap-4 sm:px-8 sm:pb-8 lg:snap-none lg:items-start lg:overflow-visible lg:px-0 lg:pb-0 lg:pt-[15vh] lg:pe-0"
          >
            {cards.map((card, i) => (
              <motion.div
                key={i}
                className={`group relative flex-shrink-0 snap-start ${card.w} ${card.h} ${card.mt} overflow-hidden rounded-[18px] shadow-xl shadow-black/[0.08] sm:rounded-[20px] lg:rounded-[24px] lg:snap-none`}
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.5,
                  delay: 0.1 + i * 0.08,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <LazyVideo
                  src={card.src}
                  className="absolute inset-0"
                  videoClassName="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <div className="absolute bottom-2 start-2 end-2 flex translate-y-1 items-center gap-2 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 sm:bottom-3 sm:start-3 sm:end-3">
                  <div className="flex items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 sm:px-2.5 sm:py-1">
                    <svg className="h-2.5 w-2.5 text-white sm:h-3 sm:w-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                    <span className="text-[9px] font-medium text-white sm:text-[10px]">2.4k</span>
                  </div>
                  <div className="flex items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 sm:px-2.5 sm:py-1">
                    <svg className="h-2.5 w-2.5 text-white sm:h-3 sm:w-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                    </svg>
                    <span className="text-[9px] font-medium text-white sm:text-[10px]">384</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
