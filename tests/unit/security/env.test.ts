import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const VALID_TOKEN = "a".repeat(32);
const VALID_SECRET = "b".repeat(32);

function setEnv(vars: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function clearAuthEnv() {
  delete process.env.AUTH_URL;
  delete process.env.NEXTAUTH_URL;
  delete process.env.AUTH_SECRET;
  delete process.env.JUDGE_AUTH_TOKEN;
  delete process.env.AUTH_TRUST_HOST;
}

afterEach(() => {
  clearAuthEnv();
  vi.restoreAllMocks();
});

// Re-import module fresh for each test that mutates env at import time
async function importEnv() {
  vi.resetModules();
  return import("@/lib/security/env");
}

// ---------------------------------------------------------------------------
// normalizeHostForComparison
// ---------------------------------------------------------------------------
describe("normalizeHostForComparison", () => {
  it("trims and lowercases plain hostnames", async () => {
    const { normalizeHostForComparison } = await importEnv();
    expect(normalizeHostForComparison("  Example.COM  ")).toBe("example.com");
  });

  it("returns empty string for blank input", async () => {
    const { normalizeHostForComparison } = await importEnv();
    expect(normalizeHostForComparison("   ")).toBe("");
  });

  it("strips default HTTP port 80", async () => {
    const { normalizeHostForComparison } = await importEnv();
    expect(normalizeHostForComparison("example.com:80")).toBe("example.com");
  });

  it("strips default HTTPS port 443", async () => {
    const { normalizeHostForComparison } = await importEnv();
    expect(normalizeHostForComparison("example.com:443")).toBe("example.com");
  });

  it("keeps non-default ports", async () => {
    const { normalizeHostForComparison } = await importEnv();
    expect(normalizeHostForComparison("example.com:3000")).toBe("example.com:3000");
  });

  it("handles IPv6 addresses", async () => {
    const { normalizeHostForComparison } = await importEnv();
    expect(normalizeHostForComparison("[::1]")).toBe("[::1]");
  });

  it("strips port 80 from IPv6 address", async () => {
    const { normalizeHostForComparison } = await importEnv();
    expect(normalizeHostForComparison("[::1]:80")).toBe("[::1]");
  });

  it("strips port 443 from IPv6 address", async () => {
    const { normalizeHostForComparison } = await importEnv();
    expect(normalizeHostForComparison("[::1]:443")).toBe("[::1]");
  });

  it("keeps non-default port on IPv6 address", async () => {
    const { normalizeHostForComparison } = await importEnv();
    expect(normalizeHostForComparison("[::1]:3000")).toBe("[::1]:3000");
  });

  it("returns malformed IPv6 bracket as-is", async () => {
    const { normalizeHostForComparison } = await importEnv();
    // No closing bracket
    expect(normalizeHostForComparison("[::1")).toBe("[::1");
  });
});

// ---------------------------------------------------------------------------
// getAuthUrl
// ---------------------------------------------------------------------------
describe("getAuthUrl", () => {
  it("returns AUTH_URL when set", async () => {
    setEnv({ AUTH_URL: "https://example.com" });
    const { getAuthUrl } = await importEnv();
    expect(getAuthUrl()).toBe("https://example.com");
  });

  it("falls back to NEXTAUTH_URL when AUTH_URL is absent", async () => {
    setEnv({ AUTH_URL: undefined, NEXTAUTH_URL: "https://fallback.example.com" });
    const { getAuthUrl } = await importEnv();
    expect(getAuthUrl()).toBe("https://fallback.example.com");
  });

  it("returns undefined when neither variable is set", async () => {
    setEnv({ AUTH_URL: undefined, NEXTAUTH_URL: undefined });
    const { getAuthUrl } = await importEnv();
    expect(getAuthUrl()).toBeUndefined();
  });

  it("prefers AUTH_URL over NEXTAUTH_URL", async () => {
    setEnv({ AUTH_URL: "https://primary.example.com", NEXTAUTH_URL: "https://fallback.example.com" });
    const { getAuthUrl } = await importEnv();
    expect(getAuthUrl()).toBe("https://primary.example.com");
  });
});

// ---------------------------------------------------------------------------
// getAuthUrlObject
// ---------------------------------------------------------------------------
describe("getAuthUrlObject", () => {
  it("returns a URL object for a valid AUTH_URL", async () => {
    setEnv({ AUTH_URL: "https://example.com" });
    const { getAuthUrlObject } = await importEnv();
    const url = getAuthUrlObject();
    expect(url).toBeInstanceOf(URL);
    expect(url?.hostname).toBe("example.com");
  });

  it("returns null when AUTH_URL is not set", async () => {
    setEnv({ AUTH_URL: undefined, NEXTAUTH_URL: undefined });
    const { getAuthUrlObject } = await importEnv();
    expect(getAuthUrlObject()).toBeNull();
  });

  it("throws for an invalid AUTH_URL", async () => {
    setEnv({ AUTH_URL: "not-a-url" });
    const { getAuthUrlObject } = await importEnv();
    expect(() => getAuthUrlObject()).toThrow("AUTH_URL must be a valid absolute URL.");
  });
});

// ---------------------------------------------------------------------------
// validateAuthUrl
// ---------------------------------------------------------------------------
describe("validateAuthUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws in production when AUTH_URL is missing", async () => {
    setEnv({ AUTH_URL: undefined, NEXTAUTH_URL: undefined });
    vi.stubEnv("NODE_ENV", "production");
    const { validateAuthUrl } = await importEnv();
    expect(() => validateAuthUrl()).toThrow("AUTH_URL must be set in production");
  });

  it("does not throw in development when AUTH_URL is missing", async () => {
    setEnv({ AUTH_URL: undefined, NEXTAUTH_URL: undefined });
    vi.stubEnv("NODE_ENV", "development");
    const { validateAuthUrl } = await importEnv();
    expect(() => validateAuthUrl()).not.toThrow();
  });

  it("returns authUrl when valid", async () => {
    setEnv({ AUTH_URL: "https://example.com" });
    const { validateAuthUrl } = await importEnv();
    expect(validateAuthUrl()).toBe("https://example.com");
  });

  it("throws when AUTH_URL is set to an invalid URL", async () => {
    setEnv({ AUTH_URL: "bad-url" });
    const { validateAuthUrl } = await importEnv();
    expect(() => validateAuthUrl()).toThrow("AUTH_URL must be a valid absolute URL.");
  });
});

