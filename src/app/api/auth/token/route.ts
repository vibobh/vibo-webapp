import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, verifyToken, signToken, makeAuthCookieOptions } from "@/lib/auth/jwt";

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  if (!cookie) {
    return NextResponse.json({ token: null });
  }

  const payload = await verifyToken(cookie);
  if (!payload) {
    const res = NextResponse.json({ token: null });
    res.cookies.set(COOKIE_NAME, "", { ...makeAuthCookieOptions(0) });
    return res;
  }

  const exp = JSON.parse(
    Buffer.from(cookie.split(".")[1], "base64url").toString(),
  ).exp as number;
  const remainingSec = exp - Math.floor(Date.now() / 1000);

  if (remainingSec < 60 * 60 * 24) {
    const freshToken = await signToken(payload);
    const res = NextResponse.json({ token: freshToken });
    res.cookies.set(COOKIE_NAME, freshToken, makeAuthCookieOptions());
    return res;
  }

  return NextResponse.json({ token: cookie });
}
