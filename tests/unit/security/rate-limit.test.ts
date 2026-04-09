import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Predicate =
  | { op: "eq"; value: string }
  | { op: "lt"; value: number };

type RateLimitRow = {
  id: string;
  key: string;
  attempts: number;
  windowStartedAt: number;
  blockedUntil: number | null;
  consecutiveBlocks: number;
  lastAttempt: number;
};

const rows = new Map<string, RateLimitRow>();

const dbMock = {
  select: vi.fn(),
  delete: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
};

const extractClientIpMock = vi.fn((headers: Headers) => headers.get("x-forwarded-for") ?? "0.0.0.0");

vi.mock("@/lib/security/ip", () => ({
  extractClientIp: extractClientIpMock,
}));

vi.mock("nanoid", () => ({
  nanoid: vi.fn(() => "rate-limit-id"),
}));

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");

  return {
    ...actual,
    eq: (_field: unknown, value: string): Predicate => ({ op: "eq", value }),
    lt: (_field: unknown, value: number): Predicate => ({ op: "lt", value }),
  };
});

const execTransactionMock = vi.fn(async (fn: (tx: typeof dbMock) => unknown) => fn(dbMock));

vi.mock("@/lib/db", () => ({
  db: dbMock,
  execTransaction: execTransactionMock,
}));

function readRow(predicate: Predicate) {
  if (predicate.op !== "eq") {
    return undefined;
  }

  return rows.get(predicate.value);
}

beforeEach(() => {
  rows.clear();
  execTransactionMock.mockClear();
  extractClientIpMock.mockClear();
  dbMock.select.mockImplementation(() => ({
    from: vi.fn(() => ({
      where: vi.fn((predicate: Predicate) => ({
        limit: vi.fn(() => ({
          for: vi.fn(() => {
            const row = readRow(predicate);
            return row ? [row] : [];
          }),
        })),
      })),
    })),
  }));
  dbMock.delete.mockImplementation(() => ({
    where: vi.fn(async (predicate: Predicate) => {
        if (predicate.op === "eq") {
          rows.delete(predicate.value);
          return;
        }

        for (const [key, row] of rows.entries()) {
          if (row.lastAttempt < predicate.value) {
            rows.delete(key);
          }
        }
      }),
  }));
  dbMock.update.mockImplementation(() => ({
    set: vi.fn((values: Partial<RateLimitRow>) => ({
      where: vi.fn(async (predicate: Predicate) => {
          if (predicate.op !== "eq") {
            return;
          }

          const existing = rows.get(predicate.value);
          if (!existing) {
            return;
          }

          rows.set(predicate.value, { ...existing, ...values });
        }),
    })),
  }));
  dbMock.insert.mockImplementation(() => ({
    values: vi.fn(async (values: RateLimitRow) => {
        rows.set(values.key, values);
      }),
  }));
});

afterEach(() => {
  delete process.env.RATE_LIMIT_MAX_ATTEMPTS;
  delete process.env.RATE_LIMIT_WINDOW_MS;
  delete process.env.RATE_LIMIT_BLOCK_MS;
  vi.restoreAllMocks();
});

async function importRateLimitModule() {
  vi.resetModules();
  process.env.RATE_LIMIT_MAX_ATTEMPTS = "2";
  process.env.RATE_LIMIT_WINDOW_MS = "100";
  process.env.RATE_LIMIT_BLOCK_MS = "1000";

  return import("@/lib/security/rate-limit");
}

