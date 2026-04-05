"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getTranslations, isRTL } from "@/i18n";
import { useViboLang } from "@/i18n/useViboLang";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import HelpSearchBar from "@/components/help/HelpSearchBar";
import HelpCategoryCard from "@/components/help/HelpCategoryCard";
import HelpChatWidget from "@/components/help/HelpChatWidget";
import { categories, type HelpArticle } from "@/data/helpArticles";

const SITE_ORIGIN = "https://joinvibo.com";

export default function HelpPage() {
  const { lang, switchLang } = useViboLang();
  const t = getTranslations(lang);
  const rtl = isRTL(lang);
  const router = useRouter();

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = rtl ? "rtl" : "ltr";
    document.body.classList.toggle("font-ar", rtl);
    document.body.classList.toggle("font-en", !rtl);
  }, [lang, rtl]);

  const th = (t as any).help ?? {};

  const handleCategoryClick = useCallback(
    (slug: string) => {
      router.push(`/help/${slug}`);
    },
    [router],
  );

  const handleSearchSelect = useCallback(
    (article: HelpArticle) => {
      router.push(`/help/${article.category}/${article.id}`);
    },
    [router],
  );

  return (
    <div className="min-h-screen bg-[#fdfcf9] flex flex-col" dir={rtl ? "rtl" : "ltr"}>
      <Navbar t={t} lang={lang} onSwitchLang={switchLang} siteOrigin={SITE_ORIGIN} />

      {/* Hero */}
      <section className="relative overflow-hidden pt-32 pb-16 sm:pt-40 sm:pb-20 px-4">
        <div className="absolute inset-0 bg-gradient-to-b from-vibo-rose/40 to-transparent pointer-events-none" />
        <div className="relative max-w-3xl mx-auto text-center space-y-6">
          <h1 className="text-3xl sm:text-5xl font-bold text-neutral-900 tracking-tight">
            {th.heroTitle || "How can we help you?"}
          </h1>
          <p className="text-neutral-600 text-base sm:text-lg max-w-xl mx-auto">
            {th.heroSubtitle || "Search for topics or browse categories below."}
          </p>
          <HelpSearchBar
            lang={lang}
            placeholder={th.searchPlaceholder || "Search help articles..."}
            onSelectArticle={handleSearchSelect}
          />
        </div>
      </section>

      {/* Categories grid */}
      <section className="flex-1 px-4 pb-20 max-w-5xl mx-auto w-full">
        <h2 className="text-xl font-semibold text-neutral-800 mb-6 text-center">
          {th.categoriesHeading || "Browse by topic"}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {categories.map((cat) => (
            <HelpCategoryCard
              key={cat.slug}
              category={cat}
              lang={lang}
              onClick={handleCategoryClick}
            />
          ))}
        </div>
      </section>

      <Footer t={t} lang={lang} onSwitchLang={switchLang} siteOrigin={SITE_ORIGIN} />

      <HelpChatWidget
        lang={lang}
        labels={{
          title: th.chatTitle || "Vibo Help Assistant",
          greeting:
            th.chatGreeting ||
            "Hi! I'm Vibo's help assistant. Ask me anything about using Vibo.",
          placeholder: th.chatPlaceholder || "Type your question...",
          errorRetry:
            th.chatError ||
            "Sorry, something went wrong. Please try again.",
        }}
      />
    </div>
  );
}
