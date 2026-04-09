import { logger } from "@/lib/logger";

type HeaderCarrier = {
  get(name: string): string | null;
};

const TRUSTED_PROXY_HOPS = Math.max(
  1,
  parseInt(process.env.TRUSTED_PROXY_HOPS || "1", 10) || 1
);

function isValidIp(value: string) {
  const candidate = value.trim();
  if (!candidate) return false;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(candidate)) {
    return candidate.split(".").every((part) => {
      const number = Number(part);
      return Number.isInteger(number) && number >= 0 && number <= 255;
    });
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

export function extractClientIp(headers: HeaderCarrier) {
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
    // If there are fewer entries than expected, fall back to the first entry.
    if (parts.length > 0) {
      const clientIndex = Math.max(0, parts.length - (TRUSTED_PROXY_HOPS + 1));
      const candidate = parts[clientIndex];
      if (isValidIp(candidate)) {
        return candidate;
      }
      // Extracted value is not a valid IP — fall through to fallbacks
    }
  }

  // Only trust X-Real-IP when XFF is absent (avoids bypassing hop validation)
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp && isValidIp(realIp)) {
    return realIp;
  }

  if (process.env.NODE_ENV === "production" && !forwardedFor) {
    logger.warn("[security] No X-Forwarded-For header in production — ensure a trusted reverse proxy is configured");
  }

  return "0.0.0.0";
}
