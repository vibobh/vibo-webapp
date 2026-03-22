"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "@convex/_generated/api";
import { getTranslations, type Lang, isRTL } from "@/i18n";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import type { BlogListItem } from "@/types/blog";

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

export default function BlogsPage() {
  const [lang, setLang] = useState<Lang>("en");
  const t = getTranslations(lang);
  const rtl = isRTL(lang);
  const bt = t.blog;

  const hasConvex = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL?.trim());
  const postsRaw = useQuery(api.blogs.listPublished, hasConvex ? {} : "skip");

  const loading = hasConvex && postsRaw === undefined;

  const posts: BlogListItem[] = useMemo(() => {
    if (!postsRaw?.length) return [];
    return postsRaw.map((p) => ({
      ...p,
      _id: String(p._id),
    }));
  }, [postsRaw]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("lang");
    if (q === "ar") setLang("ar");
    if (q === "en") setLang("en");
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = rtl ? "rtl" : "ltr";
    document.body.classList.toggle("font-ar", rtl);
    document.body.classList.toggle("font-en", !rtl);
  }, [lang, rtl]);

  const switchLang = useCallback(() => {
    setLang((prev) => (prev === "en" ? "ar" : "en"));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const locale = lang === "ar" ? "ar" : "en";
  const featured = posts[0] ?? null;
  const rest = posts.slice(1);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={lang}
        initial={{ opacity: 1 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="min-h-screen bg-white text-neutral-900"
      >
        <Navbar t={t} lang={lang} onSwitchLang={switchLang} />
        <main className="relative z-[1] pt-[72px] lg:pt-[80px]">
          <div className="max-w-[1200px] mx-auto section-padding py-10 sm:py-12 lg:py-14">
            <header className="mb-10 sm:mb-12">
              <h1 className="text-[1.75rem] sm:text-[2rem] font-bold tracking-[-0.03em] text-neutral-900">
                {bt.title}
              </h1>
              <p className="mt-2 text-[0.95rem] text-neutral-500 max-w-2xl">{bt.description}</p>
            </header>

            {!hasConvex ? (
              <p className="text-center text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-sm max-w-xl mx-auto">
                {bt.convexMissing}
              </p>
            ) : loading ? (
              <div className="py-20 text-center text-neutral-400 text-sm">{bt.loading}</div>
            ) : posts.length === 0 ? (
              <p className="text-center text-neutral-500 py-12">{bt.empty}</p>
            ) : (
              <>
                {featured && (
                  <Link
                    href={`/blogs/${featured.slug}?lang=${lang}`}
                    className="block group mb-12 sm:mb-14"
                  >
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
                      <div className="lg:col-span-7 relative aspect-[16/9] rounded-2xl overflow-hidden bg-neutral-100 ring-1 ring-neutral-100">
                        {featured.coverImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={featured.coverImageUrl}
                            alt=""
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center bg-[#800000] text-white text-lg font-semibold">
                            Vibo
                          </div>
                        )}
                      </div>
                      <div className="lg:col-span-5 flex flex-col justify-center">
                        <p className="text-[0.8rem] text-neutral-400 mb-3">
                          {formatDate(featured.publishedAt, locale)}
                          <span className="mx-2">•</span>
                          {categoryLabel[featured.category] ?? featured.category}
                        </p>
                        <h2 className="text-[1.35rem] sm:text-[1.5rem] font-bold text-neutral-900 leading-tight tracking-[-0.02em] mb-3 group-hover:text-vibo-primary transition-colors">
                          {featured.title}
                        </h2>
                        <p className="text-[0.95rem] text-neutral-600 leading-relaxed line-clamp-4">
                          {featured.excerpt}
                        </p>
                        <span className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-vibo-primary">
                          {bt.readMore}
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                          </svg>
                        </span>
                      </div>
                    </div>
                  </Link>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 lg:gap-10">
                  {rest.map((post) => (
                    <article key={post._id} className="flex flex-col h-full">
                      <Link href={`/blogs/${post.slug}?lang=${lang}`} className="group flex flex-col h-full">
                        <div className="relative aspect-[16/10] rounded-xl overflow-hidden bg-neutral-100 mb-3 ring-1 ring-neutral-100">
                          {post.coverImageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={post.coverImageUrl}
                              alt=""
                              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                              loading="lazy"
                            />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center bg-[#800000]/90 text-white text-sm font-medium">
                              Vibo
                            </div>
                          )}
                        </div>
                        <p className="text-[0.7rem] text-neutral-400 mb-2">
                          {formatDate(post.publishedAt, locale)}
                          <span className="mx-1.5">•</span>
                          {categoryLabel[post.category] ?? post.category}
                        </p>
                        <h3 className="text-base sm:text-lg font-bold text-neutral-900 leading-snug mb-2 line-clamp-2 group-hover:text-vibo-primary transition-colors">
                          {post.title}
                        </h3>
                        <p className="text-[0.85rem] text-neutral-600 line-clamp-2 mb-4 flex-1">{post.excerpt}</p>
                        <span className="inline-flex items-center gap-2 text-[0.85rem] font-medium text-neutral-900">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-neutral-200 bg-white">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                            </svg>
                          </span>
                          {bt.readMore}
                        </span>
                      </Link>
                    </article>
                  ))}
                </div>
              </>
            )}
          </div>
        </main>
        <Footer t={t} lang={lang} onSwitchLang={switchLang} />
      </motion.div>
    </AnimatePresence>
  );
}
