import { NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convexServer";
import { api } from "@convex_app/_generated/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const convex = getConvexClient();
  if (!convex) {
    return NextResponse.json({ posts: [], convexConfigured: false });
  }
  try {
    const posts = await convex.query(api.blogs.listPublished, {});
    return NextResponse.json(
      { posts, convexConfigured: true },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      },
    );
  } catch (e) {
    console.error("[api/blogs]", e);
    return NextResponse.json(
      { posts: [], error: "Failed to load blogs" },
      { status: 500 },
    );
  }
}
