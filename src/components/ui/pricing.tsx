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
  users: string[];
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

function UsersRow({ names, tone }: { names: string[]; tone: keyof typeof toneClasses }) {
  const peopleByTone = {
    blue: [
      {
        name: "Donald Trump",
        src: "https://upload.wikimedia.org/wikipedia/commons/5/56/Donald_Trump_official_portrait.jpg",
      },
      { name: "Joe Biden", src: "https://upload.wikimedia.org/wikipedia/commons/6/68/Joe_Biden_presidential_portrait.jpg" },
      { name: "Barack Obama", src: "https://upload.wikimedia.org/wikipedia/commons/8/8d/President_Barack_Obama.jpg" },
      { name: "Kamala Harris", src: "https://upload.wikimedia.org/wikipedia/commons/4/41/Kamala_Harris_Vice_Presidential_Portrait.jpg" },
      { name: "Emmanuel Macron", src: "https://www.ardahanhaber.com.tr/images/haberler/2025/07/68831b92537f4_fransa-cumhurbaskani-macron-filistin-devletini-taniyacagiz.webp" },
    ],
    gold: [
      { name: "Sirati", src: "https://sirati.bh/assets/images/sirati-main.png", href: "https://sirati.bh/" },
      { name: "Apple", src: "https://upload.wikimedia.org/wikipedia/commons/f/fa/Apple_logo_black.svg" },
      { name: "Nike", src: "https://upload.wikimedia.org/wikipedia/commons/a/a6/Logo_NIKE.svg" },
      { name: "NVIDIA", src: "https://upload.wikimedia.org/wikipedia/sco/2/21/Nvidia_logo.svg" },
      { name: "GitHub", src: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png" },
    ],
    silver: [
      {
        name: "White House USA",
        src: "https://upload.wikimedia.org/wikipedia/commons/4/4f/The_White_House_logo_under_Trump_2.0.jpg",
      },
      { name: "US State Department", src: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/Flag_of_the_United_States_Department_of_State.svg/250px-Flag_of_the_United_States_Department_of_State.svg.png" },
      { name: "US Department of Justice", src: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/Seal_of_the_United_States_Department_of_Justice.svg/1280px-Seal_of_the_United_States_Department_of_Justice.svg.png" },
      { name: "NASA", src: "https://upload.wikimedia.org/wikipedia/commons/e/e5/NASA_logo.svg" },
      { name: "US Department of the Treasury", src: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/Seal_of_the_United_States_Department_of_the_Treasury.svg/1280px-Seal_of_the_United_States_Department_of_the_Treasury.svg.png" },
    ],
  } as const;

  if (tone === "blue") {
    return (
      <div className="mt-5 flex items-center gap-2">
        {peopleByTone.blue.map((person) => (
          <div key={person.name} className="inline-flex items-center rounded-full border border-[#40B4FF]/35 bg-white/85 p-1.5">
            <span className="h-12 w-12 overflow-hidden rounded-full">
              <img src={person.src} alt={person.name} className="h-full w-full object-cover" loading="lazy" />
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (tone === "silver") {
    return (
      <div className="mt-5 flex items-center gap-2">
        {peopleByTone.silver.map((person) => (
          <div key={person.name} className="inline-flex items-center rounded-full border border-neutral-400/45 bg-white/85 p-1.5">
            <span className="h-12 w-12 overflow-hidden rounded-full">
              <img src={person.src} alt={person.name} className="h-full w-full object-cover" loading="lazy" />
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-5 flex items-center gap-2">
      {peopleByTone.gold.map((person) =>
        person.href ? (
          <a
            key={person.name}
            href={person.href}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex items-center rounded-full border border-vibo-gold/35 bg-white/85 p-1.5"
            aria-label={`${person.name} logo`}
          >
            <span className="h-12 w-12 overflow-hidden rounded-full ring-2 ring-vibo-gold/35">
            <img src={person.src} alt={person.name} className="h-full w-full object-cover" loading="lazy" />
            </span>
          </a>
        ) : (
          <div key={person.name} className="inline-flex items-center rounded-full border border-vibo-gold/35 bg-white/85 p-1.5">
            <span className="h-12 w-12 overflow-hidden rounded-full">
              <img src={person.src} alt={person.name} className="h-full w-full object-cover" loading="lazy" />
            </span>
          </div>
        ),
      )}
    </div>
  );
}

function UserTypeCard({
  title,
  description,
  cta,
  features,
  users,
  label,
  tone,
  siteOrigin,
}: {
  title: string;
  description: string;
  cta: string;
  features: string[];
  users: string[];
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

        <UsersRow names={users} tone={tone} />

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
          users={copy.individuals.users}
          label={copy.individualsLabel}
          tone="blue"
          siteOrigin={siteOrigin}
        />
        <UserTypeCard
          title={copy.business.title}
          description={copy.business.description}
          cta={copy.business.cta}
          features={copy.business.features}
          users={copy.business.users}
          label={copy.businessLabel}
          tone="gold"
          siteOrigin={siteOrigin}
        />
        <UserTypeCard
          title={copy.government.title}
          description={copy.government.description}
          cta={copy.government.cta}
          features={copy.government.features}
          users={copy.government.users}
          label={copy.governmentLabel}
          tone="silver"
          siteOrigin={siteOrigin}
        />
      </div>
    </section>
  );
}
