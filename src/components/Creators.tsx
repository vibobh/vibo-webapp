"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import LazyVideo from "@/components/LazyVideo";

interface CreatorsProps {
  t: any;
}

const creators = [
  { name: "Sara", handle: "@sara.creates", followers: "1.2M", gradient: "from-pink-400 to-rose-500", video: "/videos/vid1.mp4" },
  { name: "Ahmed", handle: "@ahmedvisuals", followers: "890K", gradient: "from-blue-400 to-indigo-500", video: "/videos/vid2.mp4" },
  { name: "Lina", handle: "@lina.vibes", followers: "2.1M", gradient: "from-amber-400 to-orange-500", video: "/videos/vid3.mp4" },
  { name: "Omar", handle: "@omar.world", followers: "650K", gradient: "from-emerald-400 to-teal-500", video: "/videos/vid4.mp4" },
  { name: "Nora", handle: "@nora.daily", followers: "1.8M", gradient: "from-purple-400 to-violet-500", video: "/videos/vid5.mp4" },
];

export default function Creators({ t }: CreatorsProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <section className="bg-transparent overflow-hidden">
      <div ref={ref} className="max-w-[1400px] mx-auto section-padding pt-20 sm:pt-28 pb-6">
        <motion.p
          className="text-xs uppercase tracking-[0.15em] text-vibo-primary font-medium mb-3"
          initial={{ opacity: 0, y: 16 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          {t.creators.label}
        </motion.p>
        <motion.h2
          className="text-[clamp(1.6rem,3vw,2.6rem)] font-bold tracking-[-0.03em] text-neutral-900 mb-4 leading-[1.1] max-w-lg"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          {t.creators.heading}
        </motion.h2>
        <motion.p
          className="text-neutral-400 text-sm sm:text-base mb-12 max-w-md"
          initial={{ opacity: 0, y: 16 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          {t.creators.description}
        </motion.p>
      </div>

      {/* Horizontal scroll of creator cards */}
      <div className="pb-20 sm:pb-28">
        <div className="flex gap-4 sm:gap-5 px-6 sm:px-8 lg:px-12 xl:px-16 overflow-x-auto no-scrollbar">
          {creators.map((creator, i) => (
            <motion.div
              key={i}
              className="flex-shrink-0 w-[220px] sm:w-[260px] group"
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{
                duration: 0.6,
                delay: 0.2 + i * 0.08,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              {/* Video card */}
              <div className="relative aspect-[3/4] rounded-[20px] overflow-hidden mb-4">
                <LazyVideo
                  src={creator.video}
                  className="absolute inset-0"
                  videoClassName="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
                <div className="absolute top-3 end-3 bg-black/50 rounded-full px-2.5 py-1 flex items-center gap-1">
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                  <span className="text-white text-[10px] font-semibold">{creator.followers}</span>
                </div>
                {/* Bottom info */}
                <div className="absolute bottom-3 start-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${creator.gradient} flex-shrink-0`} />
                    <div>
                      <div className="text-white text-sm font-semibold leading-tight">{creator.name}</div>
                      <div className="text-white/60 text-[10px]">{creator.handle}</div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
