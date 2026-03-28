import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Next.js 16 RSC bug: Host/X-Forwarded-Host headers from nginx corrupt
  // React Server Component streaming during client-side navigation, causing
  // React #300/#310 errors. Strip these headers for non-auth routes so the
  // page renderer doesn't use them for RSC payload generation.
  // Auth routes keep the headers for proper callback URL resolution.
  if (!request.nextUrl.pathname.startsWith("/api/auth")) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.delete("x-forwarded-host");
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all routes except static files and _next
    "/((?!_next/static|_next/image|favicon.ico|icon.svg).*)",
  ],
};
