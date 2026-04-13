"use client";

import { useEffect, useMemo, useState } from "react";
import type { Lang } from "@/i18n";
import type { NewsArticle } from "@/types/news";

function listCacheKey(items: NewsArticle[]): string {
  return [...items]
    .map((a) => `${a.url}::${a.publishedAt}`)
    .sort()
    .join("\n")
    .slice(0, 3500);
}

/** Title/description overrides for newsroom cards & hero when `lang === "ar"`. */
export function useNewsListAutoAr(articles: NewsArticle[], lang: Lang) {
  const [byUrl, setByUrl] = useState<Record<string, { title?: string; description?: string }>>({});

  useEffect(() => {
    if (lang !== "ar" || articles.length === 0) {
      setByUrl({});
      return;
    }

    const ck = `vibo_news_list_${listCacheKey(articles)}`;
    try {
      const raw = sessionStorage.getItem(ck);
      if (raw) {
        setByUrl(JSON.parse(raw) as typeof byUrl);
        return;
      }
    } catch {
      /* ignore */
    }

    const items = articles.map((a) => ({
      url: a.url,
      publishedAt: a.publishedAt,
      title: a.title,
      description: a.description,
    }));

    let cancelled = false;
    fetch("/api/translate/news-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    })
      .then((r) => r.json())
      .then(
        (d: {
          ok?: boolean;
          items?: { url: string; titleAr?: string; descriptionAr?: string }[];
        }) => {
          if (cancelled) return;
          if (d.ok !== true || !d.items?.length) {
            setByUrl({});
            return;
          }
          const map: Record<string, { title?: string; description?: string }> = {};
          for (const row of d.items) {
            map[row.url] = {
              title: row.titleAr?.trim() || undefined,
              description: row.descriptionAr?.trim() || undefined,
            };
          }
          setByUrl(map);
          try {
            sessionStorage.setItem(ck, JSON.stringify(map));
          } catch {
            /* ignore */
          }
        },
      )
      .catch(() => {
        if (!cancelled) setByUrl({});
      });

    return () => {
      cancelled = true;
    };
  }, [lang, articles]);

  const getTitle = (a: NewsArticle) => (lang === "ar" && byUrl[a.url]?.title ? byUrl[a.url]!.title! : a.title);
  const getDescription = (a: NewsArticle) =>
    lang === "ar" && byUrl[a.url]?.description ? byUrl[a.url]!.description! : a.description;

  return { getTitle, getDescription, hasAny: Object.keys(byUrl).length > 0 };
}

function stripNewsApiTruncation(s: string) {
  return s.replace(/\s*\[\+?\d+\s*chars?\]\s*$/i, "").trim();
}

/** Article page: Arabic title + body when LibreTranslate is configured. */
export function useNewsArticleAutoAr(
  article: NewsArticle | null,
  lang: Lang,
  bodyIsHtml: boolean,
  bodyTextEn: string,
) {
  const [extra, setExtra] = useState<{ titleAr?: string; bodyAr?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (lang !== "ar" || !article) {
      setExtra(null);
      setLoading(false);
      return;
    }

    const cacheKey = `vibo_news_art_${encodeURIComponent(article.url).slice(0, 400)}_${article.publishedAt}`;
    try {
      const raw = sessionStorage.getItem(cacheKey);
      if (raw) {
        setExtra(JSON.parse(raw) as typeof extra);
        return;
      }
    } catch {
      /* ignore */
    }

    let cancelled = false;
    setLoading(true);
    fetch("/api/translate/news-article", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: article.url,
        publishedAt: article.publishedAt,
        title: article.title,
        bodyForTranslate: bodyTextEn,
        needTitle: true,
        needBody: bodyTextEn.trim().length > 0,
        bodyFormat: bodyIsHtml ? "html" : "text",
      }),
    })
      .then((r) => r.json())
      .then(
        (d: { ok?: boolean; titleAr?: string; bodyAr?: string }) => {
          if (cancelled) return;
          if (d.ok === true && (d.titleAr?.trim() || d.bodyAr?.trim())) {
            const merged = {
              titleAr: d.titleAr?.trim() || undefined,
              bodyAr: d.bodyAr?.trim() || undefined,
            };
            setExtra(merged);
            try {
              sessionStorage.setItem(cacheKey, JSON.stringify(merged));
            } catch {
              /* ignore */
            }
          } else {
            setExtra(null);
          }
        },
      )
      .catch(() => {
        if (!cancelled) setExtra(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [lang, article?.url, article?.publishedAt, article?.title, bodyTextEn, bodyIsHtml]);

  const displayTitle = lang === "ar" && extra?.titleAr ? extra.titleAr : article?.title ?? "";
  const displayBodyText =
    lang === "ar" && extra?.bodyAr ? stripNewsApiTruncation(extra.bodyAr) : bodyTextEn;

  const usedAuto =
    lang === "ar" &&
    !!article &&
    !!extra &&
    (!!extra.titleAr || !!extra.bodyAr);

  return { displayTitle, displayBodyText, loading, usedAutoTranslation: usedAuto };
}
