import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase() || "";
  const { pathname, search } = request.nextUrl;
  const authToken = request.cookies.get("vibo_auth_token")?.value;

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

  // Authenticated app surfaces (feed, profile, settings, chats, etc.).
  // Static prefixes — protect both `/x` and `/x/...`.
  const PROTECTED_PREFIXES = [
    "/profile",
    "/settings",
    "/messages",
    "/message",
    "/messages-inbox",
    "/activity",
    "/connections",
    "/followers",
    "/following",
    "/follow-requests",
    "/explore",
    "/videos",
    "/search",
    "/create-post",
    "/post-detail",
    "/post-composer",
    "/post-editor",
    "/profile-post-feed",
    "/camera-capture",
    "/caption-editor",
    "/location-picker",
    "/story-camera",
    "/story-gallery",
    "/story-editor",
    "/story-viewer",
    "/change-password",
  ];

  // Single-segment routes that are publicly accessible (marketing, auth, help, etc.).
  const PUBLIC_ROOT_SEGMENTS = new Set([
    "about",
    "aboutus",
    "blogs",
    "businesses",
    "careers",
    "help",
    "login",
    "mangment",
    "newsroom",
    "signup",
    "terms",
  ]);

  const isProtectedStatic = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  // Profile-by-username: any single-segment path that isn't a known public
  // root (about, blogs, login, …) is treated as a `/{username}` profile route.
  const segments = pathname.split("/").filter(Boolean);
  const looksLikeProfileSegment =
    segments.length === 1 && !PUBLIC_ROOT_SEGMENTS.has(segments[0]);

  const needsAuth = pathname === "/" || isProtectedStatic || looksLikeProfileSegment;

  if (needsAuth && !authToken) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = search;
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|robots.txt|sitemap.xml|api).*)"],
};

