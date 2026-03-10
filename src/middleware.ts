import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Public API routes that don't require session auth
// (these use their own auth mechanisms, e.g. Bearer token)
const PUBLIC_API_ROUTES = [
  "/api/health",
  "/api/v1/judge/poll",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip public API routes
  if (PUBLIC_API_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Auth.js session token — name depends on whether secure cookies are enabled
  const sessionCookie =
    request.cookies.get("authjs.session-token") ??
    request.cookies.get("__Secure-authjs.session-token");

  if (!sessionCookie) {
    // API routes: return 401 JSON
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // Dashboard routes: redirect to login with callbackUrl
    if (pathname.startsWith("/dashboard")) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/api/v1/:path*",
  ],
};
