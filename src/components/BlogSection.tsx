"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { BlogListItem } from "@/types/blog";
import { pickBlogExcerpt, pickBlogTitle } from "@/lib/blogLocale";
import { useBlogListAutoAr } from "@/hooks/useBlogAutoTranslate";
import type { Lang } from "@/i18n";

type Props = {
  lang: Lang;
  label: string;
  heading: string;
  viewAll: string;
  readMore: string;
  sectionEmpty: string;
  categories: {
    article: string;
    case_study: string;
    featured: string;
    guide: string;
  };
};

/** Convex listPublished row before `_id` is stringified for the client list type */
type BlogListQueryRow = Omit<BlogListItem, "_id"> & { _id: BlogListItem["_id"] | { toString(): string } };

function formatDate(ts: number, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(ts));
  } catch {
    return "";
  }
}

export default function BlogSection({
  lang,
  label,
  heading,
  viewAll,
  readMore,
  sectionEmpty,
  categories,
}: Props) {
  const hasConvex = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL?.trim());
  const [postsRaw, setPostsRaw] = useState<
    readonly BlogListQueryRow[] | undefined | null
  >(() => (hasConvex ? undefined : null));

  useEffect(() => {
    if (!hasConvex) return;
    let cancelled = false;
    fetch("/api/blogs")
      .then((r) => (r.ok ? r.json() : Promise.resolve({ posts: [] })))
      .then((data: { posts?: readonly BlogListQueryRow[] }) => {
        if (!cancelled) setPostsRaw(data.posts ?? []);
      })
      .catch(() => {
        if (!cancelled) setPostsRaw([]);
      });
    return () => {
      cancelled = true;
    };
  }, [hasConvex]);
  const posts: BlogListItem[] = useMemo(() => {
    if (!postsRaw?.length) return [];
    return postsRaw.slice(0, 3).map((p) => ({
      ...p,
      _id: String(p._id),
    }));
  }, [postsRaw]);

  const loading = postsRaw !== null && postsRaw === undefined;
  const locale = lang === "ar" ? "ar" : "en";
  const q = `?lang=${lang}`;
  const { mergeOne } = useBlogListAutoAr(posts, lang);

  return (
    <section id="blog" className="bg-transparent scroll-mt-24">
      <div className="max-w-[1200px] mx-auto section-padding py-16 sm:py-24">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-10 sm:mb-12">
          <div className="min-w-0 text-start -ms-2 sm:-ms-4 lg:-ms-6 xl:-ms-8">
            <p className="text-xs uppercase tracking-[0.15em] text-vibo-primary font-medium mb-3">
              {label}
            </p>
            <h2 className="text-[clamp(1.6rem,3vw,2.4rem)] font-bold tracking-[-0.03em] text-neutral-900 max-w-xl leading-[1.15]">
              {heading}
            </h2>
          </div>
          <Link
            href={`/blogs${q}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-vibo-primary hover:underline shrink-0"
          >
            {viewAll}
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>
        </div>

        {loading ? (
          <p className="text-neutral-400 text-sm">…</p>
        ) : posts.length === 0 ? (
          <p className="text-neutral-500 text-sm max-w-lg">{sectionEmpty}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-10">
            {posts.map((post) => (
              <article key={post._id} className="flex flex-col h-full group">
                <Link href={`/blogs/${post.slug}${q}`} className="block flex-1 flex flex-col">
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
                      <div className="h-full w-full flex items-center justify-center bg-[#800000]/90 text-white/90 text-sm font-medium">
                        Vibo
                      </div>
                    )}
                  </div>
                  <p className="text-[0.7rem] text-neutral-400 mb-2">
                    {formatDate(post.publishedAt, locale)}
                    <span className="mx-1.5">•</span>
                    <span>
                      {categories[post.category as keyof typeof categories] ?? post.category}
                    </span>
                  </p>
                  <h3 className="text-lg font-bold text-neutral-900 leading-snug mb-2 line-clamp-2 group-hover:text-vibo-primary transition-colors">
                    {pickBlogTitle(mergeOne(post), lang)}
                  </h3>
                  <p className="text-[0.9rem] text-neutral-600 line-clamp-2 mb-4 flex-1">
                    {pickBlogExcerpt(mergeOne(post), lang)}
                  </p>
                  <span className="inline-flex items-center gap-2 text-[0.85rem] font-medium text-neutral-900">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full border border-neutral-200 bg-white">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </span>
                    {readMore}
                  </span>
                </Link>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
