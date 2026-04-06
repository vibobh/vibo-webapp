import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase() || "";
  const { pathname, search } = request.nextUrl;

  // Serve help center on the subdomain (rewrite keeps help.joinvibo.com in the URL bar).
  if (host.startsWith("help.joinvibo.com")) {
    // Do not rewrite public assets: /help/images/... would 404 (images live at /images/...).
    const isPublicAsset =
      pathname.startsWith("/images/") ||
      pathname.startsWith("/videos/") ||
      /\.(ico|png|jpg|jpeg|gif|webp|svg|mp4|webm|woff2?|txt|xml)$/i.test(
        pathname,
      );
    if (isPublicAsset) {
      return NextResponse.next();
    }
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

