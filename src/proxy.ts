import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { shouldUseSecureAuthCookie } from "@/lib/auth/secure-cookie";
import { getTokenAuthenticatedAtSeconds } from "@/lib/auth/session-security";
import { getActiveAuthUserById, getTokenUserId } from "@/lib/api/auth";
import { getValidatedAuthSecret, getAuthSessionCookieNames } from "@/lib/security/env";
import { recordAuditEvent, buildAuditRequestContext } from "@/lib/audit/events";
import { usesDeterministicPublicLocale } from "@/lib/public-route-seo";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  LOCALE_QUERY_PARAM,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "@/lib/i18n/constants";

// In-process FIFO cache for proxy auth lookups (Map preserves insertion order;
// eviction deletes the oldest entry first, making this FIFO rather than LRU).
// Security tradeoff: revoked or deactivated users may retain access for up to
// AUTH_CACHE_TTL_MS (default: 2 seconds via AUTH_CACHE_TTL_MS env var) after the change is applied to the database.
// Negative results (user not found / inactive / token invalidated) are NOT cached.
const authUserCache = new Map<string, { user: Awaited<ReturnType<typeof getActiveAuthUserById>>; expiresAt: number }>();
const AUTH_CACHE_TTL_MS = (() => {
  // Cap operator-supplied values at 10 s to bound the post-deactivation
  // access window. An accidental AUTH_CACHE_TTL_MS=3600000 (one hour) would
  // otherwise let a revoked admin keep operating for an hour after their role
  // was downgraded — far longer than the 2 s default contract advertised in
  // the comment above.
  const MAX_TTL_MS = 10_000;
  const parsed = parseInt(process.env.AUTH_CACHE_TTL_MS ?? '2000', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 2000;
  return Math.min(parsed, MAX_TTL_MS);
})();
const AUTH_CACHE_MAX_SIZE = 500;

// Edge Runtime: Buffer is not available; use btoa instead.
function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createNonce() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToBase64(bytes);
}

async function hashUserAgent(userAgent: string) {
  const encoded = new TextEncoder().encode(userAgent);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  return bytesToHex(new Uint8Array(digest)).slice(0, 16);
}

function getCachedAuthUser(cacheKey: string) {
  const cached = authUserCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }
  authUserCache.delete(cacheKey);
  return null;
}

