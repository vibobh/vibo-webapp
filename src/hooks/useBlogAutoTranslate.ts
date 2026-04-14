"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Lang } from "@/i18n";
import type { BlogListItem, BlogPost } from "@/types/blog";
import { pickBlogBodyHtml, pickBlogExcerpt, pickBlogTitle } from "@/lib/blogLocale";

function listCacheKey(items: { slug: string; updatedAt: number }[]): string {
  return [...items]
    .map((x) => `${x.slug}:${x.updatedAt}`)
    .sort()
    .join("|");
}

/**
 * When `lang === "ar"` and manual Arabic fields are missing, fetches machine translation
 * (LibreTranslate if configured, else OpenRouter on the Next server — see `.env.example`).
 */
export type BlogTranslateIssue = "no_api_key" | "translate_error";

export function useBlogArticleAutoAr(post: BlogPost | null | undefined, lang: Lang) {
  const [extra, setExtra] = useState<{
    titleAr?: string;
    excerptAr?: string;
    bodyHtmlAr?: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [translateIssue, setTranslateIssue] = useState<BlogTranslateIssue | null>(null);

  useEffect(() => {
    if (lang !== "ar" || !post) {
      setExtra(null);
      setLoading(false);
      setTranslateIssue(null);
      return;
    }

    const needTitle = !post.titleAr?.trim();
    const needExcerpt = !post.excerptAr?.trim();
    const needBody = !post.bodyHtmlAr?.trim();
    if (!needTitle && !needExcerpt && !needBody) {
      setExtra(null);
      setTranslateIssue(null);
      return;
    }

    const cacheKey = `vibo_tr_article_${post.slug}_${post.updatedAt}`;
    try {
      const raw = sessionStorage.getItem(cacheKey);
      if (raw) {
        setExtra(JSON.parse(raw) as typeof extra);
        setTranslateIssue(null);
        return;
      }
    } catch {
      /* ignore */
    }

    let cancelled = false;
    setLoading(true);
    setTranslateIssue(null);
    fetch("/api/translate/blog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: post.slug,
        updatedAt: post.updatedAt,
        title: post.title,
        excerpt: post.excerpt,
        bodyHtml: post.bodyHtml,
        needTitle,
        needExcerpt,
        needBody,
      }),
    })
      .then((r) => r.json())
      .then(
        (d: {
          ok?: boolean;
          reason?: string;
          titleAr?: string;
          excerptAr?: string;
          bodyHtmlAr?: string;
        }) => {
          if (cancelled) return;
          if (d.ok === true) {
            const merged = {
              titleAr: d.titleAr?.trim() || undefined,
              excerptAr: d.excerptAr?.trim() || undefined,
              bodyHtmlAr: d.bodyHtmlAr?.trim() || undefined,
            };
            if (merged.titleAr || merged.excerptAr || merged.bodyHtmlAr) {
              setExtra(merged);
              setTranslateIssue(null);
              try {
                sessionStorage.setItem(cacheKey, JSON.stringify(merged));
              } catch {
                /* ignore */
              }
            } else {
              setExtra(null);
              setTranslateIssue(null);
            }
          } else {
            setExtra(null);
            if (d.reason === "no_api_key") setTranslateIssue("no_api_key");
            else setTranslateIssue("translate_error");
          }
        },
      )
      .catch(() => {
        if (!cancelled) {
          setExtra(null);
          setTranslateIssue("translate_error");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    lang,
    post?.slug,
    post?.updatedAt,
    post?.title,
    post?.excerpt,
    post?.bodyHtml,
    post?.titleAr,
    post?.excerptAr,
    post?.bodyHtmlAr,
  ]);

  const merged = useMemo((): BlogPost | null | undefined => {
    if (!post) return post;
    if (!extra) return post;
    return {
      ...post,
      titleAr: post.titleAr?.trim() || extra.titleAr || post.titleAr,
      excerptAr: post.excerptAr?.trim() || extra.excerptAr || post.excerptAr,
      bodyHtmlAr: post.bodyHtmlAr?.trim() || extra.bodyHtmlAr || post.bodyHtmlAr,
    };
  }, [post, extra]);

  const usedAuto =
    lang === "ar" &&
    !!post &&
    !!extra &&
    ((!post.titleAr?.trim() && !!extra.titleAr) ||
      (!post.excerptAr?.trim() && !!extra.excerptAr) ||
      (!post.bodyHtmlAr?.trim() && !!extra.bodyHtmlAr));

  return {
    mergedPost: merged,
    title: merged ? pickBlogTitle(merged, lang) : "",
    excerpt: merged ? pickBlogExcerpt(merged, lang) : "",
    bodyHtml: merged ? pickBlogBodyHtml(merged, lang) : "",
    loading,
    usedAutoTranslation: usedAuto,
    translateIssue,
  };
}

export function useBlogListAutoAr(posts: BlogListItem[], lang: Lang) {
  const [extraBySlug, setExtraBySlug] = useState<
    Record<string, { titleAr?: string; excerptAr?: string }>
  >({});
  const [translateIssue, setTranslateIssue] = useState<BlogTranslateIssue | null>(null);

  useEffect(() => {
    if (lang !== "ar" || posts.length === 0) {
      setExtraBySlug({});
      setTranslateIssue(null);
      return;
    }

    const need = posts.filter((p) => !p.titleAr?.trim() || !p.excerptAr?.trim());
    if (need.length === 0) {
      setExtraBySlug({});
      setTranslateIssue(null);
      return;
    }

    const items = need.map((p) => ({
      slug: p.slug,
      updatedAt: p.updatedAt,
      title: p.title,
      excerpt: p.excerpt,
      needTitle: !p.titleAr?.trim(),
      needExcerpt: !p.excerptAr?.trim(),
    }));

    const ck = `vibo_tr_list_${listCacheKey(items)}`;
    try {
      const raw = sessionStorage.getItem(ck);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, { titleAr?: string; excerptAr?: string }>;
        setExtraBySlug(parsed);
        setTranslateIssue(null);
        return;
      }
    } catch {
      /* ignore */
    }

    let cancelled = false;
    setTranslateIssue(null);

    /** Few posts per request so each serverless run stays under Vercel time limits (e.g. 10s). */
    const POSTS_PER_REQUEST = 4;

    (async () => {
      const merged: Record<string, { titleAr?: string; excerptAr?: string }> = {};
      try {
        for (let off = 0; off < items.length; off += POSTS_PER_REQUEST) {
          if (cancelled) return;
          const slice = items.slice(off, off + POSTS_PER_REQUEST);
          const r = await fetch("/api/translate/blog-list", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: slice }),
          });
          let d: {
            ok?: boolean;
            reason?: string;
            items?: { slug: string; titleAr?: string; excerptAr?: string }[];
          };
          try {
            d = (await r.json()) as typeof d;
          } catch {
            if (!cancelled) {
              setExtraBySlug({});
              setTranslateIssue("translate_error");
            }
            return;
          }
          if (cancelled) return;
          if (d.ok === false) {
            setExtraBySlug({});
            setTranslateIssue(d.reason === "no_api_key" ? "no_api_key" : "translate_error");
            return;
          }
          if (!r.ok || d.ok !== true || !Array.isArray(d.items)) {
            setExtraBySlug({});
            setTranslateIssue("translate_error");
            return;
          }
          for (const row of d.items) {
            const cur = merged[row.slug] ?? {};
            merged[row.slug] = {
              titleAr: row.titleAr ?? cur.titleAr,
              excerptAr: row.excerptAr ?? cur.excerptAr,
            };
          }
        }
        if (cancelled) return;
        setExtraBySlug(merged);
        setTranslateIssue(null);
        try {
          sessionStorage.setItem(ck, JSON.stringify(merged));
        } catch {
          /* ignore */
        }
      } catch {
        if (!cancelled) {
          setExtraBySlug({});
          setTranslateIssue("translate_error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lang, posts]);

  const mergeOne = useCallback(
    (p: BlogListItem): BlogListItem => {
      const x = extraBySlug[p.slug];
      if (!x) return p;
      return {
        ...p,
        titleAr: p.titleAr?.trim() || x.titleAr || p.titleAr,
        excerptAr: p.excerptAr?.trim() || x.excerptAr || p.excerptAr,
      };
    },
    [extraBySlug],
  );

  return { extraBySlug, mergeOne, translateIssue };
}
