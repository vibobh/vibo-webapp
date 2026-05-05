import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  BLOG_SESSION_COOKIE,
  verifySessionToken,
} from "@/lib/blogSession";
import { getConvexClient } from "@/lib/convexServer";
import { api } from "@convex_app/_generated/api";
import type { Id } from "@convex_app/_generated/dataModel";

export const dynamic = "force-dynamic";

function mutationSecret(): string {
  const s = process.env.BLOG_ADMIN_SECRET;
  if (!s) throw new Error("BLOG_ADMIN_SECRET missing");
  return s;
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const token = cookies().get(BLOG_SESSION_COOKIE)?.value;
  if (!verifySessionToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const convex = getConvexClient();
  if (!convex) {
    return NextResponse.json(
      { error: "Convex is not configured." },
      { status: 503 },
    );
  }

  try {
    await convex.mutation(api.blogs.deleteBlog, {
      secret: mutationSecret(),
      id: params.id as Id<"blogs">,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[blog/posts DELETE]", e);
    return NextResponse.json({ error: "Failed to delete" }, { status: 400 });
  }
}
