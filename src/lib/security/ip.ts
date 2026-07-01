import { logger } from "@/lib/logger";

type HeaderCarrier = {
  get(name: string): string | null;
};

// Resolve TRUSTED_PROXY_HOPS at call time so test-runner stubbing
// (vi.stubEnv("TRUSTED_PROXY_HOPS", ...)) takes effect without forcing
// every spec to reset module imports. In production the env var is set
// once at process start so the lookup is effectively free.
function getTrustedProxyHops(): number {
  const parsed = parseInt(process.env.TRUSTED_PROXY_HOPS ?? "1", 10);
  // Use ?? so TRUSTED_PROXY_HOPS=0 is respected (means "no trusted proxies").
  // Fall back to 1 only when the env var is unset or parseInt returns NaN.
  return Number.isNaN(parsed) ? 1 : Math.max(0, parsed);
}

function isValidIpv4(value: string): boolean {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return false;
  return value.split(".").every((part) => {
    // Reject leading-zero octets (e.g. "01") to keep canonical form.
    // The single digit "0" is the only allowed zero-prefixed octet.
    if (part.length > 1 && part.startsWith("0")) return false;
    const number = Number(part);
    return Number.isInteger(number) && number >= 0 && number <= 255;
  });
}

/**
 * Normalize an IPv4-mapped IPv6 address (`::ffff:a.b.c.d`) to its plain dotted
 * IPv4 form. A dual-stack reverse proxy listening on `[::]` reports IPv4 clients
 * via `$remote_addr` in this mapped form, which would otherwise fail both the
 * dotted-quad and the pure-hex IPv6 validators below. Returning the unwrapped
 * IPv4 keeps `extractClientIp` consistent with the allowlist matcher in
 * `judge/ip-allowlist.ts` (which already unwraps the embedded-v4 tail) and with
 * the rate-limit key derivation. Returns null when the input is not a mapped
 * IPv4-in-IPv6 address.
 */
export function unwrapMappedIpv4(value: string): string | null {
  const match = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(value.trim());
  if (!match) return null;
  return isValidIpv4(match[1]) ? match[1] : null;
}

function isValidIp(value: string) {
  const candidate = value.trim();
  if (!candidate) return false;
  if (isValidIpv4(candidate)) {
    return true;
  }
  // Accept IPv4-mapped IPv6 (`::ffff:a.b.c.d`) by validating its IPv4 tail.
  if (unwrapMappedIpv4(candidate) !== null) {
    return true;
  }

  const stripped = candidate.startsWith("[") && candidate.endsWith("]")
    ? candidate.slice(1, -1)
    : candidate;

  if (!/^[0-9a-fA-F:]+$/.test(stripped) || !stripped.includes(":")) {
    return false;
  }

  const segments = stripped.split(":");
  if (segments.length > 8) return false;
  const emptySegments = segments.filter((segment) => segment === "").length;
  if (emptySegments > 2) return false;
  return segments.every((segment) => segment === "" || /^[0-9a-fA-F]{1,4}$/.test(segment));
}

export function extractClientIp(headers: HeaderCarrier): string | null {
  const forwardedFor = headers.get("x-forwarded-for");

  // Process X-Forwarded-For first with hop validation to prevent spoofing.
  // X-Real-IP is only used as fallback when XFF is absent (single-proxy setups).
  if (forwardedFor) {
    const parts = forwardedFor
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    // Extract the Nth-from-last value based on trusted proxy hop count.
    // With TRUSTED_PROXY_HOPS=1 (one reverse proxy), the client IP is
    // the last-but-one entry; the final entry is the proxy itself.
    //
    // SEC H-5: If the chain has fewer entries than expected (e.g. a single
    // element when we expect at least 2), the missing hop is client-
    // controllable — Nginx normally appends the connecting IP, but if XFF
    // is forwarded through and Nginx is misconfigured (no
    // `set_real_ip_from` + `real_ip_recursive on`), the attacker's claim
    // is at parts[0] and we'd trust it. Refuse to fall back; the caller
    // gets null and downstream code can degrade to per-IP rate-limit by
    // request socket or treat the request as unknown.
    const trustedHops = getTrustedProxyHops();
    // SEC-8: TRUSTED_PROXY_HOPS=0 means "no trusted proxies" — every XFF
    // entry is client-controlled, so we must not trust any of them. Without
    // this guard, `parts.length >= 0 + 1` is true for any XFF and
    // `clientIndex = parts.length - 1` selects the last (spoofable) entry.
    // Because X-Real-IP is also header-provided in this abstraction, a present
    // but untrusted XFF chain must return unknown rather than falling through
    // to another spoofable header.
    if (trustedHops > 0 && parts.length >= trustedHops + 1) {
      const clientIndex = parts.length - (trustedHops + 1);
      const candidate = parts[clientIndex];
      if (isValidIp(candidate)) {
        // Unwrap IPv4-mapped IPv6 to its dotted IPv4 so the allowlist matcher
        // and rate-limit keys see a stable, canonical form.
        return unwrapMappedIpv4(candidate) ?? candidate;
      }
    } else if (parts.length > 0 && process.env.NODE_ENV === "production") {
      logger.warn(
        { xffHopsExpected: trustedHops + 1, xffHopsObserved: parts.length, xff: forwardedFor },
        "[security] X-Forwarded-For has fewer hops than TRUSTED_PROXY_HOPS expects — refusing to trust client-supplied IP (possible spoofing)",
      );
    }
  }

  // Only trust X-Real-IP when XFF is absent (avoids bypassing hop validation).
  const realIp = headers.get("x-real-ip")?.trim();
  if (!forwardedFor && realIp && isValidIp(realIp)) {
    return unwrapMappedIpv4(realIp) ?? realIp;
  }

  if (process.env.NODE_ENV === "production" && !forwardedFor) {
    logger.warn("[security] No X-Forwarded-For header in production — ensure a trusted reverse proxy is configured");
  }

  // In production a null result means "client IP undeterminable"; downstream
  // consumers must treat it as such (e.g. judge/ip-allowlist.ts denies when an
  // allowlist is configured, rate-limit keying degrades to a coarse bucket).
  // The dev-only "0.0.0.0" sentinel is likewise special-cased as "unknown" by
  // isJudgeIpAllowed; keep these two call sites in sync if the sentinel changes.
  return process.env.NODE_ENV === "production" ? null : "0.0.0.0";
}
