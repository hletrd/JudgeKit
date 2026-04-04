import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Centralized Next.js middleware for auth enforcement.
 *
 * This provides defense-in-depth by checking for session cookies before
 * requests reach dashboard pages or API routes. Full JWT verification
 * still happens in the auth layer; this prevents completely
 * unauthenticated requests from proceeding.
 */

const SESSION_COOKIE_NAMES = [
  "__Secure-authjs.session-token",
  "authjs.session-token",
];

const PUBLIC_PATHS = new Set(["/login", "/change-password"]);

function hasSessionCookie(request: NextRequest): boolean {
  return SESSION_COOKIE_NAMES.some((name) => request.cookies.has(name));
}

/**
 * Best-effort decode of JWT payload to check mustChangePassword flag.
 * Does NOT verify signature — that's done by the auth layer.
 */
function decodeMustChangePassword(request: NextRequest): boolean {
  for (const name of SESSION_COOKIE_NAMES) {
    const cookie = request.cookies.get(name);
    if (!cookie?.value) continue;

    try {
      // JWT is header.payload.signature — we only need the payload
      const parts = cookie.value.split(".");
      if (parts.length < 2) continue;

      const payload = JSON.parse(
        Buffer.from(parts[1], "base64url").toString("utf-8")
      );
      return !!payload.mustChangePassword;
    } catch {
      // If JWT is encrypted (JWE) or malformed, skip — auth layer handles it
      continue;
    }
  }
  return false;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Dashboard pages: require session cookie
  if (pathname.startsWith("/dashboard")) {
    if (!hasSessionCookie(request)) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Redirect users who must change password (best-effort JWT decode)
    if (pathname !== "/change-password" && decodeMustChangePassword(request)) {
      return NextResponse.redirect(new URL("/change-password", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