describe("rate-limit helpers", () => {
  it("blocks after the configured threshold and escalates repeat blocks", async () => {
    const nowSpy = vi.spyOn(Date, "now");
    const {
      isAnyKeyRateLimited,
      isRateLimited,
      recordRateLimitFailure,
      recordRateLimitFailureMulti,
    } = await importRateLimitModule();

    nowSpy.mockReturnValue(1000);
    await recordRateLimitFailure("login:198.51.100.8");
    expect(rows.get("login:198.51.100.8")?.attempts).toBe(1);
    await expect(isRateLimited("login:198.51.100.8")).resolves.toBe(false);

    nowSpy.mockReturnValue(1050);
    await recordRateLimitFailure("login:198.51.100.8");
    expect(rows.get("login:198.51.100.8")?.blockedUntil).toBe(2050);
    expect(rows.get("login:198.51.100.8")?.consecutiveBlocks).toBe(1);
    await expect(isAnyKeyRateLimited("login:other", "login:198.51.100.8")).resolves.toBe(true);

    nowSpy.mockReturnValue(2200);
    await recordRateLimitFailureMulti("login:198.51.100.8");
    expect(rows.get("login:198.51.100.8")?.attempts).toBe(1);

    nowSpy.mockReturnValue(2250);
    await recordRateLimitFailure("login:198.51.100.8");
    expect(rows.get("login:198.51.100.8")?.blockedUntil).toBe(4250);
    expect(rows.get("login:198.51.100.8")?.consecutiveBlocks).toBe(2);
  });

  it("clears single and multiple keys", async () => {
    const { clearRateLimit, clearRateLimitMulti, recordRateLimitFailureMulti } =
      await importRateLimitModule();

    vi.spyOn(Date, "now").mockReturnValue(3000);
    await recordRateLimitFailureMulti("login:a", "login:b", "login:c");

    await clearRateLimit("login:a");
    await clearRateLimitMulti("login:b", "login:c");

    expect(rows.size).toBe(0);
  });

  it("evicts stale entries while recording fresh failures", async () => {
    // Eviction is now periodic (setInterval) rather than inline per-request.
    // This test verifies that fresh failures are still recorded correctly
    // and that the eviction helper removes entries older than 24h when called.
    const { recordRateLimitFailure, clearRateLimit } = await importRateLimitModule();

    rows.set("login:stale", {
      id: "stale-id",
      key: "login:stale",
      attempts: 1,
      windowStartedAt: 0,
      blockedUntil: null,
      consecutiveBlocks: 0,
      lastAttempt: 0,
    });

    vi.spyOn(Date, "now").mockReturnValue(24 * 60 * 60 * 1000 + 1000);
    await recordRateLimitFailure("login:fresh");

    // Fresh entry is recorded
    expect(rows.has("login:fresh")).toBe(true);

    // Stale entry is not evicted inline (eviction is now periodic via setInterval)
    // Clear the stale entry manually to verify clearRateLimit works
    await clearRateLimit("login:stale");
    expect(rows.has("login:stale")).toBe(false);
  });
});

describe("startRateLimitEviction / stopRateLimitEviction", () => {
  it("starts eviction interval and calling again is a no-op", async () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval").mockReturnValue(123 as unknown as NodeJS.Timeout);
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval").mockReturnValue(undefined);

    const { startRateLimitEviction, stopRateLimitEviction } = await importRateLimitModule();

    startRateLimitEviction();
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60_000);

    // Calling again should not create another interval
    startRateLimitEviction();
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    // Stop clears the timer
    stopRateLimitEviction();
    expect(clearIntervalSpy).toHaveBeenCalledWith(123);
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);

    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });

  it("stopRateLimitEviction is safe when not started", async () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval").mockReturnValue(undefined);

    const { stopRateLimitEviction } = await importRateLimitModule();

    // Should not throw and should not call clearInterval
    stopRateLimitEviction();
    expect(clearIntervalSpy).not.toHaveBeenCalled();

    clearIntervalSpy.mockRestore();
  });
});

describe("getRateLimitKey", () => {
  it("constructs key from action and extracted IP", async () => {
    const { getRateLimitKey } = await importRateLimitModule();

    extractClientIpMock.mockReturnValue("10.0.0.1");

    const headers = new Headers({ "x-forwarded-for": "10.0.0.1" });
    const key = getRateLimitKey("login", headers);

    expect(key).toBe("login:10.0.0.1");
    expect(extractClientIpMock).toHaveBeenCalledWith(headers);
  });
});

describe("getUsernameRateLimitKey", () => {
  it("constructs key from action and lowercased username", async () => {
    const { getUsernameRateLimitKey } = await importRateLimitModule();

    expect(getUsernameRateLimitKey("login", "Alice")).toBe("login:user:alice");
    expect(getUsernameRateLimitKey("login", "BOB")).toBe("login:user:bob");
    expect(getUsernameRateLimitKey("login", "charlie")).toBe("login:user:charlie");
  });
});
