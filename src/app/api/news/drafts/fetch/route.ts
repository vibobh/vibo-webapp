import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { NewsArticle, NewsTag } from "@/types/news";
import { filterArticlesForVibo } from "@/lib/newsContentFilter";
import { verifySessionToken, BLOG_SESSION_COOKIE } from "@/lib/blogSession";
import { api, getConvexClient } from "@/lib/convexServer";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

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

function everythingQueryForTag(tag: NewsTag): string {
  const socialCore =
    "social media OR TikTok OR Instagram OR YouTube OR Snapchat OR Threads OR " +
    "creator OR influencer OR viral OR reels OR Discord OR Reddit OR Twitch OR " +
    "streaming OR Meta OR vtuber OR \"short video\" OR \"content creator\"";

  switch (tag) {
    case "all":
      return socialCore;
    case "news":
      return `${socialCore} OR technology OR platform OR digital OR app`;
    case "community":
      return `${socialCore} OR online community OR Discord OR Reddit OR community guidelines OR followers`;
    case "company":
      return "Meta OR Snap OR TikTok OR Instagram OR YouTube OR Spotify OR streaming OR platform OR tech OR earnings OR social media";
    case "product":
      return "TikTok OR Instagram OR YouTube OR Snapchat OR app OR social app OR iOS OR Android OR update OR streaming OR messaging OR creator tools";
    case "safety":
      return "online safety OR teen safety OR community guidelines OR digital wellness OR parental controls OR TikTok OR Instagram OR YouTube OR Snapchat OR social media";
    default:
      return socialCore;
  }
}

function normalizeArticle(a: {
  title: string;
  description: string | null;
  content?: string | null;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  source?: { name: string };
}): NewsArticle {
  return {
    title: a.title,
    description: a.description || "",
    content: a.content ?? null,
    url: a.url,
    urlToImage: a.urlToImage,
    publishedAt: a.publishedAt,
    sourceName: a.source?.name || "News",
  };
}

export async function POST(request: Request) {
  const unauthorized = requireSession();
  if (unauthorized) return unauthorized;

  const convex = getConvexClient();
  if (!convex) {
    return NextResponse.json({ error: "Convex is not configured." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const rawTag = body.tag;
  const tag: NewsTag = isNewsTag(rawTag) ? rawTag : "all";

  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "NEWS_API_KEY is missing on the server." },
      { status: 503 },
    );
  }

  try {
    const q = everythingQueryForTag(tag);
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&language=en&sortBy=publishedAt&pageSize=${PAGE_SIZE}`;

    const res = await fetch(url, {
      headers: { "X-Api-Key": apiKey },
      // Keep moderation refresh reasonably fresh.
      cache: "no-store",
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[news draft fetch]", res.status, errText);
      return NextResponse.json({ error: "NewsAPI error" }, { status: 500 });
    }

    const data = (await res.json()) as {
      articles?: Array<{
        title: string;
        description: string | null;
        content?: string | null;
        url: string;
        urlToImage: string | null;
        publishedAt: string;
        source?: { name: string };
      }>;
    };

    const rawArticles = data.articles || [];
    const normalized = rawArticles
      .filter((a) => a.title && a.url)
      .map(normalizeArticle);

    const filtered = filterArticlesForVibo(normalized);
    const articles = filtered.slice(0, 30);

    await convex.mutation(api.news.upsertDrafts, {
      secret: mutationSecret(),
      tag,
      items: articles.map((a) => ({
        title: a.title,
        description: a.description,
        content: a.content ?? undefined,
        url: a.url,
        urlToImage: a.urlToImage ?? undefined,
        publishedAt: a.publishedAt,
        publishedAtMs: Date.parse(a.publishedAt) || Date.now(),
        sourceName: a.sourceName,
      })),
    });

    return NextResponse.json({ ok: true, tag, count: articles.length });
  } catch (e) {
    console.error("[news draft fetch]", e);
    return NextResponse.json({ error: "Failed to fetch drafts" }, { status: 500 });
  }
}

