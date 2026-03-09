type HeaderCarrier = {
  get(name: string): string | null;
};

const TRUSTED_PROXY_HOPS = Math.max(
  1,
  parseInt(process.env.TRUSTED_PROXY_HOPS || "1", 10) || 1
);

export function extractClientIp(headers: HeaderCarrier) {
  const forwardedFor = headers.get("x-forwarded-for");
  const realIp = headers.get("x-real-ip")?.trim();

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
      const clientIndex = Math.max(0, parts.length - TRUSTED_PROXY_HOPS);
      return parts[clientIndex];
    }
  }

  if (realIp) {
    return realIp;
  }

  if (process.env.NODE_ENV === "production" && !forwardedFor) {
    console.warn(
      "[security] No X-Forwarded-For header in production — ensure a trusted reverse proxy is configured"
    );
  }

  return "unknown";
}
