"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

import { OnboardingForm } from "@/components/auth/OnboardingForm";
import { getTranslations, isRTL } from "@/i18n";
import type { Lang } from "@/i18n";
import { useViboLang } from "@/i18n/useViboLang";
import { useViboAuth } from "@/lib/auth/AuthProvider";

export function OnboardingPageClient({ initialUrlLang }: { initialUrlLang?: Lang }) {
  const { lang, switchLang } = useViboLang({ initialUrlLang });
  const t = getTranslations(lang);
  const rtl = isRTL(lang);
  const router = useRouter();
  const { user, isLoading } = useViboAuth();

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = rtl ? "rtl" : "ltr";
    document.body.classList.toggle("font-ar", rtl);
    document.body.classList.toggle("font-en", !rtl);
  }, [lang, rtl]);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace(`/login?lang=${lang}`);
    }
  }, [isLoading, user, router, lang]);

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fdfcf9]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-vibo-primary border-t-transparent" />
      </div>
    );
  }

  const homeHref = `/?lang=${lang}`;

  return (
    <main lang={lang} dir={rtl ? "rtl" : "ltr"} className="min-h-screen bg-[#fdfcf9]">
      <div className="flex items-center justify-between px-6 py-5 sm:px-8">
        <Link href={homeHref} className="flex items-center gap-2">
          <Image
            src="/images/vibo-icon-maroon.png"
            alt=""
            width={32}
            height={32}
            className="h-8 w-auto"
          />
          <span className="text-lg font-semibold text-vibo-primary">{t.login.brand}</span>
        </Link>
        <button
          type="button"
          onClick={switchLang}
          className="text-sm text-neutral-500 transition-colors hover:text-neutral-800"
        >
          {t.footer.switchLang}
        </button>
      </div>

      <div className="mx-auto max-w-lg px-4 py-6 sm:px-6 sm:py-10">
        <OnboardingForm t={t} />
      </div>
    </main>
  );
}
