"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { getTranslations, isRTL } from "@/i18n";
import { useViboLang } from "@/i18n/useViboLang";
import GradientBg from "@/components/GradientBg";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import NewsroomHero from "@/components/newsroom/NewsroomHero";
import NewsroomFilters from "@/components/newsroom/NewsroomFilters";
import NewsroomCard from "@/components/newsroom/NewsroomCard";
import type { NewsArticle, NewsTag } from "@/types/news";
import { useNewsListAutoAr } from "@/hooks/useNewsAutoTranslate";

export default function NewsroomPage() {
  const { lang, switchLang, ready } = useViboLang();
  const t = getTranslations(lang);
  const rtl = isRTL(lang);
  const nt = t.newsroom;

  const [tag, setTag] = useState<NewsTag>("all");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [mock, setMock] = useState(false);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = rtl ? "rtl" : "ltr";
    document.body.classList.toggle("font-ar", rtl);
    document.body.classList.toggle("font-en", !rtl);
  }, [lang, rtl]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    // Keep current cards visible while switching categories for smoother UX.
    setSwitching(hasLoadedOnce);
    if (!hasLoadedOnce) setLoading(true);
    fetch(`/api/news?tag=${encodeURIComponent(tag)}`)
      .then((res) => res.json())
      .then((data: { articles: NewsArticle[]; mock?: boolean }) => {
        if (cancelled) return;
        setArticles(data.articles || []);
        setMock(!!data.mock);
        setLoading(false);
        setHasLoadedOnce(true);
        setSwitching(false);
      })
      .catch(() => {
        if (cancelled) return;
        if (!hasLoadedOnce) setArticles([]);
        setLoading(false);
        setHasLoadedOnce(true);
        setSwitching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hasLoadedOnce, tag, ready]);

  const filterLabels: Record<NewsTag, string> = {
    all: nt.filters.all,
    community: nt.filters.community,
    company: nt.filters.company,
    news: nt.filters.news,
    product: nt.filters.product,
    safety: nt.filters.safety,
  };

  const featured = articles[0] ?? null;
  const rest = articles.slice(1);
  const newsAr = useNewsListAutoAr(articles, lang);

  return (
    <div key={lang} className="min-h-screen text-neutral-900">
      <GradientBg />
      <Navbar t={t} lang={lang} onSwitchLang={switchLang} />
      <main className="relative z-[1] pt-[72px] lg:pt-[80px]">
        <div className="max-w-[1200px] mx-auto section-padding py-10 sm:py-12 lg:py-14">
          <header className="mb-8 sm:mb-10">
            <h1 className="text-[1.75rem] sm:text-[2rem] font-bold tracking-[-0.03em] text-neutral-900">
              {nt.title}
            </h1>
            <p className="mt-2 text-[0.95rem] text-neutral-500 max-w-2xl">{nt.description}</p>
            {mock && (
              <p className="mt-3 text-[0.8rem] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 inline-block">
                {nt.mockHint}
              </p>
            )}
          </header>

          <div className="min-h-[620px]">
            <motion.div
              initial={{ opacity: 1, y: 0 }}
              animate={{ opacity: switching ? 0.93 : 1, y: switching ? 2 : 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              {featured && (
                <NewsroomHero
                  article={featured}
                  titleOverride={newsAr.getTitle(featured)}
                  descriptionOverride={newsAr.getDescription(featured)}
                  readMore={nt.readMore}
                  lang={lang}
                />
              )}

              <NewsroomFilters
                tag={tag}
                onTagChange={setTag}
                layout={layout}
                onLayoutChange={setLayout}
                labels={filterLabels}
                ariaGrid={nt.ariaGrid}
                ariaList={nt.ariaList}
              />

              {rest.length === 0 && !featured ? (
                <p className="text-center text-neutral-500 py-12">{nt.empty}</p>
              ) : rest.length > 0 && layout === "grid" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 lg:gap-10">
                  {rest.map((article, i) => (
                    <NewsroomCard
                      key={`${article.url}-${i}`}
                      article={article}
                      titleOverride={newsAr.getTitle(article)}
                      descriptionOverride={newsAr.getDescription(article)}
                      readMore={nt.readMore}
                      layout="grid"
                      lang={lang}
                    />
                  ))}
                </div>
              ) : rest.length > 0 ? (
                <div className="flex flex-col gap-8">
                  {rest.map((article, i) => (
                    <NewsroomCard
                      key={`${article.url}-${i}`}
                      article={article}
                      titleOverride={newsAr.getTitle(article)}
                      descriptionOverride={newsAr.getDescription(article)}
                      readMore={nt.readMore}
                      layout="list"
                      lang={lang}
                    />
                  ))}
                </div>
              ) : null}
            </motion.div>
          </div>
        </div>
      </main>
      <Footer t={t} lang={lang} onSwitchLang={switchLang} />
    </div>
  );
}
