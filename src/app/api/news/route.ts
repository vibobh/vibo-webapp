import { NextResponse } from "next/server";
import type { NewsArticle, NewsTag } from "@/types/news";

export const revalidate = 300;

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
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  source?: { name: string };
}): NewsArticle {
  return {
    title: a.title,
    description: a.description || "",
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
    let url: string;

    switch (tag) {
      case "news":
        url = `${base}/top-headlines?country=us&category=general&pageSize=30`;
        break;
      case "all":
        url = `${base}/top-headlines?country=us&pageSize=30`;
        break;
      case "community":
        url = `${base}/everything?q=community&language=en&sortBy=publishedAt&pageSize=30`;
        break;
      case "company":
        url = `${base}/everything?q=company+business&language=en&sortBy=publishedAt&pageSize=30`;
        break;
      case "product":
        url = `${base}/everything?q=technology+product&language=en&sortBy=publishedAt&pageSize=30`;
        break;
      case "safety":
        url = `${base}/everything?q=safety+security+online&language=en&sortBy=publishedAt&pageSize=30`;
        break;
      default:
        url = `${base}/top-headlines?country=us&pageSize=30`;
    }

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
        url: string;
        urlToImage: string | null;
        publishedAt: string;
        source?: { name: string };
      }>;
    };

    const rawArticles = data.articles || [];
    const articles = rawArticles
      .filter((a) => a.title && a.url)
      .map(normalizeArticle);

    if (articles.length === 0) {
      return NextResponse.json({
        articles: MOCK_ARTICLES,
        mock: true,
        tag,
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
