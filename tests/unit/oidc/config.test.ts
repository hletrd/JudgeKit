import { afterEach, describe, expect, it, vi } from "vitest";
import { getOidcClient, getOidcIssuer } from "@/lib/oidc/config";

describe("OIDC configuration", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("requires HTTPS for non-loopback production issuers", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OIDC_ISSUER", "http://oj.auraedu.me");
    expect(() => getOidcIssuer()).toThrow("must use HTTPS");
  });

  it("allows HTTP loopback only with the explicit test escape hatch", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OIDC_ISSUER", "http://localhost:3110");
    expect(() => getOidcIssuer()).toThrow("must use HTTPS");
    vi.stubEnv("OIDC_ALLOW_INSECURE_LOOPBACK", "1");
    expect(getOidcIssuer()).toBe("http://localhost:3110");
  });

  it("requires an exact non-empty redirect URI allowlist", () => {
    vi.stubEnv("OIDC_CLIENT_ID", "info-course-portal");
    vi.stubEnv("OIDC_CLIENT_SECRET", "s".repeat(32));
    vi.stubEnv("OIDC_CLIENT_REDIRECT_URIS", "[]");
    expect(() => getOidcClient()).toThrow("at least one URL");
  });
});
