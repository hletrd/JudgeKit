import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

async function importIpModule(trustedProxyHops?: string) {
  vi.resetModules();

  if (trustedProxyHops === undefined) {
    delete process.env.TRUSTED_PROXY_HOPS;
  } else {
    process.env.TRUSTED_PROXY_HOPS = trustedProxyHops;
  }

  return import("@/lib/security/ip");
}

function createHeaders(values: Record<string, string>) {
  return {
    get(name: string) {
      return values[name.toLowerCase()] ?? null;
    },
  };
}

afterEach(() => {
  delete process.env.TRUSTED_PROXY_HOPS;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("extractClientIp", () => {
  it("uses the client IP before the trusted proxy by default", async () => {
    const { extractClientIp } = await importIpModule();

    expect(
      extractClientIp(createHeaders({ "x-forwarded-for": "198.51.100.8, 203.0.113.10" }))
    ).toBe("198.51.100.8");
  });

  it("walks back through multiple trusted proxies", async () => {
    const { extractClientIp } = await importIpModule("2");

    expect(
      extractClientIp(
        createHeaders({
          "x-forwarded-for": "198.51.100.8, 203.0.113.10, 203.0.113.11",
        })
      )
    ).toBe("198.51.100.8");
  });

  it("refuses to fall back to a client-controllable XFF entry when the chain has fewer hops than expected (SEC H-5)", async () => {
    // Previously the helper indexed Math.max(0, len - (hops+1)) and
    // happily returned parts[0] whenever the chain was shorter than
    // TRUSTED_PROXY_HOPS expected — which is exactly the client-supplied
    // first entry. Now we degrade to null (or the dev sentinel) so
    // downstream rate-limit / audit code does not key on a spoofable
    // value.
    const { extractClientIp } = await importIpModule("3");

    expect(
      extractClientIp(createHeaders({ "x-forwarded-for": "198.51.100.8, 203.0.113.10" }))
    ).toBe(process.env.NODE_ENV === "production" ? null : "0.0.0.0");
  });

  it("ignores a spoofed X-Forwarded-For entirely when TRUSTED_PROXY_HOPS=0 (SEC-8)", async () => {
    // TRUSTED_PROXY_HOPS=0 documents "no trusted proxies", so every XFF entry
    // is client-controlled. Previously `parts.length >= 0 + 1` was true for any
    // XFF and `clientIndex = parts.length - 1` returned the last (spoofable)
    // entry. The fix skips the XFF path and falls through to the dev sentinel
    // (or null in production) instead of the attacker-supplied IP.
    const { extractClientIp } = await importIpModule("0");

    const result = extractClientIp(createHeaders({ "x-forwarded-for": "1.2.3.4" }));
    expect(result).not.toBe("1.2.3.4");
    expect(result).toBe(process.env.NODE_ENV === "production" ? null : "0.0.0.0");
  });

  it("ignores a spoofed X-Real-IP when TRUSTED_PROXY_HOPS=0 (SEC-8 residual / NEW-H7)", async () => {
    // TRUSTED_PROXY_HOPS=0 documents "no trusted proxies", so EVERY header is
    // client-controlled — including X-Real-IP. Trusting it would simply
    // relocate the XFF spoof surface A7 closed. X-Real-IP is only honored when
    // at least one trusted proxy hop is configured (the nginx setup, where the
    // proxy overwrites the header).
    const { extractClientIp } = await importIpModule("0");

    const result = extractClientIp(
      createHeaders({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "198.51.100.20" })
    );
    expect(result).not.toBe("198.51.100.20");
    expect(result).toBe(process.env.NODE_ENV === "production" ? null : "0.0.0.0");
  });

  it("trusts X-Real-IP when TRUSTED_PROXY_HOPS>=1 and XFF is absent", async () => {
    const { extractClientIp } = await importIpModule("1");

    expect(extractClientIp(createHeaders({ "x-real-ip": "198.51.100.20" }))).toBe(
      "198.51.100.20"
    );
  });

  it("unwraps an IPv4-mapped IPv6 client hop to its dotted IPv4 (dual-stack proxy)", async () => {
    const { extractClientIp } = await importIpModule();

    // A dual-stack Nginx listening on [::] reports IPv4 clients via
    // $remote_addr as ::ffff:a.b.c.d. Previously isValidIp rejected this and
    // extractClientIp returned the dev sentinel / null in prod, locking
    // judge workers out when JUDGE_ALLOWED_IPS was configured.
    expect(
      extractClientIp(createHeaders({ "x-forwarded-for": "::ffff:198.51.100.8, 203.0.113.10" }))
    ).toBe("198.51.100.8");
  });

  it("unwraps an IPv4-mapped IPv6 from x-real-ip", async () => {
    const { extractClientIp } = await importIpModule();

    expect(extractClientIp(createHeaders({ "x-real-ip": "::ffff:198.51.100.9" }))).toBe(
      "198.51.100.9"
    );
  });

  it("rejects a mapped form with an out-of-range IPv4 tail", async () => {
    const { extractClientIp } = await importIpModule();

    // 999 is not a valid octet — the mapped form must not be accepted.
    expect(
      extractClientIp(createHeaders({ "x-forwarded-for": "::ffff:999.1.1.1, 203.0.113.10" }))
    ).toBe("0.0.0.0");
  });

  it("uses x-real-ip when x-forwarded-for is absent", async () => {
    const { extractClientIp } = await importIpModule();

    expect(extractClientIp(createHeaders({ "x-real-ip": "198.51.100.9" }))).toBe(
      "198.51.100.9"
    );
  });

  it("prefers the validated x-forwarded-for client hop over x-real-ip when both are present", async () => {
    const { extractClientIp } = await importIpModule();

    expect(
      extractClientIp(
        createHeaders({
          "x-real-ip": "203.0.113.10",
          "x-forwarded-for": "198.51.100.8, 203.0.113.10",
        })
      )
    ).toBe("198.51.100.8");
  });

  it('returns "0.0.0.0" when no x-forwarded-for and no x-real-ip', async () => {
    const { extractClientIp } = await importIpModule();

    expect(extractClientIp(createHeaders({}))).toBe("0.0.0.0");
  });

  it('returns "0.0.0.0" when x-forwarded-for contains only invalid IPs', async () => {
    const { extractClientIp } = await importIpModule();

    expect(
      extractClientIp(createHeaders({ "x-forwarded-for": "not-an-ip, also-invalid" }))
    ).toBe("0.0.0.0");
  });

  it("logs a warning in production when no x-forwarded-for header is present", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";

    try {
      const { extractClientIp } = await importIpModule();
      const { logger } = await import("@/lib/logger");

      extractClientIp(createHeaders({}));

      expect(logger.warn).toHaveBeenCalledWith(
        "[security] No X-Forwarded-For header in production — ensure a trusted reverse proxy is configured"
      );
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
    }
  });

  it("does not log a production warning when x-forwarded-for is present", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";

    try {
      const { extractClientIp } = await importIpModule();
      const { logger } = await import("@/lib/logger");

      extractClientIp(createHeaders({ "x-forwarded-for": "198.51.100.8, 203.0.113.10" }));

      expect(logger.warn).not.toHaveBeenCalled();
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
    }
  });
});
