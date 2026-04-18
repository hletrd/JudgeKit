import { logger } from "@/lib/logger";

/**
 * Shared helper for validating post-auth callbackUrl values.
 *
 * Accepts only same-origin path-absolute URLs. Rejects every known
 * open-redirect variant that has slipped through naive startsWith('/')
 * checks in the past:
 *   - scheme/protocol prefixes (http:, javascript:, data:)
 *   - protocol-relative (//evil.com)
 *   - backslash-normalized authority (/\evil.com, /\\evil.com)
 *   - user-info authority via @ (/@evil.com/…)
 *   - CR/LF header-injection attempts
 *
 * The helper returns /dashboard whenever the callback cannot be proven
 * safe, so the auth flow degrades to the default landing page instead of
 * an attacker-controlled URL.
 */

export const DEFAULT_POST_AUTH_REDIRECT = "/dashboard";

export function getSafeRedirectUrl(callbackUrl: string | null | undefined): string {
  if (!callbackUrl) return DEFAULT_POST_AUTH_REDIRECT;

  // Strip CR/LF and other control characters. These have no place in a
  // path and would otherwise enable CRLF injection downstream.
  // eslint-disable-next-line no-control-regex
  const clean = callbackUrl.replace(/[\x00-\x1f\x7f]/g, "");

  if (clean.length === 0) return DEFAULT_POST_AUTH_REDIRECT;

  // Must be path-absolute. Reject scheme-bearing or protocol-relative URLs.
  if (!clean.startsWith("/")) return DEFAULT_POST_AUTH_REDIRECT;
  if (clean.startsWith("//")) return DEFAULT_POST_AUTH_REDIRECT;

  // Reject backslash-prefix tricks that some browsers normalize to a
  // protocol-relative URL (e.g. "/\evil.com" -> "//evil.com").
  if (clean.startsWith("/\\")) return DEFAULT_POST_AUTH_REDIRECT;

  // Reject the "path begins with user-info authority" trick:
  // "/@evil.com/..." can resolve to an attacker-controlled host in some
  // URL parsers. A leading "@" in the first segment is never legitimate
  // for a path-absolute callback.
  if (clean.startsWith("/@")) return DEFAULT_POST_AUTH_REDIRECT;

  // Final parse against a placeholder origin to ensure resolution stays
  // same-origin and has no userinfo authority.
  try {
    const resolved = new URL(clean, "https://placeholder.invalid");
    if (resolved.origin !== "https://placeholder.invalid") {
      return DEFAULT_POST_AUTH_REDIRECT;
    }
    if (resolved.username.length > 0 || resolved.password.length > 0) {
      return DEFAULT_POST_AUTH_REDIRECT;
    }
  } catch (err) {
    logger.warn({ err, callbackUrl }, "[redirect] failed to parse callbackUrl, using default");
    return DEFAULT_POST_AUTH_REDIRECT;
  }

  return clean;
}
