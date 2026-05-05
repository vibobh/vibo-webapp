"use client";

import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Globe } from "@/components/ui/icons";

import { isRTL, type Lang, type Translations } from "@/i18n";
import { SignInForm } from "@/components/auth/SignInForm";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { ViboAuthShowcase } from "@/components/auth/ViboAuthShowcase";

export interface ViboAuthPageProps {
  t: Translations;
  lang: Lang;
  onSwitchLang?: () => void;
  authMode: "login" | "signup";
}

export function ViboAuthPage({ t, lang, onSwitchLang, authMode }: ViboAuthPageProps) {
  const isSignUp = authMode === "signup";
  const rtl = isRTL(lang);
  const langQuery = `lang=${lang}`;
  const homeHref = `/?${langQuery}`;
  const loginHref = `/login?${langQuery}`;
  const signupHref = `/signup?${langQuery}`;

  return (
    <main
      lang={lang}
      dir={rtl ? "rtl" : "ltr"}
      className="min-h-screen bg-white lg:grid lg:grid-cols-2"
    >
      {/* ── Form column ── */}
      <section className="relative flex min-h-screen flex-col">
        {/* Language toggle – top end corner */}
        {onSwitchLang && (
          <button
            type="button"
            onClick={onSwitchLang}
            className="absolute end-5 top-5 z-10 flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-600 shadow-sm transition-colors hover:bg-neutral-50 hover:text-neutral-900"
          >
            <Globe className="h-3.5 w-3.5" />
            {t.footer.switchLang}
          </button>
        )}

        <div className="flex flex-1 flex-col justify-center px-6 py-12 sm:px-12 lg:px-16 xl:px-20">
          <div className="mx-auto w-full max-w-[380px]">
            {/* Logo */}
            <Link
              href={homeHref}
              className="mb-10 flex w-full justify-center transition-opacity hover:opacity-80"
            >
              <Image
                src="/images/vibo-icon-maroon.png"
                alt="Vibo"
                width={48}
                height={48}
                className="h-12 w-auto"
                priority
              />
            </Link>

            <AnimatePresence mode="wait">
              {!isSignUp ? (
                <motion.div
                  key="sign-in"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                >
                  <SignInForm t={t} lang={lang} signUpHref={signupHref} />
                </motion.div>
              ) : (
                <motion.div
                  key="sign-up"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                >
                  <SignUpForm t={t} lang={lang} signInHref={loginHref} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </section>

      {/* ── Showcase column ── */}
      <section className="relative hidden min-h-screen overflow-hidden bg-vibo-primary lg:block">
        <ViboAuthShowcase variant={isSignUp ? "reels" : "posts"} />
      </section>
    </main>
  );
}

