import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase() || "";

  // Send legacy subdomain to the main site path (avoids extra DNS/hosting on businesses.*).
  if (host.startsWith("businesses.joinvibo.com")) {
    const dest = new URL("https://joinvibo.com/businesses");
    dest.search = request.nextUrl.search;
    return NextResponse.redirect(dest, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|robots.txt|sitemap.xml|api).*)"],
};

