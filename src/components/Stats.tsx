"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";

interface StatsProps {
  t: any;
}

export default function Stats({ t }: StatsProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="bg-white">
      <div ref={ref} className="max-w-[1400px] mx-auto section-padding py-20 sm:py-28">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-y-12 gap-x-8">
          {t.stats.map((stat: any, i: number) => (
            <motion.div
              key={i}
              className="relative"
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{
                duration: 0.6,
                delay: i * 0.1,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <div className="text-[clamp(2.2rem,5vw,4rem)] font-bold tracking-[-0.04em] text-neutral-900 leading-none mb-2">
                {stat.value}
              </div>
              <div className="text-sm text-neutral-400 leading-relaxed max-w-[180px]">
                {stat.label}
              </div>
              {i < t.stats.length - 1 && (
                <div className="hidden lg:block absolute top-0 end-0 w-px h-full bg-neutral-100" />
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
