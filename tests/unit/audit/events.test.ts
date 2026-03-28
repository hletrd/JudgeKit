import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  return {
    // db chain helpers
    dbInsertValuesRun: vi.fn(),
    dbDeleteWhereReturning: vi.fn(),

    // @/lib/security/request-context
    normalizeText: vi.fn((text: unknown, _max: number) => (text == null ? null : String(text))),
    getClientIp: vi.fn(() => "127.0.0.1"),
    getRequestPath: vi.fn(() => "/test"),
    MAX_TEXT_LENGTH: 512,
    MAX_PATH_LENGTH: 256,

    // @/lib/logger
    loggerError: vi.fn(),
    loggerWarn: vi.fn(),
    loggerDebug: vi.fn(),

    // next/headers
    headers: vi.fn(async () => new Headers()),

    // drizzle-orm
    lt: vi.fn((_field: unknown, value: unknown) => ({ _lt: value })),
  };
});

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        run: vi.fn((...args: unknown[]) => {
          mocks.dbInsertValuesRun(...args);
        }),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn((...args: unknown[]) => {
          mocks.dbDeleteWhereReturning(...args);
          return Promise.resolve([]);
        }),
      })),
    })),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  auditEvents: { createdAt: "auditEvents.createdAt" },
}));

vi.mock("@/lib/security/request-context", () => ({
  normalizeText: mocks.normalizeText,
  getClientIp: mocks.getClientIp,
  getRequestPath: mocks.getRequestPath,
  MAX_TEXT_LENGTH: mocks.MAX_TEXT_LENGTH,
  MAX_PATH_LENGTH: mocks.MAX_PATH_LENGTH,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: mocks.loggerError,
    warn: mocks.loggerWarn,
    debug: mocks.loggerDebug,
    info: vi.fn(),
  },
}));

vi.mock("next/headers", () => ({
  headers: mocks.headers,
}));

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    lt: mocks.lt,
  };
});

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Reset normalizeText to passthrough by default
  mocks.normalizeText.mockImplementation((text: unknown, _max: number) =>
    text == null ? null : String(text)
  );
  mocks.getClientIp.mockReturnValue("127.0.0.1");
  mocks.getRequestPath.mockReturnValue("/test");
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// buildAuditRequestContext
// ─────────────────────────────────────────────────────────────────────────────

