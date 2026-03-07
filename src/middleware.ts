import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: request.nextUrl.protocol === "https:",
  });

  const isAuthPage = request.nextUrl.pathname.startsWith("/login");
  const isChangePasswordPage = request.nextUrl.pathname === "/change-password";
  const isProtectedRoute =
    request.nextUrl.pathname.startsWith("/dashboard") ||
    request.nextUrl.pathname.startsWith("/api/judge");

  if ((isProtectedRoute || isChangePasswordPage) && !token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthPage && token) {
    if (token.mustChangePassword) {
      return NextResponse.redirect(new URL("/change-password", request.url));
    }
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Force password change: block all dashboard routes
  if (isProtectedRoute && token?.mustChangePassword) {
    return NextResponse.redirect(new URL("/change-password", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/judge/:path*", "/login", "/change-password"],
};
