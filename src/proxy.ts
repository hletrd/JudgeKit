import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { shouldUseSecureAuthCookie } from "@/lib/auth/secure-cookie";
import { getTokenAuthenticatedAtSeconds } from "@/lib/auth/session-security";
import { getActiveAuthUserById, getTokenUserId } from "@/lib/api/auth";
import { getValidatedAuthSecret } from "@/lib/security/env";
import { recordAuditEvent, buildAuditRequestContext } from "@/lib/audit/events";
import crypto from "crypto";

// In-process LRU cache for proxy auth lookups.
// Security tradeoff: revoked or deactivated users may retain access for up to
// AUTH_CACHE_TTL_MS (2 seconds) after the change is applied to the database.
// Negative results (user not found / inactive / token invalidated) are NOT cached.
const authUserCache = new Map<string, { user: Awaited<ReturnType<typeof getActiveAuthUserById>>; expiresAt: number }>();
const AUTH_CACHE_TTL_MS = 2_000; // 2 seconds
const AUTH_CACHE_MAX_SIZE = 500;

function getCachedAuthUser(cacheKey: string) {
  const cached = authUserCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }
  authUserCache.delete(cacheKey);
  return null;
}

function setCachedAuthUser(cacheKey: string, user: Awaited<ReturnType<typeof getActiveAuthUserById>>) {
  // Simple FIFO eviction when the cache is full
  if (authUserCache.size >= AUTH_CACHE_MAX_SIZE) {
    const firstKey = authUserCache.keys().next().value;
    if (firstKey !== undefined) authUserCache.delete(firstKey);
  }
  authUserCache.set(cacheKey, { user, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
}

function clearAuthSessionCookies(response: NextResponse) {
  response.cookies.delete("authjs.session-token");
  response.cookies.delete("__Secure-authjs.session-token");

  return response;
}

function createSecuredNextResponse(request: NextRequest) {
  const nonce = crypto.randomBytes(16).toString("base64");
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
    `style-src 'self' 'unsafe-inline'`,
    "font-src 'self' data:",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");

  response.headers.set("Content-Security-Policy", csp);

  if (!isDev) {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

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
  let activeUser: Awaited<ReturnType<typeof getActiveAuthUserById>> = null;
  if (shouldRefreshAuthState) {
    const userId = getTokenUserId(token);
    const authenticatedAtSeconds = getTokenAuthenticatedAtSeconds(token);
    // Build a cache key that incorporates authenticatedAt so that token
    // invalidation (password change / forced logout) is reflected promptly.
    const cacheKey = `${userId}:${authenticatedAtSeconds ?? ""}`;
    activeUser = getCachedAuthUser(cacheKey);
    if (!activeUser) {
      activeUser = await getActiveAuthUserById(userId, authenticatedAtSeconds);
      if (activeUser) setCachedAuthUser(cacheKey, activeUser);
    }
  }

  // SEC2-L1: Log suspicious User-Agent mismatch as a session binding signal.
  // Hard-rejection is intentionally omitted — UA changes legitimately on browser
  // updates, corporate proxies, and mobile networks.
  if (token?.uaHash && activeUser) {
    const currentUaHash = crypto
      .createHash("sha256")
      .update(request.headers.get("user-agent") ?? "")
      .digest("hex")
      .slice(0, 16);

    if (token.uaHash !== currentUaHash) {
      recordAuditEvent({
        actorId: getTokenUserId(token),
        actorRole: token.role,
        action: "suspicious_ua_mismatch",
        resourceType: "session",
        summary: "Request User-Agent does not match the UA recorded at sign-in",
        details: { storedUaHash: token.uaHash, currentUaHash },
        context: buildAuditRequestContext(request),
      });
    }
  }

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
