import { NextRequest, NextResponse } from "next/server";
import { api, createConvexHttpClient } from "@/lib/convexServer";
import { signToken, COOKIE_NAME, makeAuthCookieOptions } from "@/lib/auth/jwt";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { identifier, password } = body;

    if (!identifier || !password) {
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
    const result = await client.action(api.authActions.loginWithEmail, {
      identifier,
      password,
    });

    const token = await signToken({
      sub: result.userId,
      email: result.email,
      username: result.username,
    });

    const res = NextResponse.json({
      token,
      user: {
        id: result.userId,
        email: result.email,
        username: result.username,
      },
    });
    res.cookies.set(COOKIE_NAME, token, makeAuthCookieOptions());
    return res;
  } catch (err: any) {
    const message = err?.message ?? "Sign in failed";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