// ---------------------------------------------------------------------------
// shouldUseSecureSessionCookie
// ---------------------------------------------------------------------------
describe("shouldUseSecureSessionCookie", () => {
  it("returns true for an https AUTH_URL", async () => {
    setEnv({ AUTH_URL: "https://example.com" });
    const { shouldUseSecureSessionCookie } = await importEnv();
    expect(shouldUseSecureSessionCookie()).toBe(true);
  });

  it("returns false for an http AUTH_URL", async () => {
    setEnv({ AUTH_URL: "http://localhost:3000" });
    const { shouldUseSecureSessionCookie } = await importEnv();
    expect(shouldUseSecureSessionCookie()).toBe(false);
  });

  it("returns false when AUTH_URL is not set", async () => {
    setEnv({ AUTH_URL: undefined, NEXTAUTH_URL: undefined });
    const { shouldUseSecureSessionCookie } = await importEnv();
    expect(shouldUseSecureSessionCookie()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shouldTrustAuthHost
// ---------------------------------------------------------------------------
describe("shouldTrustAuthHost", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns true in non-production environments", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { shouldTrustAuthHost } = await importEnv();
    expect(shouldTrustAuthHost()).toBe(true);
  });

  it("returns true in production when AUTH_TRUST_HOST=true", async () => {
    vi.stubEnv("NODE_ENV", "production");
    setEnv({ AUTH_TRUST_HOST: "true" });
    const { shouldTrustAuthHost } = await importEnv();
    expect(shouldTrustAuthHost()).toBe(true);
  });

  it("returns false in production when AUTH_TRUST_HOST is not 'true'", async () => {
    vi.stubEnv("NODE_ENV", "production");
    setEnv({ AUTH_TRUST_HOST: "false" });
    const { shouldTrustAuthHost } = await importEnv();
    expect(shouldTrustAuthHost()).toBe(false);
  });

  it("returns false in production when AUTH_TRUST_HOST is unset", async () => {
    vi.stubEnv("NODE_ENV", "production");
    setEnv({ AUTH_TRUST_HOST: undefined });
    const { shouldTrustAuthHost } = await importEnv();
    expect(shouldTrustAuthHost()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getAuthSessionCookieName
// ---------------------------------------------------------------------------
describe("getAuthSessionCookieName", () => {
  it("returns the secure cookie name for https", async () => {
    setEnv({ AUTH_URL: "https://example.com" });
    const { getAuthSessionCookieName } = await importEnv();
    expect(getAuthSessionCookieName()).toBe("__Secure-authjs.session-token");
  });

  it("returns the plain cookie name for http", async () => {
    setEnv({ AUTH_URL: "http://localhost:3000" });
    const { getAuthSessionCookieName } = await importEnv();
    expect(getAuthSessionCookieName()).toBe("authjs.session-token");
  });
});

// ---------------------------------------------------------------------------
// getValidatedAuthSecret
// ---------------------------------------------------------------------------
describe("getValidatedAuthSecret", () => {
  it("returns a valid secret", async () => {
    setEnv({ AUTH_SECRET: VALID_SECRET });
    const { getValidatedAuthSecret } = await importEnv();
    expect(getValidatedAuthSecret()).toBe(VALID_SECRET);
  });

  it("throws when AUTH_SECRET is missing", async () => {
    setEnv({ AUTH_SECRET: undefined });
    const { getValidatedAuthSecret } = await importEnv();
    expect(() => getValidatedAuthSecret()).toThrow("AUTH_SECRET must be set");
  });

  it("throws when AUTH_SECRET is the placeholder value", async () => {
    setEnv({ AUTH_SECRET: "your-secret-key-here-generate-with-openssl-rand-base64-32" });
    const { getValidatedAuthSecret } = await importEnv();
    expect(() => getValidatedAuthSecret()).toThrow("AUTH_SECRET must be replaced");
  });

  it("throws when AUTH_SECRET is shorter than 32 characters", async () => {
    setEnv({ AUTH_SECRET: "short" });
    const { getValidatedAuthSecret } = await importEnv();
    expect(() => getValidatedAuthSecret()).toThrow("AUTH_SECRET must be replaced");
  });

  it("throws when AUTH_SECRET is only whitespace", async () => {
    setEnv({ AUTH_SECRET: "   " });
    const { getValidatedAuthSecret } = await importEnv();
    expect(() => getValidatedAuthSecret()).toThrow("AUTH_SECRET must be set");
  });
});

// ---------------------------------------------------------------------------
// getValidatedJudgeAuthToken
// ---------------------------------------------------------------------------
describe("getValidatedJudgeAuthToken", () => {
  it("returns a valid token that is at least 32 characters", async () => {
    setEnv({ JUDGE_AUTH_TOKEN: VALID_TOKEN });
    const { getValidatedJudgeAuthToken } = await importEnv();
    expect(getValidatedJudgeAuthToken()).toBe(VALID_TOKEN);
  });

  it("throws when JUDGE_AUTH_TOKEN is missing", async () => {
    setEnv({ JUDGE_AUTH_TOKEN: undefined });
    const { getValidatedJudgeAuthToken } = await importEnv();
    expect(() => getValidatedJudgeAuthToken()).toThrow("JUDGE_AUTH_TOKEN must be set");
  });

  it("throws when JUDGE_AUTH_TOKEN is only whitespace", async () => {
    setEnv({ JUDGE_AUTH_TOKEN: "   " });
    const { getValidatedJudgeAuthToken } = await importEnv();
    expect(() => getValidatedJudgeAuthToken()).toThrow("JUDGE_AUTH_TOKEN must be set");
  });

  it("throws when JUDGE_AUTH_TOKEN is the placeholder value", async () => {
    setEnv({ JUDGE_AUTH_TOKEN: "your-judge-auth-token" });
    const { getValidatedJudgeAuthToken } = await importEnv();
    expect(() => getValidatedJudgeAuthToken()).toThrow(
      "JUDGE_AUTH_TOKEN must be replaced with a strong random value"
    );
  });

  it("throws when JUDGE_AUTH_TOKEN is the dev placeholder value", async () => {
    setEnv({ JUDGE_AUTH_TOKEN: "dev-test-token-for-local-development" });
    const { getValidatedJudgeAuthToken } = await importEnv();
    expect(() => getValidatedJudgeAuthToken()).toThrow(
      "JUDGE_AUTH_TOKEN must be replaced with a strong random value"
    );
  });

  it("throws when JUDGE_AUTH_TOKEN is shorter than 32 characters", async () => {
    setEnv({ JUDGE_AUTH_TOKEN: "tooshort" });
    const { getValidatedJudgeAuthToken } = await importEnv();
    expect(() => getValidatedJudgeAuthToken()).toThrow("JUDGE_AUTH_TOKEN must be at least 32 characters");
  });

  it("accepts a token of exactly 32 characters", async () => {
    const exactly32 = "x".repeat(32);
    setEnv({ JUDGE_AUTH_TOKEN: exactly32 });
    const { getValidatedJudgeAuthToken } = await importEnv();
    expect(getValidatedJudgeAuthToken()).toBe(exactly32);
  });

  it("accepts a token longer than 32 characters", async () => {
    const long = "y".repeat(64);
    setEnv({ JUDGE_AUTH_TOKEN: long });
    const { getValidatedJudgeAuthToken } = await importEnv();
    expect(getValidatedJudgeAuthToken()).toBe(long);
  });
});

// ---------------------------------------------------------------------------
// getTrustedAuthHosts
// ---------------------------------------------------------------------------
describe("getTrustedAuthHosts", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/system-settings");
  });

  it("returns an empty set when AUTH_URL is not set", async () => {
    setEnv({ AUTH_URL: undefined, NEXTAUTH_URL: undefined });
    const { getTrustedAuthHosts } = await importEnv();
    expect((await getTrustedAuthHosts()).size).toBe(0);
  });

  it("returns the auth host in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    setEnv({ AUTH_URL: "https://example.com" });
    const { getTrustedAuthHosts } = await importEnv();
    const hosts = await getTrustedAuthHosts();
    expect(hosts.has("example.com")).toBe(true);
    expect(hosts.size).toBe(1);
  });

  it("adds all loopback aliases in development when AUTH_URL is localhost", async () => {
    vi.stubEnv("NODE_ENV", "development");
    setEnv({ AUTH_URL: "http://localhost:3000" });
    const { getTrustedAuthHosts } = await importEnv();
    const hosts = await getTrustedAuthHosts();
    expect(hosts.has("localhost:3000")).toBe(true);
    expect(hosts.has("127.0.0.1:3000")).toBe(true);
    expect(hosts.has("[::1]:3000")).toBe(true);
  });

  it("does not add loopback aliases for non-loopback host in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    setEnv({ AUTH_URL: "https://staging.example.com" });
    const { getTrustedAuthHosts } = await importEnv();
    const hosts = await getTrustedAuthHosts();
    expect(hosts.size).toBe(1);
    expect(hosts.has("staging.example.com")).toBe(true);
  });

  it("adds allowed hosts from persisted system settings", async () => {
    vi.stubEnv("NODE_ENV", "production");
    setEnv({ AUTH_URL: "https://example.com" });
    vi.doMock("@/lib/system-settings", () => ({
      getSystemSettings: vi.fn().mockResolvedValue({
        allowedHosts: JSON.stringify(["alt.example.com", "internal.example.com:8443"]),
      }),
    }));

    const { getTrustedAuthHosts } = await importEnv();
    const hosts = await getTrustedAuthHosts();

    expect(hosts.has("example.com")).toBe(true);
    expect(hosts.has("alt.example.com")).toBe(true);
    expect(hosts.has("internal.example.com:8443")).toBe(true);
  });
});
