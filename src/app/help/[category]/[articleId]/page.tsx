"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { getTranslations, isRTL } from "@/i18n";
import { useViboLang } from "@/i18n/useViboLang";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import HelpArticleView from "@/components/help/HelpArticleView";
import HelpChatWidget from "@/components/help/HelpChatWidget";
import { getArticleById, getCategoryBySlug } from "@/data/helpArticles";

const SITE_ORIGIN = "https://joinvibo.com";

export default function HelpArticlePage() {
  const params = useParams();
  const router = useRouter();
  const { lang, switchLang } = useViboLang();
  const t = getTranslations(lang);
  const rtl = isRTL(lang);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = rtl ? "rtl" : "ltr";
    document.body.classList.toggle("font-ar", rtl);
    document.body.classList.toggle("font-en", !rtl);
  }, [lang, rtl]);

  const categorySlug = params.category as string;
  const articleId = params.articleId as string;
  const article = getArticleById(articleId);
  const category = getCategoryBySlug(categorySlug);
  const th = (t as any).help ?? {};

  if (!article || !category) {
    return (
      <div className="min-h-screen bg-[#fdfcf9] flex flex-col" dir={rtl ? "rtl" : "ltr"}>
        <Navbar t={t} lang={lang} onSwitchLang={switchLang} siteOrigin={SITE_ORIGIN} />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-neutral-500">
            {th.notFound || "Article not found."}
          </p>
        </div>
        <Footer t={t} lang={lang} onSwitchLang={switchLang} siteOrigin={SITE_ORIGIN} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fdfcf9] flex flex-col" dir={rtl ? "rtl" : "ltr"}>
      <Navbar t={t} lang={lang} onSwitchLang={switchLang} siteOrigin={SITE_ORIGIN} />

      <main className="flex-1 pt-28 pb-20 px-4">
        <HelpArticleView
          article={article}
          category={category}
          lang={lang}
          onBack={() => router.push(`/help/${categorySlug}`)}
        />
      </main>

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
