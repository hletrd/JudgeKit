import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/system-settings-config", () => ({
  getConfiguredSettings: () => ({ sessionMaxAgeSeconds: 14 * 24 * 60 * 60 }),
}));

import {
  getSessionMaxAgeSeconds,
  clearAuthToken,
  getTokenAuthenticatedAtSeconds,
  isTokenInvalidated,
} from "@/lib/auth/session-security";

// ---------------------------------------------------------------------------
// getTokenAuthenticatedAtSeconds
// ---------------------------------------------------------------------------

describe("getTokenAuthenticatedAtSeconds", () => {
  it("returns authenticatedAt when present and finite", () => {
    expect(getTokenAuthenticatedAtSeconds({ authenticatedAt: 1_700_000_000.9 })).toBe(
      1_700_000_000
    );
  });

  it("truncates (does not round) fractional seconds", () => {
    expect(getTokenAuthenticatedAtSeconds({ authenticatedAt: 1_700_000_000.999 })).toBe(
      1_700_000_000
    );
  });

  it("falls back to iat when authenticatedAt is absent", () => {
    expect(getTokenAuthenticatedAtSeconds({ iat: 1_600_000_000 })).toBe(1_600_000_000);
  });

  it("prefers authenticatedAt over iat when both are present", () => {
    expect(
      getTokenAuthenticatedAtSeconds({ authenticatedAt: 1_700_000_000, iat: 1_600_000_000 })
    ).toBe(1_700_000_000);
  });

  it("falls back to iat when authenticatedAt is not a number", () => {
    expect(getTokenAuthenticatedAtSeconds({ authenticatedAt: "not-a-number", iat: 1_600_000_000 })).toBe(
      1_600_000_000
    );
  });

  it("returns null when both authenticatedAt and iat are absent", () => {
    expect(getTokenAuthenticatedAtSeconds({})).toBeNull();
  });

  it("returns null for null token", () => {
    expect(getTokenAuthenticatedAtSeconds(null)).toBeNull();
  });

  it("returns null for undefined token", () => {
    expect(getTokenAuthenticatedAtSeconds(undefined)).toBeNull();
  });

  it("returns null when authenticatedAt is Infinity", () => {
    expect(getTokenAuthenticatedAtSeconds({ authenticatedAt: Infinity })).toBeNull();
  });

  it("returns null when authenticatedAt is NaN", () => {
    expect(getTokenAuthenticatedAtSeconds({ authenticatedAt: NaN })).toBeNull();
  });

  it("returns null when iat is Infinity", () => {
    expect(getTokenAuthenticatedAtSeconds({ iat: Infinity })).toBeNull();
  });

  it("handles zero as a valid authenticatedAt value", () => {
    expect(getTokenAuthenticatedAtSeconds({ authenticatedAt: 0 })).toBe(0);
  });

  it("handles negative timestamps for authenticatedAt", () => {
    expect(getTokenAuthenticatedAtSeconds({ authenticatedAt: -3600 })).toBe(-3600);
  });
});

describe("isTokenInvalidated", () => {
  const invalidatedAt = new Date("2024-01-01T00:00:00.000Z");
  const boundarySeconds = Math.trunc(invalidatedAt.getTime() / 1000);

  it("returns true when token was authenticated before the invalidation timestamp", () => {
    expect(isTokenInvalidated(boundarySeconds - 1, invalidatedAt)).toBe(true);
  });

  it("returns false when token was authenticated after the invalidation timestamp", () => {
    expect(isTokenInvalidated(boundarySeconds + 1, invalidatedAt)).toBe(false);
  });

  it("returns false when token was authenticated at exactly the invalidation boundary", () => {
    expect(isTokenInvalidated(boundarySeconds, invalidatedAt)).toBe(false);
  });

  it("returns false when tokenInvalidatedAt is null", () => {
    expect(isTokenInvalidated(boundarySeconds - 1, null)).toBe(false);
  });

  it("returns false when tokenInvalidatedAt is undefined", () => {
    expect(isTokenInvalidated(boundarySeconds - 1, undefined)).toBe(false);
  });

  it("returns false when authenticatedAtSeconds is null", () => {
    expect(isTokenInvalidated(null, invalidatedAt)).toBe(false);
  });

  it("returns false when authenticatedAtSeconds is zero (falsy)", () => {
    expect(isTokenInvalidated(0, invalidatedAt)).toBe(false);
  });

  it("returns false when both arguments are null", () => {
    expect(isTokenInvalidated(null, null)).toBe(false);
  });

  it("handles a far-future invalidation date correctly", () => {
    const futureDate = new Date("2099-12-31T23:59:59.000Z");
    const recentAuth = Math.trunc(Date.now() / 1000);
    expect(isTokenInvalidated(recentAuth, futureDate)).toBe(true);
  });

  it("handles a past invalidation date where token is newer", () => {
    const pastDate = new Date("2000-01-01T00:00:00.000Z");
    const recentAuth = Math.trunc(Date.now() / 1000);
    expect(isTokenInvalidated(recentAuth, pastDate)).toBe(false);
  });
});

describe("clearAuthToken", () => {
  it("removes all identity fields from the token", () => {
    const token = {
      sub: "user-1",
      id: "user-1",
      role: "student",
      username: "alice",
      email: "alice@example.com",
      name: "Alice",
      className: "CS101",
      mustChangePassword: false,
      authenticatedAt: 1_700_000_000,
      jti: "some-jti",
    } as Record<string, unknown>;

    const result = clearAuthToken(token as Parameters<typeof clearAuthToken>[0]);

    expect(result).not.toHaveProperty("sub");
    expect(result).not.toHaveProperty("id");
    expect(result).not.toHaveProperty("role");
    expect(result).not.toHaveProperty("username");
    expect(result).not.toHaveProperty("email");
    expect(result).not.toHaveProperty("name");
    expect(result).not.toHaveProperty("className");
    expect(result).not.toHaveProperty("mustChangePassword");
    expect(result).not.toHaveProperty("authenticatedAt");
  });

  it("preserves fields not in the clear list", () => {
    const token = {
      jti: "some-jti",
      exp: 9_999_999_999,
      sub: "user-1",
    } as Record<string, unknown>;

    const result = clearAuthToken(token as Parameters<typeof clearAuthToken>[0]);

    expect(result.jti).toBe("some-jti");
    expect((result as Record<string, unknown>).exp).toBe(9_999_999_999);
  });

  it("returns the same token object reference (mutates in place)", () => {
    const token = { sub: "user-1" } as Record<string, unknown>;
    const result = clearAuthToken(token as Parameters<typeof clearAuthToken>[0]);
    expect(result).toBe(token);
  });

  it("is idempotent when called on an already-cleared token", () => {
    const token = {} as Parameters<typeof clearAuthToken>[0];
    const first = clearAuthToken(token);
    const second = clearAuthToken(first);
    expect(second).toEqual({});
  });
});

describe("getSessionMaxAgeSeconds", () => {
  it("returns 14 days in seconds from configured settings", () => {
    expect(getSessionMaxAgeSeconds()).toBe(14 * 24 * 60 * 60);
  });
});
