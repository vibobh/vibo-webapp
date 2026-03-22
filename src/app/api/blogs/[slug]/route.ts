import { NextResponse } from "next/server";
import { api, getConvexClient } from "@/lib/convexServer";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { slug: string } },
) {
  const convex = getConvexClient();
  if (!convex) {
    return NextResponse.json({ post: null, convexConfigured: false });
  }
  try {
    const post = await convex.query(api.blogs.getBySlug, {
      slug: params.slug,
    });
    return NextResponse.json({ post, convexConfigured: true });
  } catch (e) {
    console.error("[api/blogs/slug]", e);
    return NextResponse.json(
      { post: null, error: "Failed to load post" },
      { status: 500 },
    );
  }
}
