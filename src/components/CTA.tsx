"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";

interface CTAProps {
  t: any;
}

export default function CTA({ t }: CTAProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <section className="bg-transparent">
      <div className="section-padding pb-16 sm:pb-20 lg:pb-24">
        <div
          ref={ref}
          className="relative overflow-hidden rounded-[24px] sm:rounded-[32px] bg-vibo-primary mx-auto max-w-[1400px]"
        >
          <div
            className="absolute inset-0 overflow-hidden rounded-[inherit] pointer-events-none"
            style={{
              background: `
                radial-gradient(ellipse 70% 60% at 90% 10%, rgba(255,255,255,0.09), transparent 50%),
                radial-gradient(ellipse 60% 50% at 10% 90%, rgba(255,255,255,0.05), transparent 45%),
                radial-gradient(ellipse 50% 40% at 40% 40%, rgba(107,26,48,0.35), transparent 55%)
              `,
            }}
          />

          {/* Vibo icon watermark */}
          <div className="absolute top-1/2 start-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] sm:w-[400px] opacity-[0.03]">
            <img src="/images/vibo-icon-cream.png" alt="" className="w-full h-full object-contain" />
          </div>

          <div className="relative z-10 px-8 sm:px-12 lg:px-20 py-20 sm:py-28 lg:py-32 text-center">
            <motion.h2
              className="text-[clamp(1.8rem,4.5vw,3.5rem)] font-bold leading-[1.08] tracking-[-0.035em] text-white mb-5"
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              {t.cta.heading}
            </motion.h2>

            <motion.p
              className="text-white/40 text-sm sm:text-base max-w-lg mx-auto mb-10 leading-relaxed"
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.12 }}
            >
              {t.cta.subtitle}
            </motion.p>

            <motion.div
              className="flex flex-col sm:flex-row items-center justify-center gap-3"
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.24 }}
            >
              <a
                href="#"
                className="inline-flex items-center gap-2.5 bg-white text-vibo-primary px-7 py-3.5 rounded-full text-[0.85rem] font-semibold hover:bg-white/90 transition-all duration-300 hover:scale-[1.03] active:scale-[0.98]"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                </svg>
                {t.cta.appStore}
              </a>
              <a
                href="#"
                className="inline-flex items-center gap-2.5 bg-white/10 text-white px-7 py-3.5 rounded-full text-[0.85rem] font-semibold hover:bg-white/[0.15] transition-all duration-300 hover:scale-[1.03] active:scale-[0.98] border border-white/10"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.199l2.807 1.626a1 1 0 010 1.732l-2.807 1.627L15.206 12l2.492-2.492zM5.864 2.658L16.8 8.99l-2.302 2.302-8.634-8.634z" />
                </svg>
                {t.cta.googlePlay}
              </a>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
