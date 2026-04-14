import { NextResponse } from "next/server";
import {
  isEnToArTranslationConfigured,
  translateStringsEnToAr,
} from "@/lib/translateEnToArServer";
import { sanitizeBlogHtml } from "@/lib/sanitizeBlogHtml";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Body = {
  slug: string;
  updatedAt: number;
  title: string;
  excerpt: string;
  bodyHtml: string;
  /** When true and the English field is non-empty, that field is translated to Arabic. */
  needTitle: boolean;
  needExcerpt: boolean;
  needBody: boolean;
};

export async function POST(request: Request) {
  if (!isEnToArTranslationConfigured()) {
    return NextResponse.json({ ok: false as const, reason: "no_api_key" });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const slug = String(body.slug ?? "").trim().slice(0, 200);
  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  const title = String(body.title ?? "");
  const excerpt = String(body.excerpt ?? "");
  const bodyHtml = String(body.bodyHtml ?? "");

  const parts: { text: string; format: "text" | "html" }[] = [];
  const keys: ("titleAr" | "excerptAr" | "bodyHtmlAr")[] = [];

  if (body.needTitle && title.trim()) {
    parts.push({ text: title, format: "text" });
    keys.push("titleAr");
  }
  if (body.needExcerpt && excerpt.trim()) {
    parts.push({ text: excerpt, format: "text" });
    keys.push("excerptAr");
  }
  if (body.needBody && bodyHtml.trim()) {
    parts.push({ text: bodyHtml, format: "html" });
    keys.push("bodyHtmlAr");
  }

  if (parts.length === 0) {
    return NextResponse.json({
      ok: true as const,
      titleAr: "",
      excerptAr: "",
      bodyHtmlAr: "",
    });
  }

  try {
    const translated = await translateStringsEnToAr(parts);
    const result: Record<string, string> = { titleAr: "", excerptAr: "", bodyHtmlAr: "" };
    keys.forEach((k, i) => {
      let v = translated[i] ?? "";
      if (k === "bodyHtmlAr") v = sanitizeBlogHtml(v);
      result[k] = v;
    });
    return NextResponse.json({ ok: true as const, ...result });
  } catch (e) {
    console.error("[api/translate/blog]", e);
    const msg = e instanceof Error ? e.message : "Translate failed";
    return NextResponse.json(
      { ok: false as const, reason: "translate_error", error: msg },
      { status: 502 },
    );
  }
}
