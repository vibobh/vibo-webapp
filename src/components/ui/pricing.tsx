"use client";

import { Check, BadgeCheck } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type VerifiedUserType = {
  title: string;
  description: string;
  cta: string;
  features: string[];
};

type VerifiedUsersCopy = {
  heading: string;
  subtitle: string;
  individualsLabel: string;
  businessLabel: string;
  governmentLabel: string;
  individuals: VerifiedUserType;
  business: VerifiedUserType;
  government: VerifiedUserType;
};

type PricingProps = {
  copy: VerifiedUsersCopy;
  siteOrigin: string;
};

const toneClasses = {
  blue: {
    ring: "ring-[#40B4FF]/35",
    softBg: "bg-[#40B4FF]/8",
    badge: "text-[#40B4FF] border-[#40B4FF]/30 bg-[#40B4FF]/10",
    dot: "bg-[#40B4FF]",
    button: "border-[#40B4FF]/40 text-[#0f4a7a] hover:bg-[#40B4FF]/10",
  },
  gold: {
    ring: "ring-vibo-gold/35",
    softBg: "bg-vibo-gold/10",
    badge: "text-vibo-primary border-vibo-gold/35 bg-vibo-gold/15",
    dot: "bg-vibo-gold",
    button: "border-vibo-gold/40 text-vibo-primary hover:bg-vibo-gold/15",
  },
  silver: {
    ring: "ring-neutral-400/45",
    softBg: "bg-neutral-300/20",
    badge: "text-neutral-700 border-neutral-400/45 bg-neutral-200/35",
    dot: "bg-neutral-400",
    button: "border-neutral-400/60 text-neutral-700 hover:bg-neutral-200/45",
  },
} as const;

function UserTypeCard({
  title,
  description,
  cta,
  features,
  label,
  tone,
  siteOrigin,
}: {
  title: string;
  description: string;
  cta: string;
  features: string[];
  label: string;
  tone: keyof typeof toneClasses;
  siteOrigin: string;
}) {
  return (
    <Card className={`h-full rounded-2xl p-6 ring-1 ${toneClasses[tone].ring} ${toneClasses[tone].softBg}`}>
      <div className="flex h-full flex-col">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-neutral-300/70 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-700">
          <BadgeCheck className={`h-3.5 w-3.5 ${toneClasses[tone].dot.replace("bg-", "text-")}`} />
          {label}
        </div>

        <h3 className="mt-4 text-2xl font-bold tracking-tight text-neutral-900">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">{description}</p>

        <ul className="mt-5 space-y-2.5">
          {features.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-neutral-700">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-vibo-primary" strokeWidth={2.8} />
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <div className="mt-6">
          <Button asChild variant="outline" className={`w-full rounded-xl ${toneClasses[tone].button}`}>
            <Link href={`${siteOrigin}/`}>{cta}</Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default function Pricing({ copy, siteOrigin }: PricingProps) {
  return (
    <section id="creative" className="max-w-[1400px] mx-auto section-padding py-14 sm:py-20 scroll-mt-28">
      <div className="max-w-3xl text-left">
        <p className="text-[11px] uppercase tracking-[0.16em] text-vibo-primary font-semibold">
          {copy.heading}
        </p>
        <h2 className="mt-2 text-balance text-[clamp(1.6rem,3vw,2.45rem)] font-bold tracking-[-0.03em] text-neutral-900">
          {copy.subtitle}
        </h2>
      </div>

      <div className="mt-8 grid gap-5 md:mt-12 md:grid-cols-3">
        <UserTypeCard
          title={copy.individuals.title}
          description={copy.individuals.description}
          cta={copy.individuals.cta}
          features={copy.individuals.features}
          label={copy.individualsLabel}
          tone="blue"
          siteOrigin={siteOrigin}
        />
        <UserTypeCard
          title={copy.business.title}
          description={copy.business.description}
          cta={copy.business.cta}
          features={copy.business.features}
          label={copy.businessLabel}
          tone="gold"
          siteOrigin={siteOrigin}
        />
        <UserTypeCard
          title={copy.government.title}
          description={copy.government.description}
          cta={copy.government.cta}
          features={copy.government.features}
          label={copy.governmentLabel}
          tone="silver"
          siteOrigin={siteOrigin}
        />
      </div>
    </section>
  );
}
