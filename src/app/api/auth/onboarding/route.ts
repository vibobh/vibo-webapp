import { NextRequest, NextResponse } from "next/server";
import { api, createConvexHttpClient } from "@/lib/convexServer";
import { verifyToken, COOKIE_NAME } from "@/lib/auth/jwt";
import type { Id } from "@convex/_generated/dataModel";

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(COOKIE_NAME)?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const body = await request.json();
    const { interests, bio, bioLink, isPrivate } = body;

    let client;
    try {
      client = createConvexHttpClient();
    } catch {
      return NextResponse.json(
        {
          error:
            "Server misconfigured: add NEXT_PUBLIC_CONVEX_URL to .env.local and restart the dev server.",
        },
        { status: 500 },
      );
    }
    await client.mutation(api.users.completeOnboarding, {
      userId: payload.sub as Id<"users">,
      interests: interests ?? [],
      bio: bio || undefined,
      bioLink: bioLink || undefined,
      isPrivate: isPrivate ?? false,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Failed to save profile" },
      { status: 500 },
    );
  }
}
