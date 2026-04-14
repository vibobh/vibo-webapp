import { NextResponse } from "next/server";
import {
  isEnToArTranslationConfigured,
  translateStringsEnToAr,
} from "@/lib/translateEnToArServer";

export const dynamic = "force-dynamic";

type Item = {
  url: string;
  publishedAt: string;
  title: string;
  description: string;
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
    return NextResponse.json({ ok: true as const, items: [] as { url: string; titleAr?: string; descriptionAr?: string }[] });
  }
  if (items.length > 24) {
    return NextResponse.json({ error: "Too many items" }, { status: 400 });
  }

  const parts: { text: string; format: "text" }[] = [];
  const meta: { url: string; field: "title" | "description" }[] = [];

  for (const it of items) {
    const url = String(it.url ?? "").trim().slice(0, 2000);
    if (!url) continue;
    const title = String(it.title ?? "").trim();
    const description = String(it.description ?? "").trim();
    if (title) {
      parts.push({ text: title, format: "text" });
      meta.push({ url, field: "title" });
    }
    if (description) {
      parts.push({ text: description, format: "text" });
      meta.push({ url, field: "description" });
    }
  }

  if (parts.length === 0) {
    return NextResponse.json({ ok: true as const, items: [] });
  }

  try {
    const translated = await translateStringsEnToAr(parts);
    const byUrl = new Map<string, { titleAr?: string; descriptionAr?: string }>();
    meta.forEach((m, i) => {
      const t = translated[i] ?? "";
      const cur = byUrl.get(m.url) ?? {};
      if (m.field === "title") cur.titleAr = t;
      else cur.descriptionAr = t;
      byUrl.set(m.url, cur);
    });

    const out = items.map((it) => {
      const url = String(it.url ?? "").trim();
      return { url, ...(byUrl.get(url) ?? {}) };
    });

    return NextResponse.json({ ok: true as const, items: out });
  } catch (e) {
    console.error("[api/translate/news-list]", e);
    const msg = e instanceof Error ? e.message : "Translate failed";
    return NextResponse.json(
      { ok: false as const, reason: "translate_error", error: msg },
      { status: 502 },
    );
  }
}
