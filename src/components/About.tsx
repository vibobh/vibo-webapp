"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";

interface AboutProps {
  t: any;
}

export default function About({ t }: AboutProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section ref={ref} id="about" className="bg-transparent scroll-mt-24">
      <div className="max-w-[1100px] mx-auto section-padding py-28 sm:py-36 lg:py-44">
        <motion.p
          className="text-[clamp(1.4rem,3.2vw,2.8rem)] font-bold leading-[1.2] tracking-[-0.025em] text-neutral-800"
          initial={{ opacity: 0, y: 24 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          {t.about.statement}
        </motion.p>
      </div>
    </section>
  );
}