function setCachedAuthUser(cacheKey: string, user: Awaited<ReturnType<typeof getActiveAuthUserById>>) {
  // Clean up expired entries when the cache is nearing capacity to prevent
  // stale entries from bloating the cache when tokens refresh (each refresh
  // creates a new cache key with a different authenticatedAt, leaving the
  // old entry orphaned). Only run cleanup when size >= 90% of max to avoid
  // iterating all entries on every set call under normal load — getCachedAuthUser
  // already cleans up expired entries on read.
  if (authUserCache.size >= Math.floor(AUTH_CACHE_MAX_SIZE * 0.9)) {
    const now = Date.now();
    for (const [key, entry] of authUserCache) {
      if (entry.expiresAt <= now) {
        authUserCache.delete(key);
      }
    }
  }
  // Simple FIFO eviction when the cache is still full after expired entry cleanup
  if (authUserCache.size >= AUTH_CACHE_MAX_SIZE) {
    const firstKey = authUserCache.keys().next().value;
    if (firstKey !== undefined) authUserCache.delete(firstKey);
  }
  authUserCache.set(cacheKey, { user, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
}

function clearAuthSessionCookies(response: NextResponse) {
  // Clear both the non-secure and secure session cookie variants to ensure
  // the session is fully cleared regardless of the current security context.
  // The cookie names are derived from the same source as authConfig so they
  // stay in sync if the naming convention ever changes.
  const { name, secureName } = getAuthSessionCookieNames();
  response.cookies.set(name, "", { maxAge: 0, path: "/" });
  response.cookies.set(secureName, "", { maxAge: 0, path: "/", secure: true });

  return response;
}

function isSupportedLocale(value: string | null | undefined): value is SupportedLocale {
  return Boolean(value && (SUPPORTED_LOCALES as readonly string[]).includes(value));
}

function getPreferredLocaleFromAcceptLanguage(value: string | null): SupportedLocale {
  const preferred = value?.split(",")[0]?.split("-")[0]?.trim();
  return preferred === "ko" ? "ko" : DEFAULT_LOCALE;
}

function resolveExplicitLocale(request: NextRequest): SupportedLocale | null {
  const locale = request.nextUrl.searchParams.get(LOCALE_QUERY_PARAM);
  return isSupportedLocale(locale) ? locale : null;
}

function resolveRequestLocale(request: NextRequest, deterministicPublicLocale: boolean): SupportedLocale {
  const explicitLocale = resolveExplicitLocale(request);
  if (explicitLocale) {
    return explicitLocale;
  }

  if (deterministicPublicLocale) {
    return DEFAULT_LOCALE;
  }

  const cookieLocale = request.cookies.get(LOCALE_COOKIE_NAME)?.value;
  if (isSupportedLocale(cookieLocale)) {
    return cookieLocale;
  }

  return getPreferredLocaleFromAcceptLanguage(request.headers.get("accept-language"));
}

function appendVaryHeader(headers: Headers, value: string) {
  const current = headers.get("Vary");
  if (!current) {
    headers.set("Vary", value);
    return;
  }

  const parts = current
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.includes(value)) {
    headers.set("Vary", [...parts, value].join(", "));
  }
}

function createSecuredNextResponse(request: NextRequest) {
  const nonce = createNonce();
  const isDev = process.env.NODE_ENV === "development";
  const isSignupPage = request.nextUrl.pathname === "/signup";
  const deterministicPublicLocale = usesDeterministicPublicLocale(request.nextUrl.pathname);
  const explicitLocale = resolveExplicitLocale(request);
  const resolvedLocale = resolveRequestLocale(request, deterministicPublicLocale);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  if (explicitLocale) {
    requestHeaders.set("x-locale-override", explicitLocale);
  } else {
    requestHeaders.delete("x-locale-override");
  }
  requestHeaders.set("x-public-locale-mode", deterministicPublicLocale ? "deterministic" : "standard");
  // Next.js 16 RSC bug: X-Forwarded-Host from nginx corrupts RSC streaming
  // during client-side navigation, causing React #300/#310 errors.
  //
  // IMPORTANT SAFETY CONSTRAINT: Auth routes (/api/auth/) are NOT in the
  // proxy matcher (see `config.matcher` below), so they keep this header
  // for proper callback URL resolution via `validateTrustedAuthHost()`.
  // Deleting x-forwarded-host from auth routes would cause UntrustedHost
  // rejections because the fallback `host` header may be the internal
  // container hostname (e.g., localhost:3000) rather than the external
  // domain. See cycle 2 aggregate AGG-1 for historical context.
  // DO NOT add /api/auth/ to the proxy matcher without addressing this.
  requestHeaders.delete("x-forwarded-host");
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set("Content-Language", resolvedLocale);
  // Prevent caching of authenticated API responses at the proxy level.
  // Protected API routes (those requiring auth) must never be cached by
  // intermediary proxies or CDNs. Public API routes (languages, playground)
  // and non-API pages may be cacheable.
  const pathname = request.nextUrl.pathname;
  const isApi = pathname.startsWith("/api/v1");
  const isPublicApi = pathname === "/api/v1/languages" || pathname === "/api/v1/playground/run";
  const isJudgeWorker = pathname.startsWith("/api/v1/judge/");
  if (isApi && !isPublicApi && !isJudgeWorker) {
    response.headers.set("Cache-Control", "no-store");
  }
  if (!deterministicPublicLocale) {
    appendVaryHeader(response.headers, "Accept-Language");
    appendVaryHeader(response.headers, "Cookie");
  }
  if (explicitLocale) {
    response.cookies.set(LOCALE_COOKIE_NAME, explicitLocale, {
      path: "/",
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  const hcaptchaDomains = "https://js.hcaptcha.com https://hcaptcha.com https://*.hcaptcha.com";
  const scriptSrc = isDev
    ? `'self' 'nonce-${nonce}' 'unsafe-eval'${isSignupPage ? ` ${hcaptchaDomains}` : ""}`
    : `'self' 'nonce-${nonce}'${isSignupPage ? ` ${hcaptchaDomains}` : ""}`;

  const csp = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline'${isSignupPage ? " https://hcaptcha.com https://*.hcaptcha.com" : ""}`,
    "font-src 'self' data:",
    "img-src 'self' data: blob:",
    `connect-src 'self'${isSignupPage ? " https://hcaptcha.com https://*.hcaptcha.com" : ""}`,
    `frame-src 'self'${isSignupPage ? " https://hcaptcha.com https://*.hcaptcha.com" : ""}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  if (!isDev) {
    if (request.headers.get("x-forwarded-proto") === "https") {
      response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    } else {
      // Clear any cached HSTS policy for HTTP-only sites
      response.headers.set("Strict-Transport-Security", "max-age=0");
    }
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

  const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/signup");
  const isChangePasswordPage = pathname === "/change-password";
  const isApiRoute = pathname.startsWith("/api/v1");
  const isPublicLanguagesRoute = pathname === "/api/v1/languages";
  const isPublicPlaygroundRunRoute = pathname === "/api/v1/playground/run";
  const isJudgeWorkerRoute = pathname.startsWith("/api/v1/judge/");
  const hasPathPrefix = (prefix: string) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`);
  const isDashboardCompatibilityRoute = hasPathPrefix("/dashboard");
  const isProtectedRoute =
    isDashboardCompatibilityRoute ||
    (isApiRoute && !isJudgeWorkerRoute && !isPublicLanguagesRoute && !isPublicPlaygroundRunRoute);
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

  // SEC-M5: Log suspicious User-Agent mismatch as an audit-only signal.
  // UA changes legitimately on browser updates, responsive mode toggles,
  // corporate proxies, and mobile networks — no hard reject for any role.
  if (token?.uaHash && activeUser) {
    const currentUaHash = await hashUserAgent(request.headers.get("user-agent") ?? "");

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
    // Let API key-bearing requests pass through to route handlers
    // (middleware can't do DB lookups for API key validation in Edge runtime).
    // API key requests with mustChangePassword=true are blocked by the route
    // handler via authenticateApiKey(), which returns a 403. API keys cannot
    // perform web redirects, so proxy-level mustChangePassword enforcement
    // (which redirects to /change-password) is intentionally skipped here.
    const hasApiKeyAuth = isApiRoute && request.headers.get("authorization")?.startsWith("Bearer ");
    if (hasApiKeyAuth) {
      return createSecuredNextResponse(request);
    }

    if (isApiRoute) {
      return clearAuthSessionCookies(
        NextResponse.json({ error: "unauthorized" }, { status: 401 })
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
      return NextResponse.json({ error: "mustChangePassword" }, { status: 403 });
    }

    return NextResponse.redirect(new URL("/change-password", request.url));
  }

  return createSecuredNextResponse(request);
}

export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/practice/:path*",
    "/playground/:path*",
    "/contests/:path*",
    "/community/:path*",
    "/rankings/:path*",
    "/submissions/:path*",
    "/languages/:path*",
    "/users/:path*",
    "/problem-sets/:path*",
    "/api/v1/:path*",
    "/login",
    "/signup",
    "/change-password",
    "/recruit/:path*",
  ],
};
