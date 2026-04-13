import { NextResponse } from "next/server";
import { COOKIE_NAME, makeAuthCookieOptions } from "@/lib/auth/jwt";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", { ...makeAuthCookieOptions(0) });
  return res;
}
