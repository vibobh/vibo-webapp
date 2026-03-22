import { NextResponse } from "next/server";
import {
  BLOG_SESSION_COOKIE,
  createSessionToken,
} from "@/lib/blogSession";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");

    const adminEmail = process.env.BLOG_ADMIN_EMAIL?.trim().toLowerCase();
    const adminPass = process.env.BLOG_ADMIN_PASSWORD;

    if (!adminEmail || !adminPass || !process.env.BLOG_SESSION_SECRET) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Blog admin is not configured on the server. Set BLOG_ADMIN_EMAIL, BLOG_ADMIN_PASSWORD, and BLOG_SESSION_SECRET in Vercel (or your host) environment variables, then redeploy.",
        },
        { status: 503 },
      );
    }

    if (email !== adminEmail || password !== adminPass) {
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
