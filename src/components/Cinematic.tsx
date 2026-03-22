"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import LazyVideo from "@/components/LazyVideo";
import { videoUrl } from "@/lib/videoUrls";

interface CinematicProps {
  t: any;
}

export default function Cinematic({ t }: CinematicProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, { amount: 0.35 });

  return (
    <section className="relative h-[80vh] sm:h-screen w-full overflow-hidden">
      <div className="absolute inset-0">
        <LazyVideo
          src={videoUrl("/videos/vid3.mp4")}
          className="absolute inset-0 w-full h-full"
          videoClassName="w-full h-full object-cover scale-105"
        />
      </div>

      <div className="absolute inset-0 bg-black/45" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/20" />

      <div ref={ref} className="relative z-10 h-full flex items-center justify-center section-padding">
        <div className="text-center max-w-3xl">
          <motion.p
            className="text-white/40 text-xs sm:text-sm tracking-[0.2em] uppercase mb-4 sm:mb-6"
            initial={{ opacity: 0, y: 16 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
            transition={{ duration: 0.6 }}
          >
            {t.cinematic.label}
          </motion.p>
          <motion.h2
            className="text-white text-[clamp(2rem,5vw,4rem)] font-bold leading-[1.06] tracking-[-0.035em] mb-6 sm:mb-8"
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          >
            {t.cinematic.heading}
          </motion.h2>
          <motion.p
            className="text-white/50 text-sm sm:text-base max-w-lg mx-auto leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.6, delay: 0.25 }}
          >
            {t.cinematic.description}
          </motion.p>
        </div>
      </div>

      <div className="absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-white to-transparent" />
    </section>
  );
}
