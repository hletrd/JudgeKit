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

  it("falls back to the first forwarded IP when there are fewer hops than expected", async () => {
    const { extractClientIp } = await importIpModule("3");

    expect(
      extractClientIp(createHeaders({ "x-forwarded-for": "198.51.100.8, 203.0.113.10" }))
    ).toBe("198.51.100.8");
  });

  it("uses x-real-ip when x-forwarded-for is absent", async () => {
    const { extractClientIp } = await importIpModule();

    expect(extractClientIp(createHeaders({ "x-real-ip": "198.51.100.9" }))).toBe(
      "198.51.100.9"
    );
  });

  it("prefers x-real-ip over a client-supplied x-forwarded-for chain", async () => {
    const { extractClientIp } = await importIpModule();

    expect(
      extractClientIp(
        createHeaders({
          "x-real-ip": "203.0.113.10",
          "x-forwarded-for": "198.51.100.8, 203.0.113.10",
        })
      )
    ).toBe("203.0.113.10");
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
