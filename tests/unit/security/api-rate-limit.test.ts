import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Fixed DB time used by the getDbNowUncached mock — tests for checkServerActionRateLimit
// must use timestamps relative to this value since the function now uses DB time
// instead of Date.now() for clock-skew consistency.
const MOCK_DB_NOW = new Date("2026-04-20T12:00:00Z");
const MOCK_DB_NOW_MS = MOCK_DB_NOW.getTime();

type SidecarCheckResult = {
  allowed: boolean;
  remaining: number;
  retryAfter: number | null;
} | null;

const { getRateLimitKeyMock, dbMock, execTransactionMock, sidecarCheckMock } = vi.hoisted(() => {
  const dbMock = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  };
  return {
    getRateLimitKeyMock: vi.fn(),
    dbMock,
    // execTransaction runs the callback with the db mock as the transaction client
    execTransactionMock: vi.fn(async (fn: (tx: typeof dbMock) => unknown) => fn(dbMock)),
    // Sidecar fast-path — default null means unreachable/unconfigured so the
    // existing DB-path tests keep their original behavior.
    sidecarCheckMock: vi.fn<() => Promise<SidecarCheckResult>>(async () => null),
  };
});

vi.mock("@/lib/security/rate-limit", () => ({
  getRateLimitKey: getRateLimitKeyMock,
}));

vi.mock("@/lib/security/rate-limiter-client", () => ({
  checkRateLimit: sidecarCheckMock,
}));

vi.mock("@/lib/db", () => ({
  db: dbMock,
  execTransaction: execTransactionMock,
}));

vi.mock("@/lib/db-time", () => ({
  getDbNowUncached: vi.fn(() => Promise.resolve(new Date("2026-04-20T12:00:00Z"))),
}));

vi.mock("@/lib/system-settings-config", () => ({
  getConfiguredSettings: () => ({
    apiRateLimitMax: 2,
    apiRateLimitWindowMs: 60_000,
  }),
}));

vi.mock("nanoid", () => ({
  nanoid: vi.fn(() => "test-nanoid"),
}));

import { consumeApiRateLimit, consumeUserApiRateLimit, checkServerActionRateLimit } from "@/lib/security/api-rate-limit";

function mockSelectResult(row: Record<string, unknown> | undefined) {
  const rows = row ? [row] : [];
  dbMock.select.mockReturnValue({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        for: vi.fn(() => ({
          limit: vi.fn(() => rows),
        })),
        limit: vi.fn(() => rows),
      })),
    })),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: select returns no existing row (new request)
  mockSelectResult(undefined);
  dbMock.insert.mockReturnValue({
    values: vi.fn(async () => undefined),
  });
  dbMock.update.mockReturnValue({
    set: vi.fn(() => ({
      where: vi.fn(async () => undefined),
    })),
  });
  // Default: sidecar is unreachable so the DB path always runs
  sidecarCheckMock.mockResolvedValue(null);
});

function createRequest() {
  return new NextRequest("https://example.com/api/v1/groups", {
    method: "POST",
    headers: {
      "x-forwarded-for": "198.51.100.8",
    },
  });
}

