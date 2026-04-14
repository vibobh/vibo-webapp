import { NextResponse } from "next/server";
import {
  isEnToArTranslationConfigured,
  translateStringsEnToAr,
} from "@/lib/translateEnToArServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Allow batched OpenRouter calls on Vercel (Hobby caps this; client also chunks requests). */
export const maxDuration = 60;

type Item = {
  slug: string;
  updatedAt: number;
  title: string;
  excerpt: string;
  needTitle: boolean;
  needExcerpt: boolean;
};

export async function POST(request: Request) {
  if (!isEnToArTranslationConfigured()) {
    return NextResponse.json({ ok: false as const, reason: "no_api_key" });
  }

  let items: Item[];
  try {
    const body = (await request.json()) as { items?: Item[] };
    items = Array.isArray(body.items) ? body.items : [];
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (items.length === 0) {
    return NextResponse.json({ ok: true as const, items: [] as { slug: string; titleAr?: string; excerptAr?: string }[] });
  }
  if (items.length > 24) {
    return NextResponse.json({ error: "Too many items" }, { status: 400 });
  }

  const parts: { text: string; format: "text" }[] = [];
  const meta: { slug: string; field: "title" | "excerpt" }[] = [];

  for (const it of items) {
    const slug = String(it.slug ?? "").trim().slice(0, 200);
    if (!slug) continue;
    const title = String(it.title ?? "");
    const excerpt = String(it.excerpt ?? "");
    if (it.needTitle && title.trim()) {
      parts.push({ text: title, format: "text" });
      meta.push({ slug, field: "title" });
    }
    if (it.needExcerpt && excerpt.trim()) {
      parts.push({ text: excerpt, format: "text" });
      meta.push({ slug, field: "excerpt" });
    }
  }

  if (parts.length === 0) {
    return NextResponse.json({ ok: true as const, items: [] });
  }

  try {
    const translated = await translateStringsEnToAr(parts);
    const bySlug = new Map<string, { titleAr?: string; excerptAr?: string }>();
    meta.forEach((m, i) => {
      const t = translated[i] ?? "";
      const cur = bySlug.get(m.slug) ?? {};
      if (m.field === "title") cur.titleAr = t;
      else cur.excerptAr = t;
      bySlug.set(m.slug, cur);
    });
    const out = items.map((it) => {
      const slug = String(it.slug ?? "").trim();
      return { slug, ...(bySlug.get(slug) ?? {}) };
    });

    return NextResponse.json({ ok: true as const, items: out });
  } catch (e) {
    console.error("[api/translate/blog-list]", e);
    const msg = e instanceof Error ? e.message : "Translate failed";
    return NextResponse.json(
      { ok: false as const, reason: "translate_error", error: msg },
      { status: 502 },
    );
  }
}
