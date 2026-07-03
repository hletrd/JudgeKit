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

/**
 * Canonicalize a valid IPv6 address to RFC 5952 form (lowercase hex, no
 * leading zeros, `::` for the longest run of all-zero groups). Returns null
 * for invalid or ambiguously compressed addresses so that spoofed/malformed
 * strings cannot create multiple rate-limit buckets or allowlist bypasses.
 */
function canonicalizeIpv6(value: string): string | null {
  // Strip optional brackets and zone identifier (e.g. [fe80::1%eth0]).
  let cleaned = value.trim();
  if (cleaned.startsWith("[") && cleaned.endsWith("]")) {
    cleaned = cleaned.slice(1, -1);
  }
  const zoneIndex = cleaned.indexOf("%");
  if (zoneIndex >= 0) cleaned = cleaned.slice(0, zoneIndex);

  if (!/^[0-9a-fA-F:]+$/.test(cleaned) || !cleaned.includes(":")) return null;

  // RFC 5952: at most one "::".
  const doubleColonCount = (cleaned.match(/::/g) ?? []).length;
  if (doubleColonCount > 1) return null;

  let head: string[];
  let tail: string[];
  if (doubleColonCount === 1) {
    const [headRaw, tailRaw] = cleaned.split("::");
    head = headRaw === "" ? [] : headRaw.split(":");
    tail = tailRaw === "" ? [] : tailRaw.split(":");
  } else {
    head = cleaned.split(":");
    tail = [];
  }

  const totalGroups = head.length + tail.length;
  if (totalGroups > 8) return null;
  if (doubleColonCount === 0 && totalGroups !== 8) return null;

  const groups: string[] = [];
  for (const segment of head) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(segment)) return null;
    groups.push(parseInt(segment, 16).toString(16));
  }
  for (let i = totalGroups; i < 8; i++) groups.push("0");
  for (const segment of tail) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(segment)) return null;
    groups.push(parseInt(segment, 16).toString(16));
  }
  if (groups.length !== 8) return null;

  // Find the longest run of zero groups for :: compression.
  // Ties are broken by the first run, per RFC 5952 recommendation.
  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;
  let curLen = 0;
  for (let i = 0; i < groups.length; i++) {
    if (groups[i] === "0") {
      if (curStart === -1) curStart = i;
      curLen++;
    } else {
      if (curLen > bestLen) {
        bestLen = curLen;
        bestStart = curStart;
      }
      curStart = -1;
      curLen = 0;
    }
  }
  if (curLen > bestLen) {
    bestLen = curLen;
    bestStart = curStart;
  }

  if (bestLen >= 2 && bestStart !== -1) {
    const prefix = groups.slice(0, bestStart).join(":");
    const suffix = groups.slice(bestStart + bestLen).join(":");
    if (prefix === "" && suffix === "") return "::";
    if (prefix === "") return `::${suffix}`;
    if (suffix === "") return `${prefix}::`;
    return `${prefix}::${suffix}`;
  }

  return groups.join(":");
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
  return canonicalizeIpv6(candidate) !== null;
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

    // Extract the client IP from the end of the X-Forwarded-For chain based on
    // the number of trusted proxy hops. Each trusted proxy appends the IP of
    // the peer that connected to it, so with N trusted proxies the client IP is
    // the Nth-from-last entry (i.e. the entry added by the first trusted proxy).
    //
    // Examples with standard nginx (`$proxy_add_x_forwarded_for`):
    //   - client -> nginx -> app (TRUSTED_PROXY_HOPS=1):
    //     XFF = "client" => client index = 0
    //   - client -> cdn -> nginx -> app (TRUSTED_PROXY_HOPS=2):
    //     XFF = "client, cdn" => client index = 0
    //   - attacker spoofs XFF="evil", then cdn -> nginx -> app (TRUSTED_PROXY_HOPS=2):
    //     XFF = "evil, client, cdn" => client index = 1 (the real client)
    //
    // SEC H-5: If the chain has fewer entries than expected, the missing entries
    // are client-controllable. Refuse to trust the header; callers get null (or
    // the dev sentinel) so rate-limit / audit code does not key on spoofable data.
    const trustedHops = getTrustedProxyHops();
    // SEC-8: TRUSTED_PROXY_HOPS=0 means "no trusted proxies" — every XFF entry
    // is client-controlled, so we must not trust any of them. Without this guard,
    // `parts.length >= 0` is true for any XFF and `parts.length - 0` would select
    // the last (spoofable) entry.
    if (trustedHops > 0 && parts.length >= trustedHops) {
      const clientIndex = parts.length - trustedHops;
      const candidate = parts[clientIndex];
      if (isValidIp(candidate)) {
        // Unwrap IPv4-mapped IPv6 to its dotted IPv4 and canonicalize pure
        // IPv6 so rate-limit buckets and allowlist entries are stable.
        return unwrapMappedIpv4(candidate) ?? canonicalizeIpv6(candidate) ?? candidate;
      }
    } else if (parts.length > 0 && process.env.NODE_ENV === "production") {
      logger.warn(
        { xffHopsExpected: trustedHops, xffHopsObserved: parts.length, xff: forwardedFor },
        "[security] X-Forwarded-For has fewer hops than TRUSTED_PROXY_HOPS expects — refusing to trust client-supplied IP (possible spoofing)",
      );
    }
  }

  // Only trust X-Real-IP when XFF is absent (avoids bypassing hop validation).
  const realIp = headers.get("x-real-ip")?.trim();
  if (!forwardedFor && realIp && isValidIp(realIp)) {
    return unwrapMappedIpv4(realIp) ?? canonicalizeIpv6(realIp) ?? realIp;
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
