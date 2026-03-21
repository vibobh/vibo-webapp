import { NextResponse } from "next/server";
import type { NewsArticle, NewsTag } from "@/types/news";
import { filterArticlesForVibo } from "@/lib/newsContentFilter";

export const revalidate = 300;

/** Fetch enough items so filtering for social + safety still leaves a full page. */
const PAGE_SIZE = 100;

const MOCK_ARTICLES: NewsArticle[] = [
  {
    title: "Vibo — Real People. Real Moments.",
    description:
      "When NEWS_API_KEY is not set, this sample article is shown. Add a free NewsAPI.org key to see live headlines.",
    url: "https://joinvibo.com",
    urlToImage: null,
    publishedAt: new Date().toISOString(),
    sourceName: "Vibo",
  },
  {
    title: "Build your community on Vibo",
    description:
      "Share short videos, stories, and messages with a community that celebrates authenticity.",
    url: "https://joinvibo.com",
    urlToImage: null,
    publishedAt: new Date().toISOString(),
    sourceName: "Vibo Newsroom",
  },
];

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

/**
 * NewsAPI `everything` queries: social / creator / platform focused (OR must be uppercase).
 * Server-side filtering in `filterArticlesForVibo` removes war, adult, and off-topic items.
 */
function everythingQueryForTag(tag: NewsTag): string {
  /** OR-only queries work reliably on NewsAPI; filtering tightens to social + safe. */
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("tag");
  const tag: NewsTag = isNewsTag(raw) ? raw : "all";

  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      articles: MOCK_ARTICLES,
      mock: true,
      tag,
    });
  }

  const base = "https://newsapi.org/v2";
  const headers = { "X-Api-Key": apiKey };

  try {
    const q = everythingQueryForTag(tag);
    const url = `${base}/everything?q=${encodeURIComponent(q)}&language=en&sortBy=publishedAt&pageSize=${PAGE_SIZE}`;

    const res = await fetch(url, {
      headers,
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[news API]", res.status, errText);
      return NextResponse.json({
        articles: MOCK_ARTICLES,
        mock: true,
        tag,
        error: "NewsAPI error",
      });
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

    if (articles.length === 0) {
      return NextResponse.json({
        articles: MOCK_ARTICLES,
        mock: true,
        tag,
        filterEmpty: true,
      });
    }

    return NextResponse.json({ articles, mock: false, tag });
  } catch (e) {
    console.error("[news API]", e);
    return NextResponse.json({
      articles: MOCK_ARTICLES,
      mock: true,
      tag,
      error: "fetch_failed",
    });
  }
}
