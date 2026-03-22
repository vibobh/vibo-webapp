import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { BLOG_SESSION_COOKIE, verifySessionToken } from "@/lib/blogSession";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = cookies().get(BLOG_SESSION_COOKIE)?.value;
  const ok = verifySessionToken(token);
  return NextResponse.json({ ok });
}
