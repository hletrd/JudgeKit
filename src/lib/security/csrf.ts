import { NextRequest, NextResponse } from "next/server";
import { getTrustedAuthHosts, normalizeHostForComparison } from "@/lib/security/env";
import { logger } from "@/lib/logger";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

async function getExpectedHosts(request: NextRequest) {
  const trustedHosts = await getTrustedAuthHosts();
  if (trustedHosts.size > 0) {
    return trustedHosts;
  }

  // In production, refuse to fall back to request headers — AUTH_URL must be configured.
  if (process.env.NODE_ENV === "production") {
    return new Set<string>();
  }

  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    request.headers.get("host")?.trim() ??
    null;

  if (host) {
    const set = new Set<string>();
    set.add(normalizeHostForComparison(host));
    return set;
  }

  return new Set<string>();
}

/**
 * Validates CSRF protection for state-changing requests via THREE layered
 * checks — all applicable checks must pass (a failure on any one returns 403;
 * they are NOT alternatives). (1) `X-Requested-With: XMLHttpRequest` is
 * REQUIRED (HTML forms cannot set custom headers, so this is the CSRF
 * boundary); a missing/mismatched value is rejected before the other checks
 * run. (2) When `Sec-Fetch-Site` is present, it must be same-origin/same-site/
 * none. (3) When `Origin` is present, the origin host must match one of the
 * trusted hosts (AUTH_URL plus the DB/system `allowedHosts` list). Applies to
 * non-safe methods (POST, PATCH, PUT, DELETE).
 *
 * This prevents cross-origin form submissions while keeping the API usable
 * from JavaScript clients (fetch/XHR always allow setting custom headers;
 * HTML forms do not).
 *
 * Returns null if the request passes, or a 403 response if blocked.
 */
export async function validateCsrf(request: NextRequest): Promise<NextResponse | null> {
  if (SAFE_METHODS.has(request.method)) {
    return null;
  }

  const xRequestedWith = request.headers.get("x-requested-with");
  const secFetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  const origin = request.headers.get("origin")?.trim();
  const expectedHosts = await getExpectedHosts(request);

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

  if (origin && expectedHosts.size > 0) {
    // Reject origins that don't start with http:// or https:// — this blocks
    // protocol-relative origins and other malformed values before URL parsing.
    if (!/^https?:\/\//i.test(origin)) {
      logger.warn({ origin }, "[csrf] origin missing http/https protocol, rejecting request");
      return NextResponse.json({ error: "csrfValidationFailed" }, { status: 403 });
    }
    try {
      if (!expectedHosts.has(normalizeHostForComparison(new URL(origin).host))) {
        return NextResponse.json({ error: "csrfValidationFailed" }, { status: 403 });
      }
    } catch (err) {
      logger.warn({ err, origin }, "[csrf] invalid origin URL, rejecting request");
      return NextResponse.json({ error: "csrfValidationFailed" }, { status: 403 });
    }
  }

  return null;
}
