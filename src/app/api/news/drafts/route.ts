import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { NewsModerationItem, NewsTag } from "@/types/news";
import { verifySessionToken, BLOG_SESSION_COOKIE } from "@/lib/blogSession";
import { getConvexClient } from "@/lib/convexServer";
import { api } from "@convex_app/_generated/api";
import type { Id } from "@convex_app/_generated/dataModel";

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

function mutationSecret(): string {
  const s = process.env.BLOG_ADMIN_SECRET;
  if (!s) throw new Error("BLOG_ADMIN_SECRET missing");
  return s;
}

function requireSession() {
  const token = cookies().get(BLOG_SESSION_COOKIE)?.value;
  if (!verifySessionToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(request: Request) {
  const unauthorized = requireSession();
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("tag");
  const tag: NewsTag = isNewsTag(raw) ? raw : "all";

  const convex = getConvexClient();
  if (!convex) {
    return NextResponse.json({ error: "Convex is not configured." }, { status: 503 });
  }

  try {
    const items = await convex.query(api.news.listDrafts, {
      secret: mutationSecret(),
      tag,
    });

    const resItems: NewsModerationItem[] = items.map((n: any) => ({
      _id: String(n._id as Id<"newsItems">),
      tag: n.tag,
      status: n.status,
      title: n.title,
      description: n.description,
      content: n.content,
      url: n.url,
      urlToImage: n.urlToImage,
      publishedAt: n.publishedAt,
      sourceName: n.sourceName,
      publishedAtMs: n.publishedAtMs,
    }));

    return NextResponse.json({ items: resItems, tag });
  } catch (e) {
    console.error("[news drafts GET]", e);
    return NextResponse.json({ error: "Failed to list drafts" }, { status: 500 });
  }
}

