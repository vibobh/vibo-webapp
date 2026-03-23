import { NextResponse } from "next/server";
import type { NewsTag } from "@/types/news";
import { api, getConvexClient } from "@/lib/convexServer";

export const dynamic = "force-dynamic";

function isNewsTag(s: string | null): s is NewsTag {
  return (
    s === "all" ||
    s === "community" ||
    s === "company" ||
    s === "news" ||
    s === "product" ||
    s === "safety"
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("tag");
  const tag: NewsTag = isNewsTag(raw) ? raw : "all";

  const convex = getConvexClient();
  if (!convex) {
    return NextResponse.json({ articles: [] }, { status: 503 });
  }

  try {
    const items = await convex.query(api.news.listApproved, { tag });
    // Keep the public `/newsroom` UI type: it expects NewsArticle[] (no status/tag/id).
    const articles = items.map((n) => ({
      title: n.title,
      description: n.description,
      content: n.content,
      url: n.url,
      urlToImage: n.urlToImage,
      publishedAt: n.publishedAt,
      sourceName: n.sourceName,
    }));

    return NextResponse.json({ articles, tag, mock: false });
  } catch (e) {
    console.error("[news listApproved]", e);
    return NextResponse.json({ articles: [], tag, mock: false }, { status: 500 });
  }
}
