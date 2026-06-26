import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getApiUserMock,
  csrfForbiddenMock,
  consumeApiRateLimitMock,
  resolveCapabilitiesMock,
  verifyPasswordMock,
  verifyAndRehashPasswordMock,
  dbSelectMock,
  readJsonBodyWithLimitMock,
  readUploadedJsonFileWithLimitMock,
  validateExportMock,
  importDatabaseMock,
  parseBackupZipMock,
  restoreParsedBackupFilesMock,
  recordAuditEventMock,
  recordAuditEventDurableMock,
  takePreRestoreSnapshotMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  csrfForbiddenMock: vi.fn(),
  consumeApiRateLimitMock: vi.fn(),
  resolveCapabilitiesMock: vi.fn(),
  verifyPasswordMock: vi.fn(),
  verifyAndRehashPasswordMock: vi.fn(),
  dbSelectMock: vi.fn(),
  readJsonBodyWithLimitMock: vi.fn(),
  readUploadedJsonFileWithLimitMock: vi.fn(),
  validateExportMock: vi.fn(),
  importDatabaseMock: vi.fn(),
  parseBackupZipMock: vi.fn(),
  restoreParsedBackupFilesMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
  recordAuditEventDurableMock: vi.fn<
    (input: { action: string; summary?: string; details?: unknown; [key: string]: unknown }) => Promise<void>
  >(() => Promise.resolve()),
  takePreRestoreSnapshotMock: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({
  getApiUser: getApiUserMock,
  unauthorized: () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
  forbidden: () => new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }),
  csrfForbidden: csrfForbiddenMock,
}));

vi.mock("@/lib/security/api-rate-limit", () => ({
  consumeApiRateLimit: consumeApiRateLimitMock,
}));

vi.mock("@/lib/capabilities/cache", () => ({
  resolveCapabilities: resolveCapabilitiesMock,
}));

vi.mock("@/lib/security/password-hash", () => ({
  verifyPassword: verifyPasswordMock,
  verifyAndRehashPassword: verifyAndRehashPasswordMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
  },
}));

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    eq: vi.fn((_field: unknown, value: unknown) => ({ _eq: value })),
  };
});

vi.mock("@/lib/db/export", () => ({
  streamDatabaseExport: vi.fn(() => new ReadableStream()),
  validateExport: validateExportMock,
  isSanitizedExport: (data: { redactionMode?: string }) => data.redactionMode === "sanitized",
}));

vi.mock("@/lib/db/import", () => ({
  importDatabase: importDatabaseMock,
}));

vi.mock("@/lib/db/import-transfer", () => ({
  MAX_IMPORT_BYTES: 1024 * 1024,
  readJsonBodyWithLimit: readJsonBodyWithLimitMock,
  readUploadedJsonFileWithLimit: readUploadedJsonFileWithLimitMock,
}));

vi.mock("@/lib/audit/events", () => ({
  recordAuditEvent: recordAuditEventMock,
  recordAuditEventDurable: recordAuditEventDurableMock,
}));

vi.mock("@/lib/db/export-with-files", () => ({
  parseBackupZip: parseBackupZipMock,
  restoreParsedBackupFiles: restoreParsedBackupFilesMock,
}));

vi.mock("@/lib/db/pre-restore-snapshot", () => ({
  takePreRestoreSnapshot: takePreRestoreSnapshotMock,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

function makeLimitChain(rows: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue(rows),
      })),
    })),
  };
}

function makeJsonRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: JSON.stringify(body),
  });
}

function makeFormRequest(url: string, formData: FormData) {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "X-Requested-With": "XMLHttpRequest",
    },
    body: formData,
  });
}

