import { NextRequest, NextResponse } from "next/server";
import { api, createConvexHttpClient } from "@/lib/convexServer";
import { COOKIE_NAME, verifyToken } from "@/lib/auth/jwt";
import type { Id } from "@convex_app/_generated/dataModel";

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  if (!cookie) {
    return NextResponse.json({ user: null });
  }

  const payload = await verifyToken(cookie);
  if (!payload) {
    return NextResponse.json({ user: null });
  }

  let onboardingCompleted = payload.onboardingCompleted === true;
  if (!onboardingCompleted) {
    try {
      const client = createConvexHttpClient();
      const profile = await client.query(api.users.getById, {
        id: payload.sub as Id<"users">,
      });
      if (
        profile &&
        typeof profile === "object" &&
        "onboardingCompleted" in profile &&
        (profile as { onboardingCompleted?: boolean }).onboardingCompleted === true
      ) {
        onboardingCompleted = true;
      }
    } catch {
      /* ignore */
    }
  }

  return NextResponse.json({
    user: {
      id: payload.sub,
      email: payload.email,
      username: payload.username,
      onboardingCompleted,
    },
  });
}
