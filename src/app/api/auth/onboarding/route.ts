import { NextRequest, NextResponse } from "next/server";
import { api, createConvexHttpClient } from "@/lib/convexServer";
import { verifyToken, signToken, COOKIE_NAME, makeAuthCookieOptions } from "@/lib/auth/jwt";
import type { Id } from "@convex_app/_generated/dataModel";

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
    const { bio, bioLink } = body;

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
    await client.mutation(api.users.updateProfile, {
      userId: payload.sub as Id<"users">,
      bio: typeof bio === "string" && bio.trim() ? bio.trim() : undefined,
      bioLink: typeof bioLink === "string" && bioLink.trim() ? bioLink.trim() : undefined,
    });

    const freshToken = await signToken({
      sub: payload.sub,
      email: payload.email,
      username: payload.username,
      onboardingCompleted: true,
    });
    const res = NextResponse.json({ ok: true, token: freshToken });
    res.cookies.set(COOKIE_NAME, freshToken, makeAuthCookieOptions());
    return res;
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Failed to save profile" },
      { status: 500 },
    );
  }
}
