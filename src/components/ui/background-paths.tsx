"use client";

import { motion } from "framer-motion";

function FloatingPaths({ position }: { position: number }) {
  const paths = Array.from({ length: 34 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${
      380 - i * 5 * position
    } -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${
      152 - i * 5 * position
    } ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${
      684 - i * 5 * position
    } ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
    width: 0.5 + i * 0.03,
  }));

  return (
    <div className="pointer-events-none absolute inset-0">
      <svg className="h-full w-full text-vibo-primary/80" viewBox="0 0 696 316" fill="none" aria-hidden>
        {paths.map((path) => (
          <motion.path
            key={path.id}
            d={path.d}
            stroke="currentColor"
            strokeWidth={path.width}
            strokeOpacity={0.05 + path.id * 0.015}
            initial={{ pathLength: 0.35, opacity: 0.45 }}
            animate={{
              pathLength: 1,
              opacity: [0.18, 0.42, 0.18],
              pathOffset: [0, 1, 0],
            }}
            transition={{
              duration: 18 + path.id * 0.25,
              repeat: Number.POSITIVE_INFINITY,
              ease: "linear",
            }}
          />
        ))}
      </svg>
    </div>
  );
}

export function BackgroundPaths() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#fdfcf9] via-[#f9f4f5] to-[#fdfcf9]" />
      <FloatingPaths position={1} />
      <FloatingPaths position={-1} />
    </div>
  );
}

