import { Suspense } from "react";
import type { Metadata } from "next";
import BlogArticleClient from "./BlogArticleClient";
import { getConvexClient } from "@/lib/convexServer";
import { api } from "@convex_app/_generated/api";

type Props = {
  params: { slug: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = params.slug;
  const url = `https://joinvibo.com/blogs/${encodeURIComponent(slug)}`;
  const fallback: Metadata = {
    title: "Blog",
    description: "Stories, guides, and updates from the Vibo team.",
    alternates: { canonical: url },
  };

  const convex = getConvexClient();
  if (!convex) return fallback;

  try {
    const post = await convex.query(api.blogs.getBySlug, { slug });
    if (!post) return fallback;

    return {
      title: post.title,
      description: post.excerpt,
      alternates: { canonical: url },
      openGraph: {
        title: post.title,
        description: post.excerpt,
        url,
        siteName: "Vibo",
        type: "article",
        images: post.coverImageUrl ? [{ url: post.coverImageUrl }] : undefined,
      },
      twitter: {
        card: post.coverImageUrl ? "summary_large_image" : "summary",
        title: post.title,
        description: post.excerpt,
        images: post.coverImageUrl ? [post.coverImageUrl] : undefined,
      },
    };
  } catch {
    return fallback;
  }
}

export default function BlogArticlePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex items-center justify-center text-neutral-400 text-sm pt-24">
          Loading…
        </div>
      }
    >
      <BlogArticleClient />
    </Suspense>
  );
}
