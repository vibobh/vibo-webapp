"use client";

/**
 * Single composited layer (CSS gradients) instead of many large blur() divs — much cheaper to paint.
 */
export default function GradientBg() {
  return (
    <div
      className="fixed inset-0 pointer-events-none z-0"
      aria-hidden="true"
      style={{
        backgroundColor: "#fdfcf9",
        backgroundImage: `
          radial-gradient(ellipse 85% 55% at 90% 8%, rgba(196, 168, 124, 0.14), transparent 55%),
          radial-gradient(ellipse 70% 50% at 5% 35%, rgba(232, 213, 160, 0.12), transparent 50%),
          radial-gradient(ellipse 65% 45% at 92% 55%, rgba(212, 184, 150, 0.1), transparent 50%),
          radial-gradient(ellipse 75% 50% at 12% 88%, rgba(240, 228, 200, 0.16), transparent 55%),
          radial-gradient(ellipse 50% 40% at 48% 20%, rgba(75, 4, 21, 0.04), transparent 50%),
          radial-gradient(ellipse 45% 35% at 70% 70%, rgba(75, 4, 21, 0.03), transparent 50%),
          radial-gradient(ellipse 55% 45% at 50% 50%, rgba(255, 255, 255, 0.45), transparent 60%)
        `,
      }}
    >
      {/* Light grid — no blur */}
      <div
        className="absolute inset-0 opacity-[0.028]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(75,4,21,1) 1px, transparent 1px), linear-gradient(90deg, rgba(75,4,21,1) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
        }}
      />
    </div>
  );
}
