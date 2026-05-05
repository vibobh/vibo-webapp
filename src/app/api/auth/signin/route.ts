import { NextRequest, NextResponse } from "next/server";
import { api, createConvexHttpClient } from "@/lib/convexServer";
import { signToken, COOKIE_NAME, makeAuthCookieOptions } from "@/lib/auth/jwt";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = String(body?.email ?? "")
      .trim()
      .toLowerCase();
    const password = String(body?.password ?? "");

    if (!email || !password) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    let client;
    try {
      client = createConvexHttpClient();
    } catch {
      return NextResponse.json(
        {
          error:
            "Server misconfigured: add NEXT_PUBLIC_CONVEX_URL to .env.local (same URL as Convex dashboard) and restart the dev server.",
        },
        { status: 500 },
      );
    }
    const result = await client.action(api.auth.signInEmail, {
      email,
      password,
    });
    const profile = await client.query(api.users.getById, {
      id: result.userId,
    });
    const row =
      profile &&
      typeof profile === "object" &&
      (!("restricted" in profile) ||
        (profile as { restricted?: boolean }).restricted !== true)
        ? (profile as {
            email?: string;
            username?: string;
            onboardingCompleted?: boolean;
          })
        : null;

    const token = await signToken({
      sub: result.userId,
      email: row?.email ?? "",
      username: row?.username,
      onboardingCompleted: row?.onboardingCompleted === true,
    });

    const res = NextResponse.json({
      token,
      user: {
        id: result.userId,
        email: row?.email ?? "",
        username: row?.username,
        onboardingCompleted: row?.onboardingCompleted === true,
      },
    });
    res.cookies.set(COOKIE_NAME, token, makeAuthCookieOptions());
    return res;
  } catch (err: any) {
    const message = err?.message ?? "Sign in failed";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
