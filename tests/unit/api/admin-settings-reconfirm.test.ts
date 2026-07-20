import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

/**
 * Behavioral coverage for the admin/settings PUT password-reconfirm gate
 * (C3-AGG-7 / NEW-M5). Mutating any privilege-affecting key must require
 * current-password reconfirmation so a stolen session cannot silently weaken
 * the platform's security posture. Mirrors the restore/backup/migrate gate.
 */

const {
  dbSelectMock,
  dbUpdateMock,
  dbInsertMock,
  verifyAndRehashPasswordMock,
  isHcaptchaConfiguredMock,
  getSystemSettingsMock,
  invalidateSettingsCacheMock,
  getDbNowUncachedMock,
  recordAuditEventDurableMock,
} = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  dbInsertMock: vi.fn(),
  verifyAndRehashPasswordMock: vi.fn(),
  isHcaptchaConfiguredMock: vi.fn().mockResolvedValue(true),
  getSystemSettingsMock: vi.fn().mockResolvedValue(null),
  invalidateSettingsCacheMock: vi.fn(),
  getDbNowUncachedMock: vi.fn().mockResolvedValue(new Date("2026-04-20T12:00:00Z")),
  recordAuditEventDurableMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/api/handler", () => ({
  createApiHandler:
    ({ handler }: { handler: (req: NextRequest, ctx: any) => Promise<Response> }) =>
    async (req: NextRequest, _routeCtx?: unknown) =>
      handler(req, {
        user: { id: "admin-1", role: "super_admin" },
        body: (req as unknown as { __body: Record<string, unknown> }).__body,
      }),
}));

vi.mock("@/lib/api/responses", () => ({
  apiSuccess: (data: unknown, init?: { status?: number }) =>
    NextResponse.json(data, { status: init?.status ?? 200 }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
    update: dbUpdateMock,
    insert: dbInsertMock,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  systemSettings: { id: "systemSettings.id" },
  users: { id: "users.id", passwordHash: "users.passwordHash" },
}));

vi.mock("@/lib/security/password-hash", () => ({
  verifyAndRehashPassword: verifyAndRehashPasswordMock,
}));

vi.mock("@/lib/security/hcaptcha", () => ({
  isHcaptchaConfigured: isHcaptchaConfiguredMock,
}));

vi.mock("@/lib/security/encryption", () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  redactSecret: vi.fn((v: string) => `redacted:${v}`),
}));

vi.mock("@/lib/security/secrets", () => ({
  SECRET_SETTINGS_KEYS: ["hcaptchaSecret", "smtpPass"],
}));

vi.mock("@/lib/system-settings", () => ({
  getSystemSettings: getSystemSettingsMock,
  DEFAULT_PLATFORM_MODE: "homework",
  GLOBAL_SETTINGS_ID: "global",
}));

vi.mock("@/lib/system-settings-config", () => ({
  invalidateSettingsCache: invalidateSettingsCacheMock,
}));

vi.mock("@/lib/db-time", () => ({
  getDbNowUncached: getDbNowUncachedMock,
}));

vi.mock("@/lib/audit/events", () => ({
  recordAuditEventDurable: recordAuditEventDurableMock,
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn((_f: unknown, v: unknown) => ({ eq: v })) }));

