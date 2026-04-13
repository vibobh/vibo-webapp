"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { readStoredLang, writeStoredLang } from "@/i18n/useViboLang";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getTranslations, type Lang, isRTL } from "@/i18n";
import GradientBg from "@/components/GradientBg";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import type { BlogPost } from "@/types/blog";
import { useBlogArticleAutoAr } from "@/hooks/useBlogAutoTranslate";
import DOMPurify from "isomorphic-dompurify";

function formatDate(ts: number, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(ts));
  } catch {
    return "";
  }
}

export default function BlogArticleClient() {
  const params = useParams();
  const router = useRouter();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const searchParams = useSearchParams();
  const [lang, setLang] = useState<Lang>("en");
  const t = getTranslations(lang);
  const rtl = isRTL(lang);
  const bt = t.blog;
  const categoryLabel = bt.categories;
  const [authorImageFailed, setAuthorImageFailed] = useState(false);
  const [coverImageFailed, setCoverImageFailed] = useState(false);

  const hasConvex = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL?.trim());
  const rawPost = useQuery(api.blogs.getBySlug, hasConvex && slug ? { slug } : "skip");

  const post: BlogPost | null | undefined = useMemo(() => {
    if (!hasConvex) return undefined;
    if (!slug) return null;
    if (rawPost === undefined) return undefined;
    if (rawPost === null) return null;
    return { ...rawPost, _id: String(rawPost._id) } as BlogPost;
  }, [hasConvex, slug, rawPost]);

  const autoAr = useBlogArticleAutoAr(post ?? undefined, lang);

  useEffect(() => {
    const q = searchParams.get("lang");
    if (q === "ar" || q === "en") {
      setLang(q);
      writeStoredLang(q);
      return;
    }
    const s = readStoredLang();
    if (s) setLang(s);
  }, [searchParams]);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = rtl ? "rtl" : "ltr";
    document.body.classList.toggle("font-ar", rtl);
    document.body.classList.toggle("font-en", !rtl);
  }, [lang, rtl]);

  useEffect(() => {
    // Reset image fallbacks when the post changes.
    setAuthorImageFailed(false);
    setCoverImageFailed(false);
  }, [post?._id, post?.authorImageUrl, post?.coverImageUrl]);

  const switchLang = useCallback(() => {
    const next: Lang = lang === "en" ? "ar" : "en";
    const p = new URLSearchParams(searchParams.toString());
    p.set("lang", next);
    router.replace(`/blogs/${slug}?${p.toString()}`);
  }, [lang, router, searchParams, slug]);

  const locale = lang === "ar" ? "ar" : "en";

  /** English fallback under Arabic UI: force LTR so punctuation does not mirror incorrectly. */
  const titleDir =
    lang === "ar" && post && autoAr.title.trim() === post.title.trim()
      ? "ltr"
      : rtl
        ? "rtl"
        : "ltr";
  const bodyDir =
    lang === "ar" && !post?.bodyHtmlAr?.trim() && !autoAr.usedAutoTranslation
      ? "ltr"
      : rtl
        ? "rtl"
        : "ltr";

  const safeHtml = useMemo(() => {
    if (!autoAr.bodyHtml) return "";
    return DOMPurify.sanitize(autoAr.bodyHtml, { USE_PROFILES: { html: true } });
  }, [autoAr.bodyHtml]);

  if (!hasConvex) {
    return (
      <div className="min-h-screen text-neutral-900">
        <GradientBg />
        <Navbar t={t} lang={lang} onSwitchLang={switchLang} />
        <main className="relative z-[1] pt-[72px] lg:pt-[80px]">
          <div className="max-w-[720px] mx-auto section-padding py-16">
            <p className="text-center text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-sm">
              {bt.convexMissing}
            </p>
          </div>
        </main>
        <Footer t={t} lang={lang} onSwitchLang={switchLang} />
      </div>
    );
  }

  if (post === undefined) {
    return (
      <div className="min-h-screen text-neutral-900">
        <GradientBg />
        <Navbar t={t} lang={lang} onSwitchLang={switchLang} />
        <main className="relative z-[1] pt-[72px] lg:pt-[80px]">
          <div className="max-w-[720px] mx-auto section-padding py-20 text-center text-neutral-400 text-sm">
            {bt.loading}
          </div>
        </main>
        <Footer t={t} lang={lang} onSwitchLang={switchLang} />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen text-neutral-900">
        <GradientBg />
        <Navbar t={t} lang={lang} onSwitchLang={switchLang} />
        <main className="relative z-[1] pt-[72px] lg:pt-[80px]">
          <div className="max-w-[720px] mx-auto section-padding py-16 text-center">
            <p className="text-neutral-600 mb-6">{bt.notFound}</p>
            <Link
              href={`/blogs?lang=${lang}`}
              className="inline-flex items-center justify-center rounded-full bg-neutral-900 text-white px-5 py-2.5 text-sm font-medium hover:bg-neutral-800 transition-colors"
            >
              {bt.notFoundCta}
            </Link>
          </div>
        </main>
        <Footer t={t} lang={lang} onSwitchLang={switchLang} />
      </div>
    );
  }

  return (
    <div className="min-h-screen text-neutral-900">
      <GradientBg />
      <Navbar t={t} lang={lang} onSwitchLang={switchLang} />
      <main className="relative z-[1] pt-[72px] lg:pt-[80px]">
        <article className="max-w-[800px] mx-auto section-padding py-8 sm:py-12 lg:py-14 text-start">
          <Link
            href={`/blogs?lang=${lang}`}
            className={`inline-flex items-center justify-center h-10 w-10 rounded-full border border-neutral-200 bg-white text-neutral-700 shadow-sm hover:border-vibo-primary/40 hover:text-vibo-primary transition-colors mb-8 ${
              rtl ? "rotate-180" : ""
            }`}
            aria-label={bt.back}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>

          <p className="text-[0.8125rem] text-neutral-400 mb-4">
            {formatDate(post.publishedAt, locale)}
            <span className="mx-2">•</span>
            <span>
              {categoryLabel[post.category as keyof typeof categoryLabel] ?? post.category}
            </span>
          </p>

          {lang === "ar" && autoAr.translateIssue === "no_api_key" && (
            <p
              className="text-sm text-amber-900 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-4"
              dir="ltr"
            >
              {bt.translateNotConfigured}
            </p>
          )}
          {lang === "ar" && autoAr.translateIssue === "translate_error" && (
            <p className="text-sm text-amber-900 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-4">
              {bt.translateFailedShort}
            </p>
          )}

          {autoAr.loading && lang === "ar" && (
            <p className="text-xs text-neutral-400 mb-2">{bt.translating}</p>
          )}
          <h1
            dir={titleDir}
            className={`text-[1.7rem] sm:text-[2.05rem] lg:text-[2.35rem] font-bold text-neutral-900 leading-[1.12] tracking-[-0.035em] ${
              autoAr.usedAutoTranslation ? "mb-3" : "mb-8"
            }`}
          >
            {autoAr.title}
          </h1>
          {autoAr.usedAutoTranslation && (
            <p className="text-[0.8125rem] text-neutral-400 mb-8" dir={rtl ? "rtl" : "ltr"}>
              {bt.autoTranslatedHint}
            </p>
          )}

          <div className="flex items-center gap-3.5 mb-9 sm:mb-10">
            {post.authorImageUrl && !authorImageFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.authorImageUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="h-12 w-12 shrink-0 rounded-full object-cover ring-[3px] ring-white shadow-[0_0_0_1px_rgba(0,0,0,0.06)]"
                onError={() => setAuthorImageFailed(true)}
              />
            ) : (
              <div className="h-12 w-12 shrink-0 rounded-full bg-vibo-cream border border-vibo-gold/35 flex items-center justify-center text-vibo-primary text-[0.95rem] font-semibold ring-[3px] ring-white shadow-[0_0_0_1px_rgba(0,0,0,0.06)]">
                {post.authorName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[0.95rem] font-semibold text-neutral-900 leading-tight">{post.authorName}</p>
              <p className="text-[0.8125rem] text-[#6b7c93] mt-0.5">{bt.authorRole}</p>
            </div>
          </div>

          <div className="relative mb-10 sm:mb-12 overflow-hidden rounded-3xl bg-vibo-primary shadow-sm">
            <div className="flex aspect-[16/9] w-full min-h-[200px] items-center justify-center px-8 py-10 sm:px-12 sm:py-12 md:px-16 md:py-14">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  post.coverImageUrl && !coverImageFailed
                    ? post.coverImageUrl
                    : "/images/vibo-news-placeholder.png"
                }
                alt=""
                referrerPolicy="no-referrer"
                className="max-h-full max-w-full object-contain object-center"
                loading="eager"
                onError={() => setCoverImageFailed(true)}
              />
            </div>
          </div>

          <div
            dir={bodyDir}
            className="blog-prose space-y-4 text-[0.95rem] sm:text-[1rem] text-neutral-800 leading-relaxed [&_ul]:list-disc [&_ul]:ps-6 [&_ol]:list-decimal [&_ol]:ps-6 [&_li]:my-1 [&_a]:text-vibo-primary [&_a]:underline [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-lg"
            dangerouslySetInnerHTML={{ __html: safeHtml }}
          />
        </article>
      </main>
      <Footer t={t} lang={lang} onSwitchLang={switchLang} />
    </div>
  );
}
