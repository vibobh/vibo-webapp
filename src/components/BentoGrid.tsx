"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";

interface BentoGridProps {
  t: any;
}

const cardVariants = {
  hidden: { opacity: 0, y: 40, scale: 0.97 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.7,
      delay: i * 0.08,
      ease: [0.22, 1, 0.36, 1],
    },
  }),
};

function HeartIcon() {
  return (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

export default function BentoGrid({ t }: BentoGridProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });

  const features = t.bento;

  return (
    <section id="features" className="bg-transparent scroll-mt-24">
      <div ref={ref} className="max-w-[1400px] mx-auto section-padding py-16 sm:py-24">
        <motion.p
          className="text-xs uppercase tracking-[0.15em] text-vibo-primary font-medium mb-3"
          initial={{ opacity: 0, y: 16 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          {t.bentoLabel}
        </motion.p>
        <motion.h2
          className="text-[clamp(1.6rem,3vw,2.6rem)] font-bold tracking-[-0.03em] text-neutral-900 mb-12 sm:mb-16 max-w-xl leading-[1.1]"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          {t.bentoHeading}
        </motion.h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {/* Card 1 — Short Videos (large, 2 cols, with video) */}
          <motion.div
            className="sm:col-span-2 relative group rounded-[20px] overflow-hidden bg-vibo-primary min-h-[300px] sm:min-h-[360px] flex"
            custom={0}
            variants={cardVariants}
            initial="hidden"
            animate={isInView ? "visible" : "hidden"}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-vibo-primary via-vibo-primary to-vibo-primary-light" />
            {/* Lightweight placeholders (no extra video decoders) */}
            <div className="absolute top-6 end-6 flex gap-2 opacity-30 group-hover:opacity-50 transition-opacity duration-500">
              {[
                "from-amber-200/40 to-rose-300/30",
                "from-sky-200/40 to-violet-300/30",
                "from-emerald-200/40 to-teal-300/30",
              ].map((grad, n) => (
                <div
                  key={n}
                  className={`w-16 h-24 rounded-lg bg-gradient-to-br ${grad} ring-1 ring-white/10`}
                />
              ))}
            </div>
            {/* Animated play button */}
            <div className="absolute top-1/2 end-20 -translate-y-1/2 w-14 h-14 rounded-full bg-white/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
              <svg className="w-6 h-6 text-white/60 ms-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <div className="relative z-10 p-8 sm:p-10 flex flex-col justify-end">
              <p className="text-white/50 text-xs uppercase tracking-[0.12em] mb-2">{features[0].label}</p>
              <h3 className="text-white text-xl sm:text-2xl font-bold tracking-[-0.02em] leading-[1.15] max-w-sm">{features[0].heading}</h3>
            </div>
          </motion.div>

          {/* Card 2 — Stories (tall, with story circles) */}
          <motion.div
            className="relative group rounded-[20px] overflow-hidden bg-neutral-950 min-h-[300px] sm:min-h-[360px] p-8 flex flex-col justify-between"
            custom={1}
            variants={cardVariants}
            initial="hidden"
            animate={isInView ? "visible" : "hidden"}
          >
            {/* Story circles decoration */}
            <div className="flex gap-3 pt-2">
              {[0, 1, 2, 3].map((j) => (
                <div key={j} className="flex flex-col items-center gap-1.5">
                  <div
                    className="w-12 h-12 rounded-full p-[2px] group-hover:scale-105 transition-transform duration-500"
                    style={{
                      background: j === 0
                        ? "linear-gradient(135deg, #4b0415, #8b2252)"
                        : j === 1
                        ? "linear-gradient(135deg, #667eea, #764ba2)"
                        : j === 2
                        ? "linear-gradient(135deg, #f093fb, #f5576c)"
                        : "linear-gradient(135deg, #4facfe, #00f2fe)",
                    }}
                  >
                    <div className="w-full h-full rounded-full bg-neutral-950 p-[2px]">
                      <div
                        className="w-full h-full rounded-full"
                        style={{
                          background: ["linear-gradient(135deg,#ff6b6b,#ffa500)", "linear-gradient(135deg,#a8e6cf,#88d8b0)", "linear-gradient(135deg,#ffd93d,#ff6b6b)", "linear-gradient(135deg,#6c5ce7,#a29bfe)"][j],
                        }}
                      />
                    </div>
                  </div>
                  <div className="w-8 h-1 bg-white/10 rounded-full" />
                </div>
              ))}
            </div>
            <div className="relative z-10">
              <p className="text-white/40 text-xs uppercase tracking-[0.12em] mb-2">{features[1].label}</p>
              <h3 className="text-white text-lg sm:text-xl font-bold tracking-[-0.02em] leading-[1.2]">{features[1].heading}</h3>
            </div>
          </motion.div>

          {/* Card 3 — Messaging (warm bg, chat bubbles) */}
          <motion.div
            className="relative group rounded-[20px] overflow-hidden min-h-[260px] sm:min-h-[300px] p-8 flex flex-col justify-between"
            style={{ background: "linear-gradient(135deg, #f8f4f0 0%, #f0e8df 100%)" }}
            custom={2}
            variants={cardVariants}
            initial="hidden"
            animate={isInView ? "visible" : "hidden"}
          >
            {/* Chat bubble decoration */}
            <div className="space-y-2 pt-1">
              <div className="flex justify-end">
                <div className="bg-vibo-primary text-white text-[10px] px-3 py-1.5 rounded-2xl rounded-br-sm max-w-[140px]">
                  Hey! Did you see the new update? 🔥
                </div>
              </div>
              <div className="flex justify-start">
                <div className="bg-white text-neutral-600 text-[10px] px-3 py-1.5 rounded-2xl rounded-bl-sm max-w-[120px] shadow-sm">
                  Yes! Love the new filters ✨
                </div>
              </div>
              <div className="flex justify-end">
                <div className="bg-vibo-primary/80 text-white text-[10px] px-3 py-1.5 rounded-2xl rounded-br-sm max-w-[100px]">
                  Same! 😍
                </div>
              </div>
            </div>
            <div className="relative z-10 mt-4">
              <p className="text-vibo-primary/50 text-xs uppercase tracking-[0.12em] mb-2">{features[2].label}</p>
              <h3 className="text-neutral-900 text-lg sm:text-xl font-bold tracking-[-0.02em] leading-[1.2]">{features[2].heading}</h3>
            </div>
          </motion.div>

          {/* Card 4 — Explore (mint bg, trending tags) */}
          <motion.div
            className="relative group rounded-[20px] overflow-hidden min-h-[260px] sm:min-h-[300px] p-8 flex flex-col justify-between"
            style={{ background: "linear-gradient(135deg, #eef4f1 0%, #dfeee7 100%)" }}
            custom={3}
            variants={cardVariants}
            initial="hidden"
            animate={isInView ? "visible" : "hidden"}
          >
            {/* Trending tags decoration */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {["#trending", "#viral", "#fyp", "#vibo", "#creative", "#dance"].map((tag, idx) => (
                <span
                  key={idx}
                  className="text-[10px] font-medium bg-emerald-700/10 text-emerald-800/60 px-2.5 py-1 rounded-full group-hover:bg-emerald-700/15 transition-colors duration-300"
                >
                  {tag}
                </span>
              ))}
            </div>
            <div className="relative z-10 mt-4">
              <p className="text-emerald-700/50 text-xs uppercase tracking-[0.12em] mb-2">{features[3].label}</p>
              <h3 className="text-neutral-900 text-lg sm:text-xl font-bold tracking-[-0.02em] leading-[1.2]">{features[3].heading}</h3>
            </div>
          </motion.div>

          {/* Card 5 — For Every Creator (wide on sm) */}
          <motion.div
            className="sm:col-span-2 lg:col-span-1 relative group rounded-[20px] overflow-hidden bg-gradient-to-br from-neutral-100 to-neutral-50 min-h-[260px] sm:min-h-[300px] p-8 flex flex-col justify-between"
            custom={4}
            variants={cardVariants}
            initial="hidden"
            animate={isInView ? "visible" : "hidden"}
          >
            {/* Creator stats decoration */}
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center gap-3 group-hover:translate-x-1 transition-transform duration-500">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-400 to-red-500" />
                <div className="flex-1">
                  <div className="w-20 h-1.5 bg-neutral-200 rounded-full" />
                </div>
                <div className="flex items-center gap-0.5 text-neutral-400">
                  <HeartIcon />
                  <span className="text-[10px] font-medium">48.2k</span>
                </div>
              </div>
              <div className="flex items-center gap-3 group-hover:translate-x-1 transition-transform duration-500 delay-75">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500" />
                <div className="flex-1">
                  <div className="w-16 h-1.5 bg-neutral-200 rounded-full" />
                </div>
                <div className="flex items-center gap-0.5 text-neutral-400">
                  <HeartIcon />
                  <span className="text-[10px] font-medium">31.5k</span>
                </div>
              </div>
              <div className="flex items-center gap-3 group-hover:translate-x-1 transition-transform duration-500 delay-150">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500" />
                <div className="flex-1">
                  <div className="w-24 h-1.5 bg-neutral-200 rounded-full" />
                </div>
                <div className="flex items-center gap-0.5 text-neutral-400">
                  <HeartIcon />
                  <span className="text-[10px] font-medium">27.1k</span>
                </div>
              </div>
            </div>
            <div className="relative z-10 mt-4">
              <p className="text-neutral-400 text-xs uppercase tracking-[0.12em] mb-2">{features[4].label}</p>
              <h3 className="text-neutral-900 text-lg sm:text-xl font-bold tracking-[-0.02em] leading-[1.2]">{features[4].heading}</h3>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