function makePut(body: Record<string, unknown>) {
  const req = new NextRequest("http://localhost/api/v1/admin/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  (req as unknown as { __body: Record<string, unknown> }).__body = body;
  return req;
}

describe("PUT /api/v1/admin/settings password reconfirm (C3-AGG-7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isHcaptchaConfiguredMock.mockResolvedValue(true);
    getSystemSettingsMock.mockResolvedValue(null);
    // Stub the settings UPDATE + INSERT(upsert) chains used by the success path.
    const setMock = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    dbUpdateMock.mockReturnValue({ set: setMock });
    dbInsertMock.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    });
  });

  it("requires currentPassword when a sensitive key (publicSignupEnabled) is present", async () => {
    const { PUT } = await import("@/app/api/v1/admin/settings/route");
    const res = await PUT(makePut({ publicSignupEnabled: true }), { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "passwordReconfirmRequired" });
  });

  it("rejects an incorrect currentPassword for a sensitive key", async () => {
    dbSelectMock.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{ passwordHash: "hash" }]) })),
      })),
    });
    verifyAndRehashPasswordMock.mockResolvedValue({ valid: false });

    const { PUT } = await import("@/app/api/v1/admin/settings/route");
    const res = await PUT(makePut({ allowedHosts: ["example.com"], currentPassword: "wrong" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "invalidPassword" });
  });

  it("does NOT require reconfirm for a non-sensitive cosmetic key (siteTitle)", async () => {
    const { PUT } = await import("@/app/api/v1/admin/settings/route");
    const res = await PUT(makePut({ siteTitle: "New Title" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    expect(verifyAndRehashPasswordMock).not.toHaveBeenCalled();
  });

  it("does NOT wipe unspecified sensitive fields on a cosmetic-only PUT (C4-N1)", async () => {
    // A PUT touching only siteTitle must not overwrite hcaptchaSecret/publicSignupEnabled
    // with defaults. Previously the unconditional baseValues wiped them as a side effect.
    const onConflictMock = vi.fn().mockResolvedValue(undefined);
    dbInsertMock.mockReturnValue({
      values: vi.fn().mockReturnValue({ onConflictDoUpdate: onConflictMock }),
    });

    const { PUT } = await import("@/app/api/v1/admin/settings/route");
    const res = await PUT(makePut({ siteTitle: "New Title" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);

    expect(onConflictMock).toHaveBeenCalledTimes(1);
    const setArg = onConflictMock.mock.calls[0]?.[0]?.set ?? onConflictMock.mock.calls[0]?.[0];
    // siteTitle is supplied → present; the sensitive fields are NOT supplied → absent.
    expect(setArg).toMatchObject({ siteTitle: "New Title" });
    expect(setArg).not.toHaveProperty("hcaptchaSecret");
    expect(setArg).not.toHaveProperty("publicSignupEnabled");
    expect(setArg).not.toHaveProperty("platformMode");
  });

  it("requires reconfirm for the exam-integrity toggle allowAiAssistantInRestrictedModes (C4-3)", async () => {
    const { PUT } = await import("@/app/api/v1/admin/settings/route");
    const res = await PUT(makePut({ allowAiAssistantInRestrictedModes: true }), { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "passwordReconfirmRequired" });
  });
});

describe("PUT /api/v1/admin/settings warm pool persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isHcaptchaConfiguredMock.mockResolvedValue(true);
    getSystemSettingsMock.mockResolvedValue(null);
    const setMock = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    dbUpdateMock.mockReturnValue({ set: setMock });
    dbInsertMock.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    });
  });

  it("persists warmPool from the allowlisted config keys without reconfirm", async () => {
    const onConflictMock = vi.fn().mockResolvedValue(undefined);
    dbInsertMock.mockReturnValue({
      values: vi.fn().mockReturnValue({ onConflictDoUpdate: onConflictMock }),
    });

    const { PUT } = await import("@/app/api/v1/admin/settings/route");
    const warmPool = { enabled: true, languages: { python: 2 } };
    const res = await PUT(makePut({ warmPool }), { params: Promise.resolve({}) });

    expect(res.status).toBe(200);
    expect(verifyAndRehashPasswordMock).not.toHaveBeenCalled();
    expect(onConflictMock).toHaveBeenCalledTimes(1);
    const setArg = onConflictMock.mock.calls[0]?.[0]?.set ?? onConflictMock.mock.calls[0]?.[0];
    expect(setArg.warmPool).toEqual(warmPool);
  });

  it("does not touch warmPool when the payload omits it", async () => {
    const onConflictMock = vi.fn().mockResolvedValue(undefined);
    dbInsertMock.mockReturnValue({
      values: vi.fn().mockReturnValue({ onConflictDoUpdate: onConflictMock }),
    });

    const { PUT } = await import("@/app/api/v1/admin/settings/route");
    const res = await PUT(makePut({ siteTitle: "New Title" }), { params: Promise.resolve({}) });

    expect(res.status).toBe(200);
    const setArg = onConflictMock.mock.calls[0]?.[0]?.set ?? onConflictMock.mock.calls[0]?.[0];
    expect(setArg).not.toHaveProperty("warmPool");
  });
});