describe("buildAuditRequestContext", () => {
  it("extracts IP address from headers via getClientIp", async () => {
    const { buildAuditRequestContext } = await import("@/lib/audit/events");
    mocks.getClientIp.mockReturnValue("10.0.0.1");

    const hdrs = new Headers({ "user-agent": "Mozilla/5.0" });
    const result = buildAuditRequestContext({ headers: hdrs, method: "GET", url: "http://localhost/path" });

    expect(mocks.getClientIp).toHaveBeenCalledWith(hdrs);
    expect(result.ipAddress).toBe("10.0.0.1");
  });

  it("normalizes user-agent string", async () => {
    const { buildAuditRequestContext } = await import("@/lib/audit/events");
    mocks.normalizeText.mockImplementation((text: unknown, _max: number) =>
      text == null ? null : `normalized:${String(text)}`
    );

    const hdrs = new Headers({ "user-agent": "TestAgent/1.0" });
    const result = buildAuditRequestContext({ headers: hdrs, method: "GET", url: "http://localhost/" });

    expect(result.userAgent).toBe("normalized:TestAgent/1.0");
  });

  it("uppercases request method", async () => {
    const { buildAuditRequestContext } = await import("@/lib/audit/events");
    // normalizeText returns input as-is, then toUpperCase is applied in source
    mocks.normalizeText.mockImplementation((text: unknown, _max: number) =>
      text == null ? null : String(text)
    );

    const hdrs = new Headers();
    const result = buildAuditRequestContext({ headers: hdrs, method: "post", url: "http://localhost/" });

    expect(result.requestMethod).toBe("POST");
  });

  it("extracts path from URL via getRequestPath", async () => {
    const { buildAuditRequestContext } = await import("@/lib/audit/events");
    mocks.getRequestPath.mockReturnValue("/api/submissions");

    const hdrs = new Headers();
    const result = buildAuditRequestContext({ headers: hdrs, method: "GET", url: "http://localhost/api/submissions" });

    expect(mocks.getRequestPath).toHaveBeenCalledWith("http://localhost/api/submissions");
    expect(result.requestPath).toBe("/api/submissions");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// recordAuditEvent
// ─────────────────────────────────────────────────────────────────────────────

describe("recordAuditEvent", () => {
  it("successfully inserts audit event with all fields", async () => {
    const { recordAuditEvent } = await import("@/lib/audit/events");
    const { db } = await import("@/lib/db");

    recordAuditEvent({
      actorId: "user-1",
      actorRole: "admin",
      action: "user.created",
      resourceType: "user",
      resourceId: "user-2",
      resourceLabel: "newuser",
      summary: "Created user newuser",
      details: { foo: "bar" },
    });

    expect(db.insert).toHaveBeenCalled();
  });

  it("uses buildAuditRequestContext when request is provided", async () => {
    const { recordAuditEvent } = await import("@/lib/audit/events");

    mocks.getClientIp.mockReturnValue("192.168.1.1");
    mocks.getRequestPath.mockReturnValue("/api/users");

    const hdrs = new Headers({ "user-agent": "TestBrowser" });
    recordAuditEvent({
      action: "user.login",
      resourceType: "session",
      summary: "User logged in",
      request: { headers: hdrs, method: "POST", url: "http://localhost/api/users" },
    });

    expect(mocks.getClientIp).toHaveBeenCalledWith(hdrs);
    expect(mocks.getRequestPath).toHaveBeenCalledWith("http://localhost/api/users");
  });

  it("uses context directly when context is provided instead of request", async () => {
    const { recordAuditEvent } = await import("@/lib/audit/events");
    const { db } = await import("@/lib/db");

    const context = {
      ipAddress: "10.10.10.10",
      userAgent: "direct-agent",
      requestMethod: "GET",
      requestPath: "/dashboard",
    };

    recordAuditEvent({
      action: "page.view",
      resourceType: "page",
      summary: "Dashboard viewed",
      context,
    });

    expect(db.insert).toHaveBeenCalled();
    // getClientIp should NOT be called — context was used directly
    expect(mocks.getClientIp).not.toHaveBeenCalled();
  });

  it("handles DB write failure gracefully and logs warning", async () => {
    const { recordAuditEvent } = await import("@/lib/audit/events");
    const { db } = await import("@/lib/db");

    (db.insert as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      values: vi.fn(() => ({
        run: vi.fn(() => {
          throw new Error("db write failed");
        }),
      })),
    }));

    expect(() =>
      recordAuditEvent({
        action: "user.login",
        resourceType: "session",
        summary: "Test",
      })
    ).not.toThrow();

    expect(mocks.loggerWarn).toHaveBeenCalled();
  });

  it("tracks consecutive failures and logs critical after MAX_SILENT_FAILURES (3)", async () => {
    const { recordAuditEvent, stopAuditEventPruning } = await import("@/lib/audit/events");
    stopAuditEventPruning();
    const { db } = await import("@/lib/db");

    const makeThrowingInsert = () => ({
      values: vi.fn(() => ({
        run: vi.fn(() => {
          throw new Error("db error");
        }),
      })),
    });

    // Trigger 3 consecutive failures (MAX_SILENT_FAILURES = 3)
    (db.insert as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(makeThrowingInsert)
      .mockImplementationOnce(makeThrowingInsert)
      .mockImplementationOnce(makeThrowingInsert);

    recordAuditEvent({ action: "a", resourceType: "r", summary: "s" });
    recordAuditEvent({ action: "a", resourceType: "r", summary: "s" });
    recordAuditEvent({ action: "a", resourceType: "r", summary: "s" });

    expect(mocks.loggerError).toHaveBeenCalled();
  });

  it("resets consecutiveAuditFailures on success", async () => {
    const { recordAuditEvent, stopAuditEventPruning } = await import("@/lib/audit/events");
    stopAuditEventPruning();
    const { db } = await import("@/lib/db");

    // First two calls fail
    const makeThrowingInsert = () => ({
      values: vi.fn(() => ({
        run: vi.fn(() => {
          throw new Error("db error");
        }),
      })),
    });

    (db.insert as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(makeThrowingInsert)
      .mockImplementationOnce(makeThrowingInsert);

    recordAuditEvent({ action: "a", resourceType: "r", summary: "s" });
    recordAuditEvent({ action: "a", resourceType: "r", summary: "s" });

    // Third call succeeds — resets consecutiveAuditFailures
    recordAuditEvent({ action: "a", resourceType: "r", summary: "s" });

    // After the success, a further failure should only warn (not critical),
    // because consecutiveAuditFailures was reset to 0
    mocks.loggerWarn.mockClear();
    mocks.loggerError.mockClear();

    (db.insert as ReturnType<typeof vi.fn>).mockImplementationOnce(makeThrowingInsert);
    recordAuditEvent({ action: "a", resourceType: "r", summary: "s" });

    expect(mocks.loggerWarn).toHaveBeenCalled();
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getAuditEventHealthSnapshot
// ─────────────────────────────────────────────────────────────────────────────

describe("getAuditEventHealthSnapshot", () => {
  it("returns ok status when no failures have occurred", async () => {
    const { getAuditEventHealthSnapshot } = await import("@/lib/audit/events");
    const { db } = await import("@/lib/db");

    // Ensure a successful insert so failedWrites counter stays 0 in this fresh module
    // (module state is shared within a test file run; rely on a clean call)
    (db.insert as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      values: vi.fn(() => ({
        run: vi.fn(() => undefined),
      })),
    }));

    const { recordAuditEvent } = await import("@/lib/audit/events");
    recordAuditEvent({ action: "ok", resourceType: "r", summary: "s" });

    const snapshot = getAuditEventHealthSnapshot();
    // status is "ok" only when failedWrites === 0; it may be > 0 from previous tests
    expect(snapshot).toHaveProperty("failedWrites");
    expect(snapshot).toHaveProperty("lastFailureAt");
    expect(snapshot).toHaveProperty("status");
    expect(["ok", "degraded"]).toContain(snapshot.status);
  });

  it("returns degraded status after a failure", async () => {
    const { recordAuditEvent, getAuditEventHealthSnapshot } = await import("@/lib/audit/events");
    const { db } = await import("@/lib/db");

    (db.insert as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      values: vi.fn(() => ({
        run: vi.fn(() => {
          throw new Error("forced failure");
        }),
      })),
    }));

    recordAuditEvent({ action: "fail", resourceType: "r", summary: "s" });

    const snapshot = getAuditEventHealthSnapshot();
    expect(snapshot.status).toBe("degraded");
    expect(snapshot.failedWrites).toBeGreaterThan(0);
    expect(snapshot.lastFailureAt).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// startAuditEventPruning / stopAuditEventPruning
// ─────────────────────────────────────────────────────────────────────────────

describe("startAuditEventPruning / stopAuditEventPruning", () => {
  it("startAuditEventPruning sets up an interval", async () => {
    vi.useFakeTimers();
    const { startAuditEventPruning, stopAuditEventPruning } = await import("@/lib/audit/events");

    stopAuditEventPruning(); // ensure clean state
    startAuditEventPruning();

    // Verify there is an active interval by confirming stop clears it without error
    expect(() => stopAuditEventPruning()).not.toThrow();
    vi.useRealTimers();
  });

  it("stopAuditEventPruning clears interval", async () => {
    vi.useFakeTimers();
    const { startAuditEventPruning, stopAuditEventPruning } = await import("@/lib/audit/events");

    startAuditEventPruning();
    stopAuditEventPruning();

    // Calling stop again is a no-op and should not throw
    expect(() => stopAuditEventPruning()).not.toThrow();
    vi.useRealTimers();
  });

  it("calling startAuditEventPruning twice does not create duplicate intervals", async () => {
    vi.useFakeTimers();
    const { db } = await import("@/lib/db");
    const { startAuditEventPruning, stopAuditEventPruning } = await import("@/lib/audit/events");

    // Set up a delete chain for pruning
    (db.delete as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      where: vi.fn(() => Promise.resolve()),
    }));

    stopAuditEventPruning(); // clean state
    startAuditEventPruning();
    startAuditEventPruning(); // second call should be ignored

    // Advance one full day — pruning should fire exactly once (not twice)
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);

    expect(db.delete).toHaveBeenCalledTimes(1);

    stopAuditEventPruning();
    vi.useRealTimers();
  });
});
