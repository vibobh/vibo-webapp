import { NextRequest, NextResponse } from "next/server";
import { api, createConvexHttpClient } from "@/lib/convexServer";
import { signToken, COOKIE_NAME, makeAuthCookieOptions } from "@/lib/auth/jwt";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const countryCode =
      typeof body.countryCode === "string" && body.countryCode.trim()
        ? body.countryCode.trim()
        : undefined;
    const preferredLang =
      typeof body.preferredLang === "string" && body.preferredLang.trim()
        ? body.preferredLang.trim()
        : undefined;

    if (!email || !code || !username || !password || !fullName || !phone) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

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

    const verified = await client.action(api.auth.verifyEmailOtp, {
      email,
      code,
    });
    const result = await client.action(api.auth.signUpEmail, {
      email,
      username,
      password,
      fullName,
      phone,
      emailVerificationToken: verified.verificationToken,
      countryCode,
      lang: preferredLang,
    });

    const emailNorm = email.toLowerCase();
    const token = await signToken({
      sub: result.userId,
      email: emailNorm,
      username,
      onboardingCompleted: false,
    });

    const res = NextResponse.json({
      token,
      user: {
        id: result.userId,
        email: emailNorm,
        username,
        onboardingCompleted: false,
      },
    });
    res.cookies.set(COOKIE_NAME, token, makeAuthCookieOptions());
    return res;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Verification failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
