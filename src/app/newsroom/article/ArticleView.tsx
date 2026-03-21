"use client";

import { useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { decodeArticleFromSearchParam } from "@/lib/newsArticleUrl";
import NewsImageFallback from "@/components/newsroom/NewsImageFallback";
import { getTranslations, type Lang, isRTL } from "@/i18n";

function stripNewsApiTruncation(s: string) {
  return s.replace(/\s*\[\+?\d+\s*chars?\]\s*$/i, "").trim();
}

function formatDate(iso: string, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function ArticleView() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const d = searchParams.get("d");
  const article = useMemo(() => decodeArticleFromSearchParam(d), [d]);
  const rawLang = searchParams.get("lang");
  const lang: Lang = rawLang === "ar" ? "ar" : "en";
  const t = getTranslations(lang);
  const rtl = isRTL(lang);
  const na = t.newsroom.article;

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = rtl ? "rtl" : "ltr";
    document.body.classList.toggle("font-ar", rtl);
    document.body.classList.toggle("font-en", !rtl);
  }, [lang, rtl]);

  const switchLang = useCallback(() => {
    const next: Lang = lang === "en" ? "ar" : "en";
    const p = new URLSearchParams(searchParams.toString());
    p.set("lang", next);
    router.replace(`/newsroom/article?${p.toString()}`);
  }, [lang, router, searchParams]);

  const locale = lang === "ar" ? "ar" : "en";
  const bodyText = useMemo(() => {
    if (!article) return "";
    const raw = article.content?.trim()
      ? stripNewsApiTruncation(article.content!)
      : article.description;
    return raw.trim();
  }, [article]);

  const paragraphs = useMemo(() => {
    if (!bodyText) return [];
    const parts = bodyText.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
    return parts.length > 0 ? parts : [bodyText];
  }, [bodyText]);

  if (!article) {
    return (
      <div className="min-h-screen bg-white text-neutral-900">
        <Navbar t={t} lang={lang} onSwitchLang={switchLang} />
        <main className="relative z-[1] pt-[72px] lg:pt-[80px]">
          <div className="max-w-[720px] mx-auto section-padding py-16 text-center">
            <p className="text-neutral-600 mb-6">{na.notFound}</p>
            <Link
              href={`/newsroom?lang=${lang}`}
              className="inline-flex items-center justify-center rounded-full bg-neutral-900 text-white px-5 py-2.5 text-sm font-medium hover:bg-neutral-800 transition-colors"
            >
              {na.notFoundCta}
            </Link>
          </div>
        </main>
        <Footer t={t} lang={lang} onSwitchLang={switchLang} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <Navbar t={t} lang={lang} onSwitchLang={switchLang} />
      <main className="relative z-[1] pt-[72px] lg:pt-[80px]">
        <article className="max-w-[800px] mx-auto section-padding py-8 sm:py-12 lg:py-14">
          <Link
            href={`/newsroom?lang=${lang}`}
            className={`inline-flex items-center justify-center h-10 w-10 rounded-full border border-neutral-200 bg-white text-neutral-700 shadow-sm hover:border-vibo-primary/40 hover:text-vibo-primary transition-colors mb-8 ${
              rtl ? "rotate-180" : ""
            }`}
            aria-label={na.back}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>

          <p className="text-[0.8rem] text-neutral-400 mb-3">
            {formatDate(article.publishedAt, locale)}
            <span className="mx-2">•</span>
            <span>{article.sourceName}</span>
          </p>

          <h1 className="text-[1.65rem] sm:text-[2rem] lg:text-[2.25rem] font-bold text-neutral-900 leading-[1.15] tracking-[-0.03em] mb-8">
            {article.title}
          </h1>

          {article.urlToImage ? (
            <div className="rounded-2xl overflow-hidden bg-neutral-100 border border-neutral-100 mb-10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={article.urlToImage}
                alt=""
                className="w-full h-auto max-h-[420px] object-cover object-center"
                loading="eager"
              />
            </div>
          ) : (
            <div className="rounded-2xl overflow-hidden border border-neutral-100/80 mb-10 aspect-[21/9] max-h-[420px]">
              <NewsImageFallback
                className="h-full w-full min-h-[200px] p-8 sm:p-12"
                logoClassName="max-h-[45%] max-w-[45%] min-h-[64px]"
              />
            </div>
          )}

          <div className="space-y-4 text-[0.95rem] sm:text-[1rem] text-neutral-700 leading-relaxed">
            {paragraphs.map((p, i) => (
              <p key={i} className="whitespace-pre-wrap">
                {p}
              </p>
            ))}
          </div>

          <p className="mt-12 pt-8 border-t border-neutral-100">
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-vibo-primary hover:underline"
            >
              {na.readOriginal}
            </a>
          </p>
        </article>
      </main>
      <Footer t={t} lang={lang} onSwitchLang={switchLang} />
    </div>
  );
}
