"use client";

const row1 = ["Short Videos", "Live Streams", "Stories", "Direct Messages", "Explore", "Trending", "For You", "Creators"];
const row2 = ["Moments", "Reactions", "Duets", "Filters", "Effects", "Music", "Community", "Discover"];

function MarqueeRow({
  words,
  reverse = false,
  filled = false,
}: {
  words: string[];
  reverse?: boolean;
  filled?: boolean;
}) {
  const doubled = [...words, ...words];

  return (
    <div className="relative overflow-hidden whitespace-nowrap">
      <div
        className={`inline-flex will-change-transform ${
          reverse ? "animate-marquee-right" : "animate-marquee-left"
        }`}
      >
        {doubled.map((word, i) => (
          <span
            key={i}
            className={`inline-flex items-center text-[clamp(2rem,5.5vw,4.5rem)] font-bold tracking-[-0.04em] leading-none mx-2 sm:mx-4 ${
              filled
                ? "text-vibo-primary/[0.08]"
                : "text-transparent [-webkit-text-stroke:1.5px_rgba(75,4,21,0.12)]"
            }`}
          >
            {word}
            <span className="mx-2 sm:mx-4 text-vibo-primary/[0.12] text-[0.25em]">◆</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Marquee() {
  return (
    <section className="bg-transparent py-8 sm:py-12 overflow-hidden select-none">
      <MarqueeRow words={row1} />
      <div className="h-2 sm:h-3" />
      <MarqueeRow words={row2} reverse filled />
    </section>
  );
}
