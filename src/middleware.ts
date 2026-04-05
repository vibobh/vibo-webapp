import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase() || "";
  const { pathname, search } = request.nextUrl;

  // Serve help center on the subdomain (rewrite keeps help.joinvibo.com in the URL bar).
  if (host.startsWith("help.joinvibo.com")) {
    const url = request.nextUrl.clone();
    url.pathname = `/help${pathname === "/" ? "" : pathname}`;
    url.search = search;
    return NextResponse.rewrite(url);
  }

  // Send legacy subdomain to the main site path (avoids extra DNS/hosting on businesses.*).
  if (host.startsWith("businesses.joinvibo.com")) {
    const dest = new URL("https://joinvibo.com/businesses");
    dest.search = search;
    return NextResponse.redirect(dest, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|robots.txt|sitemap.xml|api).*)"],
};

