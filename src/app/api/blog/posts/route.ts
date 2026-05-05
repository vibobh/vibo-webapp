import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  BLOG_SESSION_COOKIE,
  verifySessionToken,
} from "@/lib/blogSession";
import { getConvexClient } from "@/lib/convexServer";
import { api } from "@convex_app/_generated/api";
import { sanitizeBlogHtml } from "@/lib/sanitizeBlogHtml";
import { isValidSlug, normalizeSlug } from "@/lib/blogSlug";
import type { Id } from "@convex_app/_generated/dataModel";

export const dynamic = "force-dynamic";

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

export async function GET() {
  const unauthorized = requireSession();
  if (unauthorized) return unauthorized;

  const convex = getConvexClient();
  if (!convex) {
    return NextResponse.json(
      { error: "Convex is not configured." },
      { status: 503 },
    );
  }

  try {
    const posts = await convex.query(api.blogs.listAll, {
      secret: mutationSecret(),
    });
    return NextResponse.json({ posts });
  } catch (e) {
    console.error("[blog/posts GET]", e);
    return NextResponse.json({ error: "Failed to list posts" }, { status: 500 });
  }
}

type Category = "article" | "case_study" | "featured" | "guide";

function parseCategory(s: string): Category | null {
  if (
    s === "article" ||
    s === "case_study" ||
    s === "featured" ||
    s === "guide"
  ) {
    return s;
  }
  return null;
}

export async function POST(request: Request) {
  const unauthorized = requireSession();
  if (unauthorized) return unauthorized;

  const convex = getConvexClient();
  if (!convex) {
    return NextResponse.json(
      { error: "Convex is not configured." },
      { status: 503 },
    );
  }

  try {
    const body = await request.json();
    const slug = normalizeSlug(String(body.slug ?? ""));
    if (!isValidSlug(slug)) {
      return NextResponse.json(
        { error: "Invalid slug. Use lowercase letters, numbers, and hyphens (e.g. my-first-post)." },
        { status: 400 },
      );
    }

    const category = parseCategory(String(body.category ?? ""));
    if (!category) {
      return NextResponse.json({ error: "Invalid category." }, { status: 400 });
    }

    const title = String(body.title ?? "").trim();
    const excerpt = String(body.excerpt ?? "").trim();
    const authorName = String(body.authorName ?? "").trim();
    const bodyHtml = sanitizeBlogHtml(String(body.bodyHtml ?? ""));
    const titleAr = String(body.titleAr ?? "").trim();
    const excerptAr = String(body.excerptAr ?? "").trim();
    const bodyHtmlAr = sanitizeBlogHtml(String(body.bodyHtmlAr ?? ""));
    const published = body.published === true;

    if (!title || !excerpt || !authorName || !bodyHtml) {
      return NextResponse.json(
        { error: "Title, excerpt, author name, and body are required." },
        { status: 400 },
      );
    }

    const coverImageId = body.coverImageId
      ? (String(body.coverImageId) as Id<"_storage">)
      : undefined;
    const authorImageId = body.authorImageId
      ? (String(body.authorImageId) as Id<"_storage">)
      : undefined;

    const id = await convex.mutation(api.blogs.createBlog, {
      secret: mutationSecret(),
      slug,
      title,
      excerpt,
      titleAr,
      excerptAr,
      bodyHtmlAr,
      category,
      authorName,
      coverImageId,
      authorImageId,
      bodyHtml,
      published,
    });

    return NextResponse.json({ ok: true, id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to create";
    console.error("[blog/posts POST]", e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const unauthorized = requireSession();
  if (unauthorized) return unauthorized;

  const convex = getConvexClient();
  if (!convex) {
    return NextResponse.json(
      { error: "Convex is not configured." },
      { status: 503 },
    );
  }

  try {
    const body = await request.json();
    const id = String(body.id ?? "") as Id<"blogs">;
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const slug = normalizeSlug(String(body.slug ?? ""));
    if (!isValidSlug(slug)) {
      return NextResponse.json({ error: "Invalid slug." }, { status: 400 });
    }

    const category = parseCategory(String(body.category ?? ""));
    if (!category) {
      return NextResponse.json({ error: "Invalid category." }, { status: 400 });
    }

    const title = String(body.title ?? "").trim();
    const excerpt = String(body.excerpt ?? "").trim();
    const authorName = String(body.authorName ?? "").trim();
    const bodyHtml = sanitizeBlogHtml(String(body.bodyHtml ?? ""));
    const titleAr = String(body.titleAr ?? "").trim();
    const excerptAr = String(body.excerptAr ?? "").trim();
    const bodyHtmlAr = sanitizeBlogHtml(String(body.bodyHtmlAr ?? ""));
    const published = body.published === true;

    if (!title || !excerpt || !authorName || !bodyHtml) {
      return NextResponse.json(
        { error: "Title, excerpt, author name, and body are required." },
        { status: 400 },
      );
    }

    const coverImageId = body.coverImageId
      ? (String(body.coverImageId) as Id<"_storage">)
      : undefined;
    const authorImageId = body.authorImageId
      ? (String(body.authorImageId) as Id<"_storage">)
      : undefined;

    await convex.mutation(api.blogs.updateBlog, {
      secret: mutationSecret(),
      id,
      slug,
      title,
      excerpt,
      titleAr,
      excerptAr,
      bodyHtmlAr,
      category,
      authorName,
      coverImageId,
      authorImageId,
      bodyHtml,
      published,
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to update";
    console.error("[blog/posts PATCH]", e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
