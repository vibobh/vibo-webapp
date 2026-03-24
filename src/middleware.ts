import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase() || "";

  // Route businesses.joinvibo.com to the business landing page.
  if (host.startsWith("businesses.joinvibo.com")) {
    const { pathname, search } = request.nextUrl;

    if (pathname === "/") {
      return NextResponse.rewrite(new URL(`/businesses${search}`, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|robots.txt|sitemap.xml|api).*)"],
};

