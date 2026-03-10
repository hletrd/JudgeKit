import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { shouldUseSecureAuthCookie } from "@/lib/auth/secure-cookie";
import { getTokenAuthenticatedAtSeconds } from "@/lib/auth/session-security";
import { getActiveAuthUserById, getTokenUserId } from "@/lib/api/auth";
import { getValidatedAuthSecret } from "@/lib/security/env";

function clearAuthSessionCookies(response: NextResponse) {
  response.cookies.delete("authjs.session-token");
  response.cookies.delete("__Secure-authjs.session-token");

  return response;
}

function createSecuredNextResponse(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  const scriptSrc = isDev
    ? `'self' 'nonce-${nonce}' 'unsafe-eval'`
    : `'self' 'nonce-${nonce}'`;

  const csp = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline' 'nonce-${nonce}'`,
    "font-src 'self' data:",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");

  response.headers.set("Content-Security-Policy", csp);

  return response;
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const token = await getToken({
    req: request,
    secret: getValidatedAuthSecret(),
    secureCookie: shouldUseSecureAuthCookie(),
  });

  const isAuthPage = pathname.startsWith("/login");
  const isChangePasswordPage = pathname === "/change-password";
  const isApiRoute = pathname.startsWith("/api/v1");
  const isPublicLanguagesRoute = pathname === "/api/v1/languages";
  const isJudgeWorkerRoute = pathname.startsWith("/api/v1/judge/");
  const isProtectedRoute =
    pathname.startsWith("/dashboard") ||
    (isApiRoute && !isJudgeWorkerRoute && !isPublicLanguagesRoute);
  const shouldRefreshAuthState = Boolean(token) && (isProtectedRoute || isChangePasswordPage || isAuthPage);
  const activeUser = shouldRefreshAuthState
    ? await getActiveAuthUserById(
        getTokenUserId(token),
        getTokenAuthenticatedAtSeconds(token)
      )
    : null;

  if (isAuthPage && token && !activeUser) {
    return clearAuthSessionCookies(createSecuredNextResponse(request));
  }

  if ((isProtectedRoute || isChangePasswordPage) && !activeUser) {
    if (isApiRoute) {
      return clearAuthSessionCookies(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      );
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
    return clearAuthSessionCookies(NextResponse.redirect(loginUrl));
  }

  if (isAuthPage && activeUser) {
    if (activeUser.mustChangePassword) {
      return NextResponse.redirect(new URL("/change-password", request.url));
    }

    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (isProtectedRoute && activeUser?.mustChangePassword) {
    if (isApiRoute) {
      return NextResponse.json({ error: "Password change required" }, { status: 403 });
    }

    return NextResponse.redirect(new URL("/change-password", request.url));
  }

  return createSecuredNextResponse(request);
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/v1/:path*", "/login", "/change-password"],
};