describe("consumeApiRateLimit", () => {
  it("returns null when the endpoint is still allowed", async () => {
    getRateLimitKeyMock.mockReturnValue("api:groups:198.51.100.8");

    const result = await consumeApiRateLimit(createRequest(), "groups");
    expect(result).toBeNull();
    expect(getRateLimitKeyMock).toHaveBeenCalledWith(
      "api:groups",
      expect.any(Headers)
    );
    expect(dbMock.insert).toHaveBeenCalled();
  });

  it("returns a 429 response when the request is already rate limited", async () => {
    getRateLimitKeyMock.mockReturnValue("api:groups:198.51.100.8");
    // Simulate an existing entry that is blocked
    mockSelectResult({
      key: "api:groups:198.51.100.8",
      attempts: 120,
      windowStartedAt: Date.now(),
      blockedUntil: Date.now() + 60000,
      consecutiveBlocks: 1,
      lastAttempt: Date.now(),
    });

    const response = await consumeApiRateLimit(createRequest(), "groups");

    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBe("60");
    expect(response?.headers.get("X-RateLimit-Limit")).toBe("2");
    expect(response?.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(Number(response?.headers.get("X-RateLimit-Reset"))).toBeGreaterThan(
      Math.floor(Date.now() / 1000)
    );
    await expect(response?.json()).resolves.toEqual({ error: "rateLimited" });
  });

  it("does not double-count the same request key", async () => {
    getRateLimitKeyMock.mockReturnValue("api:groups:198.51.100.8");
    const request = createRequest();

    await consumeApiRateLimit(request, "groups");
    // Second call with same request object: key already consumed, returns null without recording
    await consumeApiRateLimit(request, "groups");

    // transaction is only called once (dedup via WeakMap)
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
  });
});

describe("consumeUserApiRateLimit", () => {
  it("returns null when allowed (new key)", async () => {
    const request = createRequest();
    const result = await consumeUserApiRateLimit(request, "user-123", "settings");
    expect(result).toBeNull();
    // Should NOT call getRateLimitKey — it builds the key internally
    expect(getRateLimitKeyMock).not.toHaveBeenCalled();
    expect(dbMock.insert).toHaveBeenCalled();
  });

  it("returns a 429 response when rate limited", async () => {
    mockSelectResult({
      key: "api:settings:user:user-123",
      attempts: 120,
      windowStartedAt: Date.now(),
      blockedUntil: Date.now() + 60000,
      consecutiveBlocks: 1,
      lastAttempt: Date.now(),
    });

    const request = createRequest();
    const response = await consumeUserApiRateLimit(request, "user-123", "settings");

    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBe("60");
    expect(response?.headers.get("X-RateLimit-Limit")).toBe("2");
    expect(response?.headers.get("X-RateLimit-Remaining")).toBe("0");
    await expect(response?.json()).resolves.toEqual({ error: "rateLimited" });
  });

  it("deduplicates same request+key via WeakMap", async () => {
    const request = createRequest();

    await consumeUserApiRateLimit(request, "user-123", "settings");
    // Second call with same request object and same params: dedup returns null without recording again
    await consumeUserApiRateLimit(request, "user-123", "settings");

    // Only one insert — the second call is deduped
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
  });
});

describe("atomicConsumeRateLimit internal paths", () => {
  it("resets window when existing row has expired window", async () => {
    // Window started 120s ago, windowMs is 60s => expired
    mockSelectResult({
      key: "api:groups:198.51.100.8",
      attempts: 5,
      windowStartedAt: Date.now() - 120_000,
      blockedUntil: null,
      consecutiveBlocks: 0,
      lastAttempt: Date.now() - 120_000,
    });

    getRateLimitKeyMock.mockReturnValue("api:groups:198.51.100.8");
    const result = await consumeApiRateLimit(createRequest(), "groups");

    expect(result).toBeNull();
    // Should update (not insert) because the row exists
    expect(dbMock.update).toHaveBeenCalled();
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("returns 429 when max attempts reached within window", async () => {
    // apiRateLimitMax is 2, attempts is already 2 (>= max), window still valid
    mockSelectResult({
      key: "api:groups:198.51.100.8",
      attempts: 2,
      windowStartedAt: Date.now(),
      blockedUntil: null,
      consecutiveBlocks: 0,
      lastAttempt: Date.now(),
    });

    getRateLimitKeyMock.mockReturnValue("api:groups:198.51.100.8");
    const response = await consumeApiRateLimit(createRequest(), "groups");

    expect(response?.status).toBe(429);
  });

  it("sets blockedUntil when newAttempts reaches apiMax (increment with block)", async () => {
    // apiRateLimitMax is 2, attempts is 1, so newAttempts=2 >= apiMax => blockedUntil is set
    mockSelectResult({
      key: "api:groups:198.51.100.8",
      attempts: 1,
      windowStartedAt: Date.now(),
      blockedUntil: null,
      consecutiveBlocks: 0,
      lastAttempt: Date.now(),
    });

    // Capture what .set() is called with
    const setFn = vi.fn(() => ({
      where: vi.fn(async () => undefined),
    }));
    dbMock.update.mockReturnValue({ set: setFn });

    getRateLimitKeyMock.mockReturnValue("api:groups:198.51.100.8");
    const result = await consumeApiRateLimit(createRequest(), "groups");

    expect(result).toBeNull();
    expect(setFn).toHaveBeenCalled();
    const setArgs = (setFn.mock as unknown as { calls: Array<[Record<string, unknown>]> }).calls[0][0];
    expect(setArgs.attempts).toBe(2);
    expect(setArgs.blockedUntil).toBeTypeOf("number");
    expect(setArgs.blockedUntil).toBeGreaterThan(Date.now() - 1000);
  });
});

describe("checkServerActionRateLimit", () => {
  it("returns null when under limit (no existing row)", async () => {
    mockSelectResult(undefined);

    const result = await checkServerActionRateLimit("user-1", "deleteAccount");

    expect(result).toBeNull();
    expect(dbMock.insert).toHaveBeenCalled();
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("returns null when under limit (existing row within window)", async () => {
    mockSelectResult({
      key: "sa:user-1:deleteAccount",
      attempts: 5,
      windowStartedAt: MOCK_DB_NOW_MS,
      blockedUntil: null,
      consecutiveBlocks: 0,
      lastAttempt: MOCK_DB_NOW_MS,
    });

    const result = await checkServerActionRateLimit("user-1", "deleteAccount", 20, 60);

    expect(result).toBeNull();
    // Existing row => update, not insert
    expect(dbMock.update).toHaveBeenCalled();
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("returns { error: 'rateLimited' } when at max", async () => {
    mockSelectResult({
      key: "sa:user-1:deleteAccount",
      attempts: 20,
      windowStartedAt: MOCK_DB_NOW_MS,
      blockedUntil: null,
      consecutiveBlocks: 0,
      lastAttempt: MOCK_DB_NOW_MS,
    });

    const result = await checkServerActionRateLimit("user-1", "deleteAccount", 20, 60);

    expect(result).toEqual({ error: "rateLimited" });
    // No insert or update when rate limited
    expect(dbMock.insert).not.toHaveBeenCalled();
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("resets window when expired and allows the request", async () => {
    // windowSeconds=60, window started 120s ago => expired
    mockSelectResult({
      key: "sa:user-1:deleteAccount",
      attempts: 20,
      windowStartedAt: MOCK_DB_NOW_MS - 120_000,
      blockedUntil: null,
      consecutiveBlocks: 0,
      lastAttempt: MOCK_DB_NOW_MS - 120_000,
    });

    const result = await checkServerActionRateLimit("user-1", "deleteAccount", 20, 60);

    expect(result).toBeNull();
    // Should update (not insert) because the row exists
    expect(dbMock.update).toHaveBeenCalled();
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("inserts new row when no existing row is found", async () => {
    mockSelectResult(undefined);

    const result = await checkServerActionRateLimit("user-2", "updateProfile", 10, 30);

    expect(result).toBeNull();
    expect(dbMock.insert).toHaveBeenCalled();
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("updates existing row when row exists and is within window", async () => {
    // Capture what .set() is called with
    const setFn = vi.fn(() => ({
      where: vi.fn(async () => undefined),
    }));
    dbMock.update.mockReturnValue({ set: setFn });

    mockSelectResult({
      key: "sa:user-1:someAction",
      attempts: 3,
      windowStartedAt: MOCK_DB_NOW_MS,
      blockedUntil: null,
      consecutiveBlocks: 0,
      lastAttempt: MOCK_DB_NOW_MS,
    });

    const result = await checkServerActionRateLimit("user-1", "someAction", 10, 60);

    expect(result).toBeNull();
    expect(dbMock.update).toHaveBeenCalled();
    expect(setFn).toHaveBeenCalled();
    const setArgs = (setFn.mock as unknown as { calls: Array<[Record<string, unknown>]> }).calls[0][0];
    expect(setArgs.attempts).toBe(4);
  });
});

describe("sidecar fast-path integration", () => {
  it("returns 429 without touching the DB when the sidecar says disallowed", async () => {
    sidecarCheckMock.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      retryAfter: 30_000,
    });
    getRateLimitKeyMock.mockReturnValue("api:groups:198.51.100.8");

    const response = await consumeApiRateLimit(createRequest(), "groups");

    expect(response?.status).toBe(429);
    expect(sidecarCheckMock).toHaveBeenCalledWith(
      "api:groups:198.51.100.8",
      2,
      60_000,
    );
    // DB path must not run when the sidecar has already rejected the key
    expect(dbMock.select).not.toHaveBeenCalled();
    expect(dbMock.insert).not.toHaveBeenCalled();
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("still runs the DB path when the sidecar allows the request", async () => {
    sidecarCheckMock.mockResolvedValueOnce({
      allowed: true,
      remaining: 5,
      retryAfter: null,
    });
    getRateLimitKeyMock.mockReturnValue("api:groups:198.51.100.8");

    const response = await consumeApiRateLimit(createRequest(), "groups");

    expect(response).toBeNull();
    // DB path is the authoritative record and must still be consulted
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
  });

  it("falls back to the DB path when the sidecar returns null (unreachable)", async () => {
    sidecarCheckMock.mockResolvedValueOnce(null);
    getRateLimitKeyMock.mockReturnValue("api:groups:198.51.100.8");
    mockSelectResult({
      key: "api:groups:198.51.100.8",
      attempts: 2,
      windowStartedAt: Date.now(),
      blockedUntil: Date.now() + 60_000,
      consecutiveBlocks: 1,
      lastAttempt: Date.now(),
    });

    const response = await consumeApiRateLimit(createRequest(), "groups");

    // DB says the key is already blocked; we must still return 429 even
    // though the sidecar was silent. This is the "sidecar outage must not
    // allow extra traffic" guarantee.
    expect(response?.status).toBe(429);
  });

  it("consumeUserApiRateLimit honors the sidecar fast-path", async () => {
    sidecarCheckMock.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      retryAfter: 12_345,
    });

    const response = await consumeUserApiRateLimit(
      createRequest(),
      "user-xyz",
      "settings",
    );

    expect(response?.status).toBe(429);
    expect(sidecarCheckMock).toHaveBeenCalledWith(
      "api:settings:user:user-xyz",
      2,
      60_000,
    );
    expect(dbMock.insert).not.toHaveBeenCalled();
  });
});
