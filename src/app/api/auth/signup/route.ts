import { NextRequest, NextResponse } from "next/server";
import { api, createConvexHttpClient, getConvexDeploymentUrl } from "@/lib/convexServer";
import { signToken, COOKIE_NAME, makeAuthCookieOptions } from "@/lib/auth/jwt";

/**
 * Convex HTTP client may throw:
 * - `Error` with message from `respJSON.errorMessage` (can be empty).
 * - `ConvexError` with optional `.data` when `errorData` is set (message may be empty; see convex `http_client.js`).
 * Handler text is often wrapped as: `[Request ID: …] Server Error Uncaught Error: MESSAGE at handler …`
 */
function extractSignupErrorMessage(err: unknown): string {
  let raw = "";

  if (err instanceof Error) {
    raw = err.message?.trim() ?? "";
    // Structured app errors: ConvexError carries payload when errorData is present
    if (!raw && "data" in err && (err as { data?: unknown }).data !== undefined) {
      try {
        raw = JSON.stringify((err as { data: unknown }).data);
      } catch {
        raw = String((err as { data: unknown }).data);
      }
    }
    if (!raw?.trim() && err.cause instanceof Error && err.cause.message) {
      raw = err.cause.message.trim();
    }
  }

  if (!raw?.trim()) {
    if (typeof err === "string") raw = err;
    else if (err !== null && typeof err === "object") {
      try {
        raw = JSON.stringify(err);
      } catch {
        raw = String(err);
      }
    } else raw = String(err ?? "");
  }

  raw = raw.trim();
  if (!raw) return "";

  const marker = "Uncaught Error:";
  const idx = raw.indexOf(marker);
  if (idx === -1) return raw;

  let rest = raw.slice(idx + marker.length).trim();
  const m = /\s+at\s+/.exec(rest);
  if (m) {
    const human = rest.slice(0, m.index).trim();
    rest = human.length > 0 ? human : rest;
  }
  return ((rest || raw).trim() || raw).trim();
}

export async function POST(request: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const email = body.email;
    const username = body.username;
    const password = body.password;
    const fullName = body.fullName;
    const phone = body.phone;
    const countryCode = body.countryCode;
    const dob = body.dob;
    const gender = body.gender;
    const country = body.country;
    const preferredLang = body.preferredLang;

    const emailStr = typeof email === "string" ? email.trim() : "";
    const usernameStr = typeof username === "string" ? username.trim() : "";
    const fullNameStr = typeof fullName === "string" ? fullName.trim() : "";
    const passwordStr = typeof password === "string" ? password : "";

    if (!emailStr || !usernameStr || !passwordStr || !fullNameStr) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const phoneTrim = phone == null ? "" : String(phone).trim();
    const phoneDigits = phoneTrim.replace(/\D/g, "");
    // Match SignUpForm (≥6 local digits); full international string must contain enough digits overall.
    if (!phoneTrim || phoneDigits.length < 6) {
      return NextResponse.json(
        {
          error:
            "Enter a valid phone number with country code (too few digits).",
          field: "phone",
        },
        { status: 400 },
      );
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
    const result = await client.action(api.authActions.registerWithEmail, {
      email: emailStr,
      username: usernameStr,
      password: passwordStr,
      fullName: fullNameStr,
      phone: phoneTrim,
      countryCode: typeof countryCode === "string" && countryCode.trim() ? countryCode.trim() : undefined,
      dob: typeof dob === "string" && dob.trim() ? dob.trim() : undefined,
      gender: typeof gender === "string" && gender.trim() ? gender.trim() : undefined,
      country: typeof country === "string" && country.trim() ? country.trim() : undefined,
      preferredLang:
        typeof preferredLang === "string" && preferredLang.trim()
          ? preferredLang.trim()
          : undefined,
    });

    const token = await signToken({
      sub: result.userId,
      email: emailStr.toLowerCase(),
      username: usernameStr,
    });

    const res = NextResponse.json({
      token,
      user: {
        id: result.userId,
        email: emailStr.toLowerCase(),
        username: usernameStr,
      },
    });
    res.cookies.set(COOKIE_NAME, token, makeAuthCookieOptions());
    return res;
  } catch (err: unknown) {
    let message = extractSignupErrorMessage(err).trim();
    if (!message) {
      message =
        "Registration failed. Try: run `npx convex dev`, set `NEXT_PUBLIC_CONVEX_URL` in `.env.local`, and ensure `auth-private.pem` / `AUTH_PRIVATE_KEY` exists for JWT signing.";
    }
    const status = message.includes("already") ? 409 : 400;
    const body: Record<string, string> = { error: message };
    if (message.includes("Email already")) body.field = "email";
    if (message.includes("Username already")) body.field = "username";
    // Dev-only: which deployment answered (must match dashboard URL slug, e.g. calculating-viper-482.convex.cloud)
    if (process.env.NODE_ENV === "development") {
      const url = getConvexDeploymentUrl();
      if (url) {
        try {
          body.debugConvexHost = new URL(url).hostname;
        } catch {
          /* ignore */
        }
      }
      if (err instanceof Error) {
        let dataStr = "";
        if ("data" in err) {
          try {
            dataStr = JSON.stringify((err as { data: unknown }).data);
          } catch {
            dataStr = "[unserializable data]";
          }
        }
        const bits = [err.message, dataStr].filter(Boolean);
        body.debugErrorSnippet = bits.join(" | ").slice(0, 500);
      } else {
        body.debugErrorSnippet = message.slice(0, 400);
      }
    }
    return NextResponse.json(body, { status });
  }
}
