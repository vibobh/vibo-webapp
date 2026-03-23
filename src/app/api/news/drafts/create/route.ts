import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { NewsTag } from "@/types/news";
import { verifySessionToken, BLOG_SESSION_COOKIE } from "@/lib/blogSession";
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

export async function POST(request: Request) {
  const unauthorized = requireSession();
  if (unauthorized) return unauthorized;

  const convex = getConvexClient();
  if (!convex) {
    return NextResponse.json({ error: "Convex is not configured." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const tag: NewsTag = isNewsTag(body.tag) ? body.tag : "all";
  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim();
  const content = String(body.content ?? "").trim();
  const url = String(body.url ?? "").trim();
  const urlToImage = String(body.urlToImage ?? "").trim();
  const sourceName = String(body.sourceName ?? "").trim() || "Vibo";
  const publishedAtRaw = String(body.publishedAt ?? "").trim();

  if (!title || !description || !url) {
    return NextResponse.json(
      { error: "Title, description, and URL are required." },
      { status: 400 },
    );
  }
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "URL must start with http:// or https://" }, { status: 400 });
  }
  if (urlToImage && !/^https?:\/\//i.test(urlToImage)) {
    return NextResponse.json(
      { error: "Image URL must start with http:// or https://" },
      { status: 400 },
    );
  }

  const publishedAt = publishedAtRaw
    ? new Date(publishedAtRaw).toISOString()
    : new Date().toISOString();

  try {
    const id = await convex.mutation(api.news.createDraft, {
      secret: mutationSecret(),
      tag,
      title,
      description,
      content: content || undefined,
      url,
      urlToImage: urlToImage || undefined,
      sourceName,
      publishedAt,
    });
    return NextResponse.json({ ok: true, id: String(id) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to create draft";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

