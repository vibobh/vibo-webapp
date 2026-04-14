import { NextResponse } from "next/server";
import {
  isEnToArTranslationConfigured,
  translateStringsEnToAr,
} from "@/lib/translateEnToArServer";
import { sanitizeNewsArticleHtml } from "@/lib/sanitizeNewsHtml";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Body = {
  url: string;
  publishedAt: string;
  title: string;
  bodyForTranslate: string;
  needTitle: boolean;
  needBody: boolean;
  bodyFormat: "text" | "html";
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

  const url = String(body.url ?? "").trim().slice(0, 2000);
  if (!url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  const title = String(body.title ?? "");
  const rawBody = String(body.bodyForTranslate ?? "");
  const fmt = body.bodyFormat === "html" ? "html" : "text";

  const parts: { text: string; format: "text" | "html" }[] = [];
  const keys: ("titleAr" | "bodyAr")[] = [];

  if (body.needTitle && title.trim()) {
    parts.push({ text: title, format: "text" });
    keys.push("titleAr");
  }
  if (body.needBody && rawBody.trim()) {
    parts.push({ text: rawBody, format: fmt });
    keys.push("bodyAr");
  }

  if (parts.length === 0) {
    return NextResponse.json({ ok: true as const, titleAr: "", bodyAr: "" });
  }

  try {
    const translated = await translateStringsEnToAr(parts);
    const result: Record<string, string> = { titleAr: "", bodyAr: "" };
    keys.forEach((k, i) => {
      let v = translated[i] ?? "";
      if (k === "bodyAr" && fmt === "html") v = sanitizeNewsArticleHtml(v);
      result[k] = v;
    });
    return NextResponse.json({ ok: true as const, ...result });
  } catch (e) {
    console.error("[api/translate/news-article]", e);
    const msg = e instanceof Error ? e.message : "Translate failed";
    return NextResponse.json(
      { ok: false as const, reason: "translate_error", error: msg },
      { status: 502 },
    );
  }
}
