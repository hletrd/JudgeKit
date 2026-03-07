import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { shouldUseSecureAuthCookie } from "@/lib/auth/secure-cookie";
import { getActiveAuthUserById, getTokenUserId } from "@/lib/api/auth";
import { getValidatedAuthSecret } from "@/lib/security/env";

function clearAuthSessionCookies(response: NextResponse) {
  response.cookies.delete("authjs.session-token");
  response.cookies.delete("__Secure-authjs.session-token");

  return response;
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const token = await getToken({
    req: request,
    secret: getValidatedAuthSecret(),
    secureCookie: shouldUseSecureAuthCookie(request),
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
    ? await getActiveAuthUserById(getTokenUserId(token))
    : null;

  if (isAuthPage && token && !activeUser) {
    return clearAuthSessionCookies(NextResponse.next());
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

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/v1/:path*", "/login", "/change-password"],
};
