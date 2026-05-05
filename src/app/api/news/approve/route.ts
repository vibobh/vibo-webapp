import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken, BLOG_SESSION_COOKIE } from "@/lib/blogSession";
import { getConvexClient } from "@/lib/convexServer";
import { api } from "@convex_app/_generated/api";
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

export async function POST(request: Request) {
  const unauthorized = requireSession();
  if (unauthorized) return unauthorized;

  const convex = getConvexClient();
  if (!convex) {
    return NextResponse.json({ error: "Convex is not configured." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const id = body.id as string | undefined;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  try {
    await convex.mutation(api.news.approve, {
      secret: mutationSecret(),
      id: id as Id<"newsItems">,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[news approve]", e);
    return NextResponse.json({ error: "Failed to approve" }, { status: 500 });
  }
}

