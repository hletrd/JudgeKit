import { NextRequest, NextResponse } from "next/server";
import { getAuthUrlObject } from "@/lib/security/env";
import { logger } from "@/lib/logger";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function getExpectedHost(request: NextRequest) {
  const authUrl = getAuthUrlObject();
  if (authUrl) {
    return authUrl.host;
  }
  // In production, refuse to fall back to request headers — AUTH_URL must be configured.
  if (process.env.NODE_ENV === "production") {
    return null;
  }
  return request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? request.headers.get("host")?.trim() ?? null;
}

/**
 * Validates CSRF protection for state-changing requests.
 * Requires the `X-Requested-With` header to be present on
 * non-safe methods (POST, PATCH, PUT, DELETE).
 *
 * This prevents cross-origin form submissions while keeping
 * the API usable from JavaScript clients (fetch/XHR always
 * allow setting custom headers; HTML forms do not).
 *
 * Returns null if the request passes, or a 403 response if blocked.
 */
export function validateCsrf(request: NextRequest): NextResponse | null {
  if (SAFE_METHODS.has(request.method)) {
    return null;
  }

  const xRequestedWith = request.headers.get("x-requested-with");
  const secFetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  const origin = request.headers.get("origin")?.trim();
  const expectedHost = getExpectedHost(request);

  if (xRequestedWith !== "XMLHttpRequest") {
    return NextResponse.json(
      { error: "csrfValidationFailed" },
      { status: 403 }
    );
  }

  if (
    secFetchSite &&
    secFetchSite !== "same-origin" &&
    secFetchSite !== "same-site" &&
    secFetchSite !== "none"
  ) {
    return NextResponse.json({ error: "csrfValidationFailed" }, { status: 403 });
  }

  if (origin && expectedHost) {
    // Reject origins that don't start with http:// or https:// — this blocks
    // protocol-relative origins and other malformed values before URL parsing.
    if (!/^https?:\/\//i.test(origin)) {
      logger.warn({ origin }, "[csrf] origin missing http/https protocol, rejecting request");
      return NextResponse.json({ error: "csrfValidationFailed" }, { status: 403 });
    }
    try {
      if (new URL(origin).host !== expectedHost) {
        return NextResponse.json({ error: "csrfValidationFailed" }, { status: 403 });
      }
    } catch (err) {
      logger.warn({ err, origin }, "[csrf] invalid origin URL, rejecting request");
      return NextResponse.json({ error: "csrfValidationFailed" }, { status: 403 });
    }
  }

  return null;
}
