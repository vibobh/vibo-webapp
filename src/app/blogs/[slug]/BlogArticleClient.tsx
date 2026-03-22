"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getTranslations, type Lang, isRTL } from "@/i18n";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import type { BlogPost } from "@/types/blog";
import DOMPurify from "isomorphic-dompurify";

const categoryLabel: Record<string, string> = {
  article: "Article",
  case_study: "Case study",
  featured: "Featured",
  guide: "Guide",
};

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
  const rawLang = searchParams.get("lang");
  const lang: Lang = rawLang === "ar" ? "ar" : "en";
  const t = getTranslations(lang);
  const rtl = isRTL(lang);
  const bt = t.blog;
  const [post, setPost] = useState<BlogPost | null | undefined>(undefined);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = rtl ? "rtl" : "ltr";
    document.body.classList.toggle("font-ar", rtl);
    document.body.classList.toggle("font-en", !rtl);
  }, [lang, rtl]);

  useEffect(() => {
    if (!slug) {
      setPost(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/blogs/${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((data: { post?: BlogPost | null }) => {
        if (cancelled) return;
        setPost(data.post ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setPost(null);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const switchLang = useCallback(() => {
    const next: Lang = lang === "en" ? "ar" : "en";
    const p = new URLSearchParams(searchParams.toString());
    p.set("lang", next);
    router.replace(`/blogs/${slug}?${p.toString()}`);
  }, [lang, router, searchParams, slug]);

  const locale = lang === "ar" ? "ar" : "en";

  const safeHtml = useMemo(() => {
    if (!post?.bodyHtml) return "";
    return DOMPurify.sanitize(post.bodyHtml, { USE_PROFILES: { html: true } });
  }, [post?.bodyHtml]);

  if (post === undefined) {
    return (
      <div className="min-h-screen bg-white text-neutral-900">
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
      <div className="min-h-screen bg-white text-neutral-900">
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
    <div className="min-h-screen bg-white text-neutral-900">
      <Navbar t={t} lang={lang} onSwitchLang={switchLang} />
      <main className="relative z-[1] pt-[72px] lg:pt-[80px]">
        <article className="max-w-[800px] mx-auto section-padding py-8 sm:py-12 lg:py-14">
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

          <p className="text-[0.8rem] text-neutral-400 mb-3">
            {formatDate(post.publishedAt, locale)}
            <span className="mx-2">•</span>
            <span>{categoryLabel[post.category] ?? post.category}</span>
          </p>

          <h1 className="text-[1.65rem] sm:text-[2rem] lg:text-[2.25rem] font-bold text-neutral-900 leading-[1.15] tracking-[-0.03em] mb-6">
            {post.title}
          </h1>

          <div className="flex items-center gap-3 mb-10">
            {post.authorImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.authorImageUrl}
                alt=""
                className="h-11 w-11 rounded-full object-cover ring-2 ring-neutral-100"
              />
            ) : (
              <div className="h-11 w-11 rounded-full bg-neutral-200 flex items-center justify-center text-neutral-500 text-sm font-medium">
                {post.authorName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-neutral-900">{post.authorName}</p>
              <p className="text-xs text-neutral-500">{bt.authorRole}</p>
            </div>
          </div>

          {post.coverImageUrl && (
            <div className="rounded-2xl overflow-hidden bg-neutral-100 border border-neutral-100 mb-10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={post.coverImageUrl}
                alt=""
                className="w-full h-auto max-h-[420px] object-cover object-center"
                loading="eager"
              />
            </div>
          )}

          <div
            className="blog-prose space-y-4 text-[0.95rem] sm:text-[1rem] text-neutral-800 leading-relaxed [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_a]:text-vibo-primary [&_a]:underline [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-lg"
            dangerouslySetInnerHTML={{ __html: safeHtml }}
          />
        </article>
      </main>
      <Footer t={t} lang={lang} onSwitchLang={switchLang} />
    </div>
  );
}
