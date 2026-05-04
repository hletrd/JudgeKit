import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dbInsertValues: vi.fn<(...args: unknown[]) => Promise<void>>(),
  dbExecute: vi.fn<(...args: unknown[]) => Promise<{ rowCount: number }>>(),
  normalizeText: vi.fn((text: unknown, _max: number) => (text == null ? null : String(text))),
  getClientIp: vi.fn(() => "127.0.0.1"),
  getRequestPath: vi.fn(() => "/test"),
  MAX_TEXT_LENGTH: 512,
  MAX_PATH_LENGTH: 256,
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
  loggerDebug: vi.fn(),
  headers: vi.fn(async () => new Headers()),
  lt: vi.fn((_field: unknown, value: unknown) => ({ _lt: value })),
}));

vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: mocks.dbInsertValues,
    })),
    execute: mocks.dbExecute,
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

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();

  mocks.dbInsertValues.mockResolvedValue(undefined);
  mocks.dbExecute.mockResolvedValue({ rowCount: 0 });
  mocks.normalizeText.mockImplementation((text: unknown, _max: number) =>
    text == null ? null : String(text)
  );
  mocks.getClientIp.mockReturnValue("127.0.0.1");
  mocks.getRequestPath.mockReturnValue("/test");
});

afterEach(() => {
  delete (globalThis as { __auditPruneTimer?: unknown }).__auditPruneTimer;
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

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

describe("recordAuditEvent", () => {
  it("buffers and flushes audit events with all fields", async () => {
    const { recordAuditEvent, flushAuditBuffer } = await import("@/lib/audit/events");
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

    expect(db.insert).not.toHaveBeenCalled();
    await flushAuditBuffer();

    expect(db.insert).toHaveBeenCalled();
    const batch = mocks.dbInsertValues.mock.calls.at(-1)?.[0] as Array<Record<string, unknown>>;
    expect(batch).toHaveLength(1);
    expect(batch[0]).toMatchObject({
      actorId: "user-1",
      actorRole: "admin",
      action: "user.created",
      resourceType: "user",
      resourceId: "user-2",
      resourceLabel: "newuser",
      summary: "Created user newuser",
      details: JSON.stringify({ foo: "bar" }),
    });
  });

  it("uses buildAuditRequestContext when request is provided", async () => {
    const { recordAuditEvent, flushAuditBuffer } = await import("@/lib/audit/events");

    mocks.getClientIp.mockReturnValue("192.168.1.1");
    mocks.getRequestPath.mockReturnValue("/api/users");

    const hdrs = new Headers({ "user-agent": "TestBrowser" });
    recordAuditEvent({
      action: "user.login",
      resourceType: "session",
      summary: "User logged in",
      request: { headers: hdrs, method: "POST", url: "http://localhost/api/users" },
    });

    await flushAuditBuffer();

    expect(mocks.getClientIp).toHaveBeenCalledWith(hdrs);
    expect(mocks.getRequestPath).toHaveBeenCalledWith("http://localhost/api/users");
    const batch = mocks.dbInsertValues.mock.calls.at(-1)?.[0] as Array<Record<string, unknown>>;
    expect(batch[0]).toMatchObject({
      ipAddress: "192.168.1.1",
      userAgent: "TestBrowser",
      requestMethod: "POST",
      requestPath: "/api/users",
    });
  });

  it("uses context directly when context is provided instead of request", async () => {
    const { recordAuditEvent, flushAuditBuffer } = await import("@/lib/audit/events");

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
    await flushAuditBuffer();

    const batch = mocks.dbInsertValues.mock.calls.at(-1)?.[0] as Array<Record<string, unknown>>;
    expect(batch[0]).toMatchObject(context);
    expect(mocks.getClientIp).not.toHaveBeenCalled();
  });

  it("handles DB write failure gracefully and logs warning", async () => {
    const { recordAuditEvent, flushAuditBuffer } = await import("@/lib/audit/events");

    mocks.dbInsertValues.mockRejectedValueOnce(new Error("db write failed"));

    recordAuditEvent({
      action: "user.login",
      resourceType: "session",
      summary: "Test",
    });

    await expect(flushAuditBuffer()).resolves.toBeUndefined();
    expect(mocks.loggerWarn).toHaveBeenCalled();
  });

  it("tracks consecutive failures and logs critical after MAX_SILENT_FAILURES (3)", async () => {
    const { recordAuditEvent, flushAuditBuffer } = await import("@/lib/audit/events");

    mocks.dbInsertValues
      .mockRejectedValueOnce(new Error("db error 1"))
      .mockRejectedValueOnce(new Error("db error 2"))
      .mockRejectedValueOnce(new Error("db error 3"));

    for (let i = 0; i < 3; i += 1) {
      recordAuditEvent({ action: "a", resourceType: "r", summary: "s" });
      await flushAuditBuffer();
    }

    expect(mocks.loggerError).toHaveBeenCalled();
  });

  it("resets consecutiveAuditFailures on success", async () => {
    const { recordAuditEvent, flushAuditBuffer } = await import("@/lib/audit/events");

    mocks.dbInsertValues
      .mockRejectedValueOnce(new Error("db error 1"))
      .mockRejectedValueOnce(new Error("db error 2"))
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("db error 4"));

    recordAuditEvent({ action: "a", resourceType: "r", summary: "s" });
    await flushAuditBuffer();
    recordAuditEvent({ action: "a", resourceType: "r", summary: "s" });
    await flushAuditBuffer();
    recordAuditEvent({ action: "a", resourceType: "r", summary: "s" });
    await flushAuditBuffer();

    mocks.loggerWarn.mockClear();
    mocks.loggerError.mockClear();

    recordAuditEvent({ action: "a", resourceType: "r", summary: "s" });
    await flushAuditBuffer();

    expect(mocks.loggerWarn).toHaveBeenCalled();
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });

  it("re-buffers lost events before newer events to preserve chronological order", async () => {
    const { recordAuditEvent, flushAuditBuffer } = await import("@/lib/audit/events");

    // First flush fails — events "a1" and "a2" are re-buffered
    mocks.dbInsertValues.mockRejectedValueOnce(new Error("db error"));

    recordAuditEvent({ action: "a1", resourceType: "r", summary: "s" });
    recordAuditEvent({ action: "a2", resourceType: "r", summary: "s" });
    await flushAuditBuffer();

    // New events are recorded after the failed flush
    recordAuditEvent({ action: "a3", resourceType: "r", summary: "s" });

    // Next flush succeeds — verify insertion order preserves chronology.
    // The failed batch (a1, a2) was prepended before newer events (a3),
    // so the buffer order is [a1, a2, a3] — older events first, newer last.
    await flushAuditBuffer();

    const batch = mocks.dbInsertValues.mock.calls.at(-1)?.[0] as Array<Record<string, unknown>>;
    expect(batch).toHaveLength(3);
    expect(batch[0]).toMatchObject({ action: "a1" });
    expect(batch[1]).toMatchObject({ action: "a2" });
    expect(batch[2]).toMatchObject({ action: "a3" });
  });
});

describe("getAuditEventHealthSnapshot", () => {
  it("returns ok status when no failures have occurred", async () => {
    const { getAuditEventHealthSnapshot } = await import("@/lib/audit/events");

    expect(getAuditEventHealthSnapshot()).toEqual({
      failedWrites: 0,
      droppedEvents: 0,
      lastFailureAt: null,
      status: "ok",
    });
  });

  it("returns degraded status after a failure", async () => {
    const { recordAuditEvent, flushAuditBuffer, getAuditEventHealthSnapshot } = await import("@/lib/audit/events");

    mocks.dbInsertValues.mockRejectedValueOnce(new Error("forced failure"));

    recordAuditEvent({ action: "fail", resourceType: "r", summary: "s" });
    await flushAuditBuffer();

    const snapshot = getAuditEventHealthSnapshot();
    expect(snapshot.status).toBe("degraded");
    expect(snapshot.failedWrites).toBeGreaterThan(0);
    expect(snapshot.lastFailureAt).not.toBeNull();
  });
});

describe("startAuditEventPruning / stopAuditEventPruning", () => {
  it("startAuditEventPruning is a no-op (pruning consolidated into data-retention-maintenance)", async () => {
    const { startAuditEventPruning, stopAuditEventPruning } = await import("@/lib/audit/events");

    // Audit event pruning was consolidated into startSensitiveDataPruning()
    // in src/lib/data-retention-maintenance.ts. These stubs are kept for
    // backward compatibility with instrumentation.ts.
    mocks.dbExecute.mockResolvedValue({ rowCount: 0 });
    startAuditEventPruning();
    await Promise.resolve();

    // Should NOT trigger any DB queries — pruning is now handled elsewhere
    expect(mocks.dbExecute).toHaveBeenCalledTimes(0);
    expect(() => stopAuditEventPruning()).not.toThrow();
  });

  it("stopAuditEventPruning is a no-op", async () => {
    const { startAuditEventPruning, stopAuditEventPruning } = await import("@/lib/audit/events");

    startAuditEventPruning();
    stopAuditEventPruning();

    expect(() => stopAuditEventPruning()).not.toThrow();
  });
});
