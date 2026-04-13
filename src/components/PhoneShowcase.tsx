"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import LazyVideo from "@/components/LazyVideo";
import { videoUrl } from "@/lib/videoUrls";

interface PhoneShowcaseProps {
  t: any;
}

export default function PhoneShowcase({ t }: PhoneShowcaseProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="relative bg-transparent overflow-hidden">
      <div ref={ref} className="max-w-[1400px] mx-auto section-padding py-24 sm:py-32 lg:py-40">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-20 items-center">
          <div>
            <motion.p
              className="text-vibo-primary text-xs uppercase tracking-[0.15em] font-medium mb-3"
              initial={{ opacity: 0, y: 16 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5 }}
            >
              {t.phone.label}
            </motion.p>
            <motion.h2
              className="text-[clamp(1.6rem,3vw,2.8rem)] font-bold tracking-[-0.03em] text-neutral-900 leading-[1.1] mb-6"
              initial={{ opacity: 0, y: 24 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              {t.phone.heading}
            </motion.h2>
            <motion.p
              className="text-neutral-400 text-sm sm:text-base leading-[1.75] mb-10 max-w-lg"
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              {t.phone.description}
            </motion.p>

            <motion.div
              className="flex flex-wrap gap-2.5"
              initial={{ opacity: 0, y: 16 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              {t.phone.features.map((feat: string, i: number) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 bg-vibo-cream/80 text-vibo-primary px-4 py-2 rounded-full text-xs font-medium border border-vibo-gold/35 hover:bg-vibo-cream hover:text-vibo-primary-dark transition-colors duration-300"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-vibo-gold" />
                  {feat}
                </span>
              ))}
            </motion.div>
          </div>

          <div className="relative flex justify-center">
            <div className="relative w-[260px] sm:w-[280px] lg:w-[300px]">
              <div className="relative rounded-[40px] border border-vibo-gold/35 bg-vibo-primary-dark p-3 shadow-2xl shadow-vibo-primary/35">
                <div className="absolute top-0 inset-x-0 flex justify-center z-20">
                  <div className="w-[120px] h-[28px] rounded-b-2xl bg-vibo-primary-dark" />
                </div>
                <div className="relative rounded-[30px] overflow-hidden aspect-[9/19.5] bg-black">
                  <LazyVideo
                    src={videoUrl("/videos/vid5.mp4")}
                    className="absolute inset-0 w-full h-full"
                    videoClassName="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 flex flex-col justify-between p-4 pointer-events-none">
                    <div className="flex items-center justify-between pt-6">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-7 w-7 rounded-full border border-white/25 bg-center bg-cover"
                          style={{
                            backgroundImage:
                              "url('https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&h=80&fit=crop&crop=face')",
                          }}
                        />
                        <div>
                          <div className="w-14 h-2 bg-white/30 rounded-full" />
                          <div className="w-8 h-1.5 bg-white/15 rounded-full mt-1" />
                        </div>
                      </div>
                      <div className="bg-vibo-primary text-white text-[8px] font-bold px-3 py-1 rounded-full">
                        Follow
                      </div>
                    </div>

                    <div>
                      <div className="flex flex-col items-end gap-3 mb-4">
                        <div className="flex flex-col items-center gap-0.5">
                          <div className="w-8 h-8 rounded-full bg-white/35 flex items-center justify-center">
                            <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                            </svg>
                          </div>
                          <span className="text-white text-[8px]">24.3k</span>
                        </div>
                        <div className="flex flex-col items-center gap-0.5">
                          <div className="w-8 h-8 rounded-full bg-white/35 flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                            </svg>
                          </div>
                          <span className="text-white text-[8px]">1.2k</span>
                        </div>
                        <div className="flex flex-col items-center gap-0.5">
                          <div className="w-8 h-8 rounded-full bg-white/35 flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                            </svg>
                          </div>
                          <span className="text-white text-[8px]">892</span>
                        </div>
                      </div>
                      <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                        <div className="w-1/3 h-full bg-white/40 rounded-full" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <motion.div
              className="absolute -top-4 -start-4 sm:start-4 rounded-2xl border border-vibo-gold/30 bg-vibo-cream px-4 py-3 shadow-lg shadow-vibo-primary/15"
              initial={{ opacity: 0, x: -20 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-full bg-vibo-primary flex items-center justify-center">
                  <svg className="w-4 h-4 text-vibo-gold" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                  </svg>
                </div>
                <div>
                  <div className="text-vibo-primary text-xs font-semibold">+2.4M</div>
                  <div className="text-vibo-primary/65 text-[10px]">Likes today</div>
                </div>
              </div>
            </motion.div>

            <motion.div
              className="absolute -bottom-2 -end-4 sm:end-4 rounded-2xl border border-vibo-gold/30 bg-vibo-cream px-4 py-3 shadow-lg shadow-vibo-primary/15"
              initial={{ opacity: 0, x: 20 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.5 }}
            >
              <div className="flex items-center gap-2.5">
                <div className="flex -space-x-2 rtl:space-x-reverse">
                  {[
                    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=64&h=64&fit=crop&crop=face",
                    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=64&h=64&fit=crop&crop=face",
                    "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=64&h=64&fit=crop&crop=face",
                  ].map((avatarUrl, j) => (
                    <div
                      key={j}
                      className="h-7 w-7 rounded-full border-2 border-vibo-cream bg-cover bg-center"
                      style={{ backgroundImage: `url('${avatarUrl}')` }}
                    />
                  ))}
                </div>
                <div>
                  <div className="text-vibo-primary text-xs font-semibold">Active now</div>
                  <div className="text-vibo-primary/65 text-[10px]">12.8k online</div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
