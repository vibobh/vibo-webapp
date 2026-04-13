import { NextResponse } from "next/server";
import { getJwks } from "@/lib/auth/jwt";

/** Keys are not available at Vercel build time; skip static prerender of this handler. */
export const dynamic = "force-dynamic";

export async function GET() {
  const jwks = await getJwks();
  return NextResponse.json(jwks, {
    headers: {
      "Cache-Control": "public, max-age=86400",
    },
  });
}
