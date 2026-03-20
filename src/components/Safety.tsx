"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";

interface SafetyProps {
  t: any;
}

const safetyFeatures = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
    color: "bg-emerald-50 text-emerald-700",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
      </svg>
    ),
    color: "bg-blue-50 text-blue-700",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    color: "bg-purple-50 text-purple-700",
  },
];

export default function Safety({ t }: SafetyProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="bg-neutral-50/50">
      <div ref={ref} className="max-w-[1400px] mx-auto section-padding py-20 sm:py-28">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Left — text */}
          <div>
            <motion.div
              className="inline-flex items-center gap-2 bg-white rounded-full px-4 py-2 shadow-sm border border-neutral-100 mb-6"
              initial={{ opacity: 0, y: 16 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5 }}
            >
              <svg className="w-4 h-4 text-vibo-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              <span className="text-xs font-medium text-neutral-600">{t.safety.badge}</span>
            </motion.div>

            <motion.h2
              className="text-[clamp(1.6rem,3vw,2.6rem)] font-bold tracking-[-0.03em] text-neutral-900 mb-5 leading-[1.1]"
              initial={{ opacity: 0, y: 24 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              {t.safety.heading}
            </motion.h2>

            <motion.p
              className="text-neutral-400 text-sm sm:text-base leading-[1.75] max-w-lg"
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              {t.safety.description}
            </motion.p>
          </div>

          {/* Right — feature cards */}
          <div className="space-y-4">
            {t.safety.features.map((feat: any, i: number) => (
              <motion.div
                key={i}
                className="flex items-start gap-4 bg-white rounded-2xl p-5 sm:p-6 border border-neutral-100 hover:shadow-lg hover:shadow-neutral-200/50 transition-all duration-300 group"
                initial={{ opacity: 0, x: 30 }}
                animate={isInView ? { opacity: 1, x: 0 } : {}}
                transition={{
                  duration: 0.5,
                  delay: 0.15 + i * 0.1,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <div className={`flex-shrink-0 w-10 h-10 rounded-xl ${safetyFeatures[i].color} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                  {safetyFeatures[i].icon}
                </div>
                <div>
                  <h4 className="text-neutral-900 text-sm font-semibold mb-1">{feat.title}</h4>
                  <p className="text-neutral-400 text-sm leading-relaxed">{feat.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
