import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { isJudgeIpAllowed, resetIpAllowlistCache } from "@/lib/judge/ip-allowlist";

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
  it("returns the client IP appended by a single trusted proxy (standard nginx)", async () => {
    // With one trusted reverse proxy, nginx's $proxy_add_x_forwarded_for
    // produces a chain containing only the client IP (the proxy appends the
    // peer that connected to it, not its own address).
    const { extractClientIp } = await importIpModule();

    expect(extractClientIp(createHeaders({ "x-forwarded-for": "198.51.100.8" }))).toBe(
      "198.51.100.8"
    );
  });

  it("ignores spoofed leading entries when a single trusted proxy appended the real client", async () => {
    const { extractClientIp } = await importIpModule();

    expect(
      extractClientIp(createHeaders({ "x-forwarded-for": "1.2.3.4, 198.51.100.8" }))
    ).toBe("198.51.100.8");
  });

  it("walks back through multiple trusted proxies", async () => {
    // client -> cdn -> nginx -> app: the first proxy appends the client,
    // the second appends the first proxy, so the client is N hops from the end.
    const { extractClientIp } = await importIpModule("2");

    expect(
      extractClientIp(
        createHeaders({
          "x-forwarded-for": "198.51.100.8, 203.0.113.10",
        })
      )
    ).toBe("198.51.100.8");
  });

  it("refuses to fall back to a client-controllable XFF entry when the chain has fewer hops than expected (SEC H-5)", async () => {
    // With TRUSTED_PROXY_HOPS=2 we expect at least two entries (client +
    // one proxy). A shorter chain means some entries are attacker-controlled.
    const { extractClientIp } = await importIpModule("2");

    expect(
      extractClientIp(createHeaders({ "x-forwarded-for": "198.51.100.8" }))
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

  it("does not fall back to X-Real-IP when TRUSTED_PROXY_HOPS=0 and XFF is spoofed", async () => {
    // Once XFF is present but untrusted, do not let another request header
    // bypass the hop-validation failure.
    const { extractClientIp } = await importIpModule("0");

    expect(
      extractClientIp(
        createHeaders({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "198.51.100.20" })
      )
    ).toBe(process.env.NODE_ENV === "production" ? null : "0.0.0.0");
  });

  it("does not fall back to X-Real-IP when XFF has fewer hops than configured", async () => {
    const { extractClientIp } = await importIpModule("2");

    expect(
      extractClientIp(
        createHeaders({
          "x-forwarded-for": "198.51.100.8",
          "x-real-ip": "198.51.100.20",
        })
      )
    ).toBe(process.env.NODE_ENV === "production" ? null : "0.0.0.0");
  });

  it("unwraps an IPv4-mapped IPv6 client hop to its dotted IPv4 (dual-stack proxy)", async () => {
    const { extractClientIp } = await importIpModule();

    // A dual-stack Nginx listening on [::] reports IPv4 clients via
    // $remote_addr as ::ffff:a.b.c.d. Previously isValidIp rejected this and
    // extractClientIp returned the dev sentinel / null in prod, locking
    // judge workers out when JUDGE_ALLOWED_IPS was configured.
    expect(
      extractClientIp(createHeaders({ "x-forwarded-for": "::ffff:198.51.100.8" }))
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
      extractClientIp(createHeaders({ "x-forwarded-for": "::ffff:999.1.1.1" }))
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
          "x-forwarded-for": "198.51.100.8",
        })
      )
    ).toBe("198.51.100.8");
  });

  it("canonicalizes equivalent IPv6 strings to the same form", async () => {
    const { extractClientIp } = await importIpModule();

    const canonical = "2001:db8::1";
    expect(extractClientIp(createHeaders({ "x-real-ip": "2001:0db8:0000:0000:0000:0000:0000:0001" }))).toBe(canonical);
    expect(extractClientIp(createHeaders({ "x-real-ip": "2001:db8:0:0:0:0:0:1" }))).toBe(canonical);
    expect(extractClientIp(createHeaders({ "x-real-ip": "[2001:0db8:0000:0000:0000:0000:0000:0001]" }))).toBe(canonical);
  });

  it("canonicalizes the loopback address to ::1", async () => {
    const { extractClientIp } = await importIpModule();

    expect(extractClientIp(createHeaders({ "x-real-ip": "0:0:0:0:0:0:0:1" }))).toBe("::1");
    expect(extractClientIp(createHeaders({ "x-real-ip": "::1" }))).toBe("::1");
    expect(extractClientIp(createHeaders({ "x-real-ip": "[::1]" }))).toBe("::1");
  });

  it("canonicalizes the unspecified address to ::", async () => {
    const { extractClientIp } = await importIpModule();

    expect(extractClientIp(createHeaders({ "x-real-ip": "0:0:0:0:0:0:0:0" }))).toBe("::");
    expect(extractClientIp(createHeaders({ "x-real-ip": "::" }))).toBe("::");
  });

  it("lowercases canonical IPv6 addresses", async () => {
    const { extractClientIp } = await importIpModule();

    expect(extractClientIp(createHeaders({ "x-real-ip": "2001:DB8::1" }))).toBe("2001:db8::1");
  });

  it("rejects IPv6 addresses with multiple compression markers", async () => {
    const { extractClientIp } = await importIpModule();

    expect(extractClientIp(createHeaders({ "x-real-ip": "2001::db8::1" }))).toBe("0.0.0.0");
    expect(extractClientIp(createHeaders({ "x-real-ip": "::1::" }))).toBe("0.0.0.0");
  });

  it("rejects IPv6 addresses with too many groups", async () => {
    const { extractClientIp } = await importIpModule();

    expect(extractClientIp(createHeaders({ "x-real-ip": "1:2:3:4:5:6:7:8:9" }))).toBe("0.0.0.0");
    expect(extractClientIp(createHeaders({ "x-real-ip": "1:2:3:4:5:6:7:8:0" }))).toBe("0.0.0.0");
  });

  it("strips zone identifiers from IPv6 link-local addresses", async () => {
    const { extractClientIp } = await importIpModule();

    expect(extractClientIp(createHeaders({ "x-real-ip": "fe80::1%eth0" }))).toBe("fe80::1");
  });

  it("rejects an IPv6 address that expands to more than 8 groups", async () => {
    const { extractClientIp } = await importIpModule();

    expect(extractClientIp(createHeaders({ "x-real-ip": "1:2:3:4:5:6:7::8:9" }))).toBe("0.0.0.0");
  });

  it("accepts the all-zero IPv4 address", async () => {
    const { extractClientIp } = await importIpModule();

    expect(extractClientIp(createHeaders({ "x-real-ip": "0.0.0.0" }))).toBe("0.0.0.0");
  });

  it("accepts canonical IPv4 addresses without leading zeros", async () => {
    const { extractClientIp } = await importIpModule();

    expect(extractClientIp(createHeaders({ "x-real-ip": "192.168.1.1" }))).toBe("192.168.1.1");
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

      extractClientIp(createHeaders({ "x-forwarded-for": "198.51.100.8" }));

      expect(logger.warn).not.toHaveBeenCalled();
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
    }
  });
});

describe("isJudgeIpAllowed production default", () => {
  function judgeRequestWithIp(ip: string | null): NextRequest {
    const headers: Record<string, string> = {};
    if (ip !== null) headers["x-real-ip"] = ip;
    return new NextRequest("http://localhost:3000/api/v1/judge/claim", {
      method: "POST",
      headers,
    });
  }

  beforeEach(() => {
    resetIpAllowlistCache();
    vi.unstubAllEnvs();
    vi.stubEnv("TRUSTED_PROXY_HOPS", "0");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetIpAllowlistCache();
  });

  it("denies all judge requests in production when JUDGE_ALLOWED_IPS is unset", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isJudgeIpAllowed(judgeRequestWithIp("203.0.113.9"))).toBe(false);
    expect(isJudgeIpAllowed(judgeRequestWithIp("127.0.0.1"))).toBe(false);
  });

  it("allows all judge requests when JUDGE_ALLOW_ANY_JUDGE_IP=1 is set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JUDGE_ALLOW_ANY_JUDGE_IP", "1");
    resetIpAllowlistCache();
    expect(isJudgeIpAllowed(judgeRequestWithIp("203.0.113.9"))).toBe(true);
  });
});
