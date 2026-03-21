"use client";

import type { NewsArticle } from "@/types/news";

type LayoutMode = "grid" | "list";

type Props = {
  article: NewsArticle;
  readMore: string;
  layout: LayoutMode;
};

function formatDate(iso: string, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function NewsroomCard({ article, readMore, layout }: Props) {
  const locale = typeof document !== "undefined" ? document.documentElement.lang || "en" : "en";

  if (layout === "list") {
    return (
      <article className="flex flex-col sm:flex-row gap-4 sm:gap-6 border-b border-neutral-100 pb-8 last:border-0 last:pb-0">
        <div className="relative w-full sm:w-[200px] lg:w-[240px] shrink-0 aspect-[16/10] sm:aspect-auto sm:h-[140px] rounded-xl overflow-hidden bg-neutral-100">
          {article.urlToImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={article.urlToImage}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center bg-neutral-200 text-neutral-400 text-xs">
              Vibo
            </div>
          )}
        </div>
        <div className="flex flex-col flex-1 min-w-0">
          <p className="text-[0.7rem] sm:text-[0.75rem] text-neutral-400 mb-2">
            {formatDate(article.publishedAt, locale)}
            <span className="mx-1.5">•</span>
            {article.sourceName}
          </p>
          <h2 className="text-base sm:text-lg font-bold text-neutral-900 leading-snug mb-2 line-clamp-2">
            {article.title}
          </h2>
          <p className="text-[0.85rem] text-neutral-600 line-clamp-2 mb-4 flex-1">{article.description}</p>
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-[0.85rem] font-medium text-neutral-900 hover:text-vibo-primary w-fit"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-neutral-200 bg-white">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </span>
            {readMore}
          </a>
        </div>
      </article>
    );
  }

  return (
    <article className="flex flex-col h-full">
      <div className="relative aspect-[16/10] rounded-xl overflow-hidden bg-neutral-100 mb-3">
        {article.urlToImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={article.urlToImage}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-neutral-200 text-neutral-400 text-xs">
            Vibo
          </div>
        )}
      </div>
      <p className="text-[0.7rem] sm:text-[0.75rem] text-neutral-400 mb-2">
        {formatDate(article.publishedAt, locale)}
        <span className="mx-1.5">•</span>
        {article.sourceName}
      </p>
      <h2 className="text-[0.95rem] sm:text-base font-bold text-neutral-900 leading-snug mb-2 line-clamp-3 flex-1">
        {article.title}
      </h2>
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-[0.8rem] font-medium text-neutral-900 hover:text-vibo-primary mt-auto pt-2"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-neutral-200 bg-white">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </span>
        {readMore}
      </a>
    </article>
  );
}
