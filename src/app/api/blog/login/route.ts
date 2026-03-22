import { NextResponse } from "next/server";
import {
  BLOG_SESSION_COOKIE,
  createSessionToken,
} from "@/lib/blogSession";
import {
  credentialsMatch,
  getBlogAdminAccounts,
} from "@/lib/blogAdminAccounts";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body.email ?? "");
    const password = String(body.password ?? "");

    const accounts = getBlogAdminAccounts();

    if (accounts.length === 0 || !process.env.BLOG_SESSION_SECRET) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Blog admin is not configured on the server. Set BLOG_ADMIN_EMAIL, BLOG_ADMIN_PASSWORD, and BLOG_SESSION_SECRET in Vercel (or your host) environment variables, then redeploy. Optional: BLOG_ADMIN_EMAIL_2 + BLOG_ADMIN_PASSWORD_2, or BLOG_ADMIN_USERS (JSON array).",
        },
        { status: 503 },
      );
    }

    const ok = credentialsMatch(accounts, email, password);
    if (!ok) {
      // Helps debug Vercel: confirm how many accounts loaded (no PII).
      console.warn(
        "[blog/login] failed attempt — configured accounts:",
        accounts.length,
      );
      return NextResponse.json(
        { ok: false, error: "Invalid email or password." },
        { status: 401 },
      );
    }

    const token = createSessionToken();
    const res = NextResponse.json({ ok: true });
    res.cookies.set(BLOG_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });
    return res;
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }
}
