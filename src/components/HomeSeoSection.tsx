"use client";

import type { Translations } from "@/i18n";

type Props = {
  t: Translations;
};

export default function HomeSeoSection({ t }: Props) {
  const s = t.home.seo;
  return (
    <section
      className="section-padding max-w-[1400px] mx-auto py-14 sm:py-20 border-t border-vibo-primary/10 bg-[#fdfcf9]/80"
      aria-labelledby="what-is-vibo-heading"
    >
      <div className="max-w-3xl mx-auto space-y-10 text-neutral-800">
        <div>
          <h2
            id="what-is-vibo-heading"
            className="text-[clamp(1.35rem,2.5vw,1.85rem)] font-bold tracking-tight text-neutral-900"
          >
            {s.whatHeading}
          </h2>
          <p className="mt-3 text-[15px] sm:text-base leading-relaxed text-neutral-600">{s.whatBody}</p>
        </div>
        <div>
          <h3 className="text-xl font-semibold text-neutral-900">{s.whyHeading}</h3>
          <p className="mt-3 text-[15px] sm:text-base leading-relaxed text-neutral-600">{s.whyBody}</p>
        </div>
        <div>
          <h3 className="text-xl font-semibold text-neutral-900">{s.featuresHeading}</h3>
          <ul className="mt-3 list-disc ps-5 space-y-2 text-[15px] sm:text-base leading-relaxed text-neutral-600">
            {s.features.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
