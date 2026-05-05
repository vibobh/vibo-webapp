"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";

import { OnboardingForm } from "@/components/auth/OnboardingForm";
import { BackgroundPaths } from "@/components/ui/background-paths";
import { getTranslations, isRTL } from "@/i18n";
import type { Lang } from "@/i18n";
import { useViboLang } from "@/i18n/useViboLang";
import { useViboAuth } from "@/lib/auth/AuthProvider";

export function OnboardingPageClient({ initialUrlLang, preview = false }: { initialUrlLang?: Lang; preview?: boolean }) {
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
    if (preview) return;
    if (!isLoading && !user) {
      router.replace(`/login?lang=${lang}`);
    }
  }, [isLoading, user, router, lang, preview]);

  useEffect(() => {
    if (preview) return;
    if (!isLoading && user?.onboardingCompleted) {
      router.replace(`/?lang=${lang}`);
    }
  }, [isLoading, user, router, lang, preview]);

  if (!preview && (isLoading || !user || user.onboardingCompleted)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fdfcf9]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-vibo-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <main
      lang={lang}
      dir={rtl ? "rtl" : "ltr"}
      className={`relative flex min-h-screen items-center justify-center bg-[#fdfcf9] ${rtl ? "font-ar" : "font-en"}`}
      style={{ fontFamily: rtl ? "var(--font-arabic), Tahoma, sans-serif" : "var(--font-en), system-ui, -apple-system, sans-serif" }}
    >
      {preview && <BackgroundPaths />}
      <div className="absolute end-6 top-5 z-20 flex items-center justify-end">
        <button
          type="button"
          onClick={switchLang}
          className="text-sm text-neutral-500 transition-colors hover:text-neutral-800"
          aria-label={t.footer.switchLang}
        >
          {t.footer.switchLang}
        </button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto w-full max-w-xl px-5 py-8 sm:px-6"
      >
        <div
          className="rounded-[32px] border-2 border-vibo-primary/15 bg-white/90 p-6 shadow-[0_24px_70px_rgba(75,4,21,0.14)] backdrop-blur-[2px] sm:p-8"
          style={{ fontFamily: rtl ? "var(--font-arabic), Tahoma, sans-serif" : "var(--font-en), system-ui, -apple-system, sans-serif" }}
        >
          <div className="mb-6 flex justify-center">
            <Image src="/images/vibo-icon-maroon.png" alt={t.login.brand} width={56} height={56} className="h-14 w-auto" />
          </div>
          <OnboardingForm t={t} lang={lang} previewMode={preview} />
        </div>
      </motion.div>
    </main>
  );
}
