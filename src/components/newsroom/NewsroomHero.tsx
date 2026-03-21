"use client";

import Link from "next/link";
import type { NewsArticle } from "@/types/news";
import type { Lang } from "@/i18n";
import { encodeArticleForSearchParam } from "@/lib/newsArticleUrl";
import NewsImageFallback from "@/components/newsroom/NewsImageFallback";

type Props = {
  article: NewsArticle | null;
  readMore: string;
  lang: Lang;
};

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

export default function NewsroomHero({ article, readMore, lang }: Props) {
  if (!article) return null;

  const locale = typeof document !== "undefined" ? document.documentElement.lang || "en" : "en";
  const articleHref = `/newsroom/article?d=${encodeURIComponent(encodeArticleForSearchParam(article))}&lang=${lang}`;

  return (
    <section className="mb-10 sm:mb-14 lg:mb-16">
      <div className="flex flex-col lg:flex-row lg:items-stretch lg:gap-0 rounded-2xl lg:rounded-3xl overflow-hidden bg-neutral-100 shadow-sm border border-neutral-100/80">
        <div className="relative w-full lg:w-[58%] min-h-[220px] sm:min-h-[280px] lg:min-h-[360px] bg-neutral-200">
          {article.urlToImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={article.urlToImage}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              loading="eager"
            />
          ) : (
            <NewsImageFallback
              className="absolute inset-0 p-6 sm:p-10"
              logoClassName="max-h-[48%] max-w-[48%] min-h-[56px] sm:min-h-[72px]"
            />
          )}
        </div>
        <div className="relative z-[1] w-full lg:w-[42%] flex flex-col justify-center bg-white p-6 sm:p-8 lg:p-10 lg:-ms-6 lg:rounded-2xl lg:shadow-xl lg:border lg:border-neutral-100">
          <p className="text-[0.75rem] sm:text-[0.8rem] text-neutral-400 mb-3">
            {formatDate(article.publishedAt, locale)}
            <span className="mx-2">•</span>
            <span>{article.sourceName}</span>
          </p>
          <h1 className="text-[1.35rem] sm:text-[1.65rem] lg:text-[1.85rem] font-bold text-neutral-900 leading-[1.2] tracking-[-0.02em] mb-4">
            {article.title}
          </h1>
          <p className="text-[0.9rem] sm:text-[0.95rem] text-neutral-600 leading-relaxed line-clamp-4 mb-6">
            {article.description}
          </p>
          <Link
            href={articleHref}
            className="inline-flex items-center gap-2 text-[0.9rem] font-medium text-neutral-900 hover:text-vibo-primary transition-colors group"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 bg-neutral-50 group-hover:border-vibo-primary/30 group-hover:bg-vibo-primary/5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </span>
            {readMore}
          </Link>
        </div>
      </div>
    </section>
  );
}