describe("destructive backup/import route password confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApiUserMock.mockResolvedValue({
      id: "admin-1",
      role: "admin",
      username: "admin",
      email: "admin@example.com",
      name: "Admin",
      className: null,
      mustChangePassword: false,
    });
    csrfForbiddenMock.mockReturnValue(null);
    consumeApiRateLimitMock.mockResolvedValue(null);
    resolveCapabilitiesMock.mockResolvedValue(new Set(["system.backup"]));
    verifyPasswordMock.mockResolvedValue({ valid: false });
    verifyAndRehashPasswordMock.mockResolvedValue({ valid: false });
    dbSelectMock.mockReturnValue(makeLimitChain([{ passwordHash: "stored-hash" }]));
    validateExportMock.mockReturnValue([]);
    parseBackupZipMock.mockResolvedValue({
      dbExport: {
        version: 1,
        exportedAt: "2026-04-12T00:00:00.000Z",
        sourceDialect: "postgresql",
        appVersion: "test",
        redactionMode: "full-fidelity",
        tables: {},
      },
      uploads: [],
    });
    restoreParsedBackupFilesMock.mockResolvedValue(0);
    readUploadedJsonFileWithLimitMock.mockResolvedValue({
      version: 1,
      exportedAt: "2026-04-12T00:00:00.000Z",
      sourceDialect: "postgresql",
      appVersion: "test",
      redactionMode: "full-fidelity",
      tables: {},
    });
    importDatabaseMock.mockResolvedValue({
      success: true,
      tablesImported: 0,
      totalRowsImported: 0,
      tableResults: {},
      errors: [],
    });
    readJsonBodyWithLimitMock.mockResolvedValue({
      password: "wrong-password",
      data: {
        version: 1,
        exportedAt: "2026-04-12T00:00:00.000Z",
        sourceDialect: "postgresql",
        appVersion: "test",
        redactionMode: "full-fidelity",
        tables: {},
      },
    });
  });

  it("requires password confirmation for POST /api/v1/admin/backup", async () => {
    const { POST } = await import("@/app/api/v1/admin/backup/route");
    const res = await POST(makeJsonRequest("http://localhost:3000/api/v1/admin/backup", {}));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("passwordRequired");
  });

  it("rejects invalid password for POST /api/v1/admin/backup", async () => {
    const { POST } = await import("@/app/api/v1/admin/backup/route");
    const res = await POST(
      makeJsonRequest("http://localhost:3000/api/v1/admin/backup", { password: "wrong-password" })
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("invalidPassword");
  });

  it("requires password confirmation for POST /api/v1/admin/migrate/export", async () => {
    const { POST } = await import("@/app/api/v1/admin/migrate/export/route");
    const res = await POST(makeJsonRequest("http://localhost:3000/api/v1/admin/migrate/export", {}));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("passwordRequired");
  });

  it("rejects invalid password for POST /api/v1/admin/migrate/export", async () => {
    const { POST } = await import("@/app/api/v1/admin/migrate/export/route");
    const res = await POST(
      makeJsonRequest("http://localhost:3000/api/v1/admin/migrate/export", { password: "wrong-password" })
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("invalidPassword");
  });

  it("requires password confirmation for POST /api/v1/admin/restore", async () => {
    const { POST } = await import("@/app/api/v1/admin/restore/route");
    const form = new FormData();
    form.set("file", new File(["{}"], "backup.json", { type: "application/json" }));
    const res = await POST(makeFormRequest("http://localhost:3000/api/v1/admin/restore", form));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("passwordRequired");
  });

  it("rejects invalid password for POST /api/v1/admin/restore", async () => {
    const { POST } = await import("@/app/api/v1/admin/restore/route");
    const form = new FormData();
    form.set("password", "wrong-password");
    form.set("file", new File(["{}"], "backup.json", { type: "application/json" }));
    const res = await POST(makeFormRequest("http://localhost:3000/api/v1/admin/restore", form));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("invalidPassword");
  });

  it("requires password confirmation for POST /api/v1/admin/migrate/import JSON payloads", async () => {
    readJsonBodyWithLimitMock.mockResolvedValue({
      data: {
        version: 1,
        exportedAt: "2026-04-12T00:00:00.000Z",
        sourceDialect: "postgresql",
        appVersion: "test",
        redactionMode: "full-fidelity",
        tables: {},
      },
    });

    const { POST } = await import("@/app/api/v1/admin/migrate/import/route");
    const res = await POST(makeJsonRequest("http://localhost:3000/api/v1/admin/migrate/import", {}));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("passwordRequired");
  });

  it("rejects invalid password for POST /api/v1/admin/migrate/import JSON payloads", async () => {
    const { POST } = await import("@/app/api/v1/admin/migrate/import/route");
    const res = await POST(
      makeJsonRequest("http://localhost:3000/api/v1/admin/migrate/import", { password: "wrong-password" })
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("invalidPassword");
  });
});

describe("backup restore semantic safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApiUserMock.mockResolvedValue({
      id: "admin-1",
      role: "admin",
      username: "admin",
      email: "admin@example.com",
      name: "Admin",
      className: null,
      mustChangePassword: false,
    });
    csrfForbiddenMock.mockReturnValue(null);
    consumeApiRateLimitMock.mockResolvedValue(null);
    resolveCapabilitiesMock.mockResolvedValue(new Set(["system.backup"]));
    verifyPasswordMock.mockResolvedValue({ valid: true });
    verifyAndRehashPasswordMock.mockResolvedValue({ valid: true });
    dbSelectMock.mockReturnValue(makeLimitChain([{ passwordHash: "stored-hash" }]));
    validateExportMock.mockReturnValue([]);
    importDatabaseMock.mockResolvedValue({
      success: true,
      tablesImported: 1,
      totalRowsImported: 1,
      tableResults: {},
      errors: [],
    });
    takePreRestoreSnapshotMock.mockResolvedValue("/tmp/snapshots/test-snapshot.sql");
    restoreParsedBackupFilesMock.mockResolvedValue(0);
  });

  it("rejects sanitized JSON exports on POST /api/v1/admin/restore", async () => {
    readUploadedJsonFileWithLimitMock.mockResolvedValue({
      version: 1,
      exportedAt: "2026-04-12T00:00:00.000Z",
      sourceDialect: "postgresql",
      appVersion: "test",
      redactionMode: "sanitized",
      tables: {},
    });

    const { POST } = await import("@/app/api/v1/admin/restore/route");
    const form = new FormData();
    form.set("password", "correct-password");
    form.set("file", new File(["{}"], "portable-export.json", { type: "application/json" }));
    const res = await POST(makeFormRequest("http://localhost:3000/api/v1/admin/restore", form));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("sanitizedExportNotRestorable");
    expect(importDatabaseMock).not.toHaveBeenCalled();
  });

  it("aborts the destructive import when the pre-restore snapshot fails (NEW-H3)", async () => {
    readUploadedJsonFileWithLimitMock.mockResolvedValue({
      version: 1,
      exportedAt: "2026-04-12T00:00:00.000Z",
      sourceDialect: "postgresql",
      appVersion: "test",
      redactionMode: "full-fidelity",
      tables: {},
    });
    // Snapshot failure (disk full / I/O error) returns null. The route must NOT
    // proceed to the destructive import — there would be no rollback artifact.
    takePreRestoreSnapshotMock.mockResolvedValue(null);

    const { POST } = await import("@/app/api/v1/admin/restore/route");
    const form = new FormData();
    form.set("password", "correct-password");
    form.set("file", new File(["{}"], "portable-export.json", { type: "application/json" }));
    const res = await POST(makeFormRequest("http://localhost:3000/api/v1/admin/restore", form));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("preRestoreSnapshotFailed");
    expect(importDatabaseMock).not.toHaveBeenCalled();
  });

  it("rejects ZIP backups whose integrity manifest fails validation", async () => {
    parseBackupZipMock.mockRejectedValue(new Error("backupIntegrityMismatch"));

    const { POST } = await import("@/app/api/v1/admin/restore/route");
    const form = new FormData();
    form.set("password", "correct-password");
    form.set("file", new File([new Uint8Array([1, 2, 3])], "backup.zip", { type: "application/zip" }));
    const res = await POST(makeFormRequest("http://localhost:3000/api/v1/admin/restore", form));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("invalidBackupIntegrity");
    expect(importDatabaseMock).not.toHaveBeenCalled();
  });

  it("rejects ZIP backups that exceed restore expansion limits", async () => {
    parseBackupZipMock.mockRejectedValue(new Error("backupZipTooLarge"));

    const { POST } = await import("@/app/api/v1/admin/restore/route");
    const form = new FormData();
    form.set("password", "correct-password");
    form.set("file", new File([new Uint8Array([1, 2, 3])], "backup.zip", { type: "application/zip" }));
    const res = await POST(makeFormRequest("http://localhost:3000/api/v1/admin/restore", form));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("fileTooLarge");
    expect(importDatabaseMock).not.toHaveBeenCalled();
  });

  it("records the restore audit AFTER importDatabase commits via the durable helper so it survives the truncate and a crash", async () => {
    // importDatabase truncates `auditEvents` inside its transaction. The audit
    // must be recorded post-commit with the DURABLE helper (awaited insert) or
    // the row is wiped by the truncate — and would also be lost on a hard
    // crash within the buffered helper's 5s flush window.
    readUploadedJsonFileWithLimitMock.mockResolvedValue({
      version: 1,
      exportedAt: "2026-04-12T00:00:00.000Z",
      sourceDialect: "postgresql",
      appVersion: "test",
      redactionMode: "full-fidelity",
      tables: {},
    });

    const { POST } = await import("@/app/api/v1/admin/restore/route");
    const form = new FormData();
    form.set("password", "correct-password");
    form.set(
      "file",
      new File([JSON.stringify({})], "backup.json", { type: "application/json" }),
    );
    const res = await POST(makeFormRequest("http://localhost:3000/api/v1/admin/restore", form));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // The DURABLE helper is used (not the buffered recordAuditEvent).
    expect(recordAuditEventDurableMock).toHaveBeenCalledTimes(1);
    expect(recordAuditEventMock).not.toHaveBeenCalled();
    expect(importDatabaseMock).toHaveBeenCalledBefore(recordAuditEventDurableMock);
    expect(recordAuditEventDurableMock.mock.calls[0][0].action).toBe(
      "system_settings.database_restored",
    );
  });

  it("records the restore audit AFTER file restoration completes for ZIP restores", async () => {
    parseBackupZipMock.mockResolvedValue({
      dbExport: {
        version: 1,
        exportedAt: "2026-04-12T00:00:00.000Z",
        sourceDialect: "postgresql",
        appVersion: "test",
        redactionMode: "full-fidelity",
        tables: {},
      },
      uploads: [
        { storedName: "a.bin", buffer: Buffer.from("a") },
        { storedName: "b.bin", buffer: Buffer.from("b") },
      ],
    });
    restoreParsedBackupFilesMock.mockResolvedValue(2);

    const { POST } = await import("@/app/api/v1/admin/restore/route");
    const form = new FormData();
    form.set("password", "correct-password");
    form.set(
      "file",
      new File([new Uint8Array([1, 2, 3])], "backup.zip", { type: "application/zip" }),
    );
    const res = await POST(makeFormRequest("http://localhost:3000/api/v1/admin/restore", form));

    expect(res.status).toBe(200);
    expect(recordAuditEventDurableMock).toHaveBeenCalledTimes(1);
    // Audit fires only after file restoration completes (not before).
    expect(restoreParsedBackupFilesMock).toHaveBeenCalledBefore(recordAuditEventDurableMock);
    const auditPayload = recordAuditEventDurableMock.mock.calls[0][0];
    expect(auditPayload.summary).toContain("2 files written");
    expect(auditPayload.details).toEqual({
      preRestoreSnapshotPath: "/tmp/snapshots/test-snapshot.sql",
    });
  });

  it("records a durable failure audit and surfaces the snapshot path when file restoration fails after the DB commit", async () => {
    parseBackupZipMock.mockResolvedValue({
      dbExport: {
        version: 1,
        exportedAt: "2026-04-12T00:00:00.000Z",
        sourceDialect: "postgresql",
        appVersion: "test",
        redactionMode: "full-fidelity",
        tables: {},
      },
      uploads: [{ storedName: "a.bin", buffer: Buffer.from("a") }],
    });
    restoreParsedBackupFilesMock.mockRejectedValue(new Error("ENOSPC"));

    const { POST } = await import("@/app/api/v1/admin/restore/route");
    const form = new FormData();
    form.set("password", "correct-password");
    form.set(
      "file",
      new File([new Uint8Array([1, 2, 3])], "backup.zip", { type: "application/zip" }),
    );
    const res = await POST(makeFormRequest("http://localhost:3000/api/v1/admin/restore", form));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("restoreFailed");
    expect(body.preRestoreSnapshotPath).toBe("/tmp/snapshots/test-snapshot.sql");
    // The success audit must NOT fire; a dedicated failure audit must.
    const successCalls = recordAuditEventDurableMock.mock.calls.filter(
      (c) => c[0].action === "system_settings.database_restored",
    );
    const failureCalls = recordAuditEventDurableMock.mock.calls.filter(
      (c) => c[0].action === "system_settings.database_restore_files_failed",
    );
    expect(successCalls).toHaveLength(0);
    expect(failureCalls).toHaveLength(1);
  });

  it("does not record the restore audit when importDatabase fails", async () => {
    importDatabaseMock.mockResolvedValue({
      success: false,
      tablesImported: 0,
      totalRowsImported: 0,
      tableResults: {},
      errors: ["boom"],
    });
    readUploadedJsonFileWithLimitMock.mockResolvedValue({
      version: 1,
      exportedAt: "2026-04-12T00:00:00.000Z",
      sourceDialect: "postgresql",
      appVersion: "test",
      redactionMode: "full-fidelity",
      tables: {},
    });

    const { POST } = await import("@/app/api/v1/admin/restore/route");
    const form = new FormData();
    form.set("password", "correct-password");
    form.set(
      "file",
      new File([JSON.stringify({})], "backup.json", { type: "application/json" }),
    );
    const res = await POST(makeFormRequest("http://localhost:3000/api/v1/admin/restore", form));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("restoreFailed");
    expect(body.preRestoreSnapshotPath).toBe("/tmp/snapshots/test-snapshot.sql");
    expect(recordAuditEventDurableMock).not.toHaveBeenCalled();
  });
});
