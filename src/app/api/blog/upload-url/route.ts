import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  BLOG_SESSION_COOKIE,
  verifySessionToken,
} from "@/lib/blogSession";
import { getConvexClient } from "@/lib/convexServer";
import { api } from "@convex_app/_generated/api";

export const dynamic = "force-dynamic";

function mutationSecret(): string {
  const s = process.env.BLOG_ADMIN_SECRET;
  if (!s) throw new Error("BLOG_ADMIN_SECRET missing");
  return s;
}

export async function POST() {
  const token = cookies().get(BLOG_SESSION_COOKIE)?.value;
  if (!verifySessionToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const convex = getConvexClient();
  if (!convex) {
    return NextResponse.json(
      { error: "Convex is not configured (NEXT_PUBLIC_CONVEX_URL)." },
      { status: 503 },
    );
  }

  try {
    const uploadUrl = await convex.mutation(api.blogs.generateUploadUrl, {
      secret: mutationSecret(),
    });
    return NextResponse.json({ uploadUrl });
  } catch (e) {
    console.error("[upload-url]", e);
    return NextResponse.json({ error: "Failed to create upload URL" }, { status: 500 });
  }
}
