"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import createGlobe from "cobe";
import { useReducedMotion } from "framer-motion";

export type WorldMarker = {
  id: string;
  location: [number, number];
  /** Highlight with gold (e.g. home market) */
  highlight?: boolean;
};

export type WorldGlobeProps = {
  markers?: WorldMarker[];
  className?: string;
  speed?: number;
};

/** Vibo theme: tailwind `vibo.primary` / `vibo.gold` */
const RGB_PRIMARY: [number, number, number] = [0.294, 0.016, 0.082]; // #4b0415
const RGB_GOLD: [number, number, number] = [0.769, 0.659, 0.486]; // #c4a87c

/** Slightly closer view; no user-controlled zoom */
const AUTO_SCALE = 1.18;

const DEFAULT_MARKERS: WorldMarker[] = [
  { id: "bh-manama", location: [26.2235, 50.5876], highlight: true },
  { id: "marker-ny", location: [40.7128, -74.006], highlight: false },
  { id: "marker-london", location: [51.5074, -0.1278], highlight: false },
  { id: "marker-tokyo", location: [35.6762, 139.6503], highlight: false },
  { id: "marker-paris", location: [48.8566, 2.3522], highlight: false },
  { id: "marker-sydney", location: [-33.8688, 151.2093], highlight: false },
  { id: "marker-singapore", location: [1.3521, 103.8198], highlight: false },
  { id: "marker-moscow", location: [55.7558, 37.6173], highlight: false },
  { id: "marker-saopaulo", location: [-23.5505, -46.6333], highlight: false },
];

export default function WorldGlobe({
  markers = DEFAULT_MARKERS,
  className = "",
  speed = 0.003,
}: WorldGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pointerInteracting = useRef<{ x: number; y: number } | null>(null);
  const dragOffset = useRef({ phi: 0, theta: 0 });
  const phiOffsetRef = useRef(0);
  const thetaOffsetRef = useRef(0);
  const isPausedRef = useRef(false);
  const [canvasSize, setCanvasSize] = useState(0);
  const reducesMotion = useReducedMotion();

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    pointerInteracting.current = { x: e.clientX, y: e.clientY };
    if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
    isPausedRef.current = true;
  }, []);

  const handlePointerUp = useCallback(() => {
    if (pointerInteracting.current !== null) {
      phiOffsetRef.current += dragOffset.current.phi;
      thetaOffsetRef.current += dragOffset.current.theta;
      dragOffset.current = { phi: 0, theta: 0 };
    }
    pointerInteracting.current = null;
    if (canvasRef.current) canvasRef.current.style.cursor = "grab";
    isPausedRef.current = false;
  }, []);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (pointerInteracting.current !== null) {
        dragOffset.current = {
          phi: (e.clientX - pointerInteracting.current.x) / 300,
          theta: (e.clientY - pointerInteracting.current.y) / 1000,
        };
      }
    };
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerup", handlePointerUp, { passive: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [handlePointerUp]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.offsetWidth;
      setCanvasSize(w > 0 ? Math.floor(w) : 0);
    });
    ro.observe(el);
    setCanvasSize(el.offsetWidth > 0 ? Math.floor(el.offsetWidth) : 0);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!canvasRef.current || canvasSize < 32) return;
    const canvas = canvasRef.current;
    let globe: ReturnType<typeof createGlobe> | null = null;
    let animationId = 0;
    let phi = 0;
    const spin = reducesMotion ? 0 : speed;

    const cobeMarkers = markers.map((m) => ({
      location: m.location,
      size: m.highlight ? 0.095 : 0.075,
      id: m.id,
      color: m.highlight ? RGB_GOLD : RGB_PRIMARY,
    }));

    globe = createGlobe(canvas, {
      devicePixelRatio: Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2),
      width: canvasSize,
      height: canvasSize,
      phi: 0,
      theta: 0.2,
      dark: 1,
      diffuse: 1.5,
      mapSamples: 16000,
      mapBrightness: 6,
      baseColor: [0.28, 0.24, 0.25],
      markerColor: RGB_PRIMARY,
      glowColor: [0.18, 0.08, 0.1],
      markerElevation: 0.02,
      markers: cobeMarkers,
      arcs: [],
      arcColor: RGB_GOLD,
      arcWidth: 0.5,
      arcHeight: 0.25,
      opacity: 0.92,
      scale: AUTO_SCALE,
    });

    function animate() {
      if (!isPausedRef.current) phi += spin;
      globe!.update({
        phi: phi + phiOffsetRef.current + dragOffset.current.phi,
        theta: 0.2 + thetaOffsetRef.current + dragOffset.current.theta,
        scale: AUTO_SCALE,
      });
      animationId = requestAnimationFrame(animate);
    }
    animate();
    const fadeTimer = window.setTimeout(() => {
      if (canvas) canvas.style.opacity = "1";
    }, 50);

    return () => {
      window.clearTimeout(fadeTimer);
      cancelAnimationFrame(animationId);
      globe?.destroy();
      canvas.style.opacity = "0";
    };
  }, [canvasSize, markers, reducesMotion, speed]);

  return (
    <div ref={wrapRef} className={`relative mx-auto aspect-square w-full max-w-[min(100%,520px)] select-none ${className}`}>
      <style>{`
        @keyframes world-globe-marker-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.15); opacity: 0.85; }
        }
      `}</style>
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerLeave={handlePointerUp}
        width={canvasSize}
        height={canvasSize}
        style={{
          width: "100%",
          height: "100%",
          cursor: "grab",
          opacity: 0,
          transition: "opacity 1s ease",
          borderRadius: "50%",
          touchAction: "none",
          display: "block",
        }}
      />
      <div
        className="pointer-events-none absolute right-2 top-2 z-10 flex items-center gap-1.5 rounded-full border border-vibo-gold/40 bg-white/90 px-2 py-1 text-[10px] font-medium text-vibo-primary shadow-sm sm:text-[11px]"
        aria-hidden
      >
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full bg-vibo-gold shadow-[0_0_8px_rgba(196,168,124,0.9)]"
          style={{ animation: "world-globe-marker-pulse 2.2s ease-in-out infinite" }}
        />
        Bahrain
      </div>
    </div>
  );
}
