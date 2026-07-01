import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const {
  dbSelectMock,
  getSystemSettingsMock,
  consumeUserDailyQuotaMock,
  resolveCapabilitiesMock,
} = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
  getSystemSettingsMock: vi.fn(),
  consumeUserDailyQuotaMock: vi.fn(),
  resolveCapabilitiesMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  users: {
    id: "users.id",
    emailVerified: "users.emailVerified",
    role: "users.role",
  },
}));

vi.mock("@/lib/system-settings", () => ({
  getSystemSettings: getSystemSettingsMock,
}));

vi.mock("@/lib/security/api-rate-limit", () => ({
  consumeUserDailyQuota: consumeUserDailyQuotaMock,
}));

vi.mock("@/lib/capabilities/cache", () => ({
  resolveCapabilities: resolveCapabilitiesMock,
}));

function mockUserRow(row: { emailVerified: Date | null; role: string } | undefined) {
  const rows = row ? [row] : [];
  dbSelectMock.mockReturnValue({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve(rows)),
      })),
    })),
  });
}

async function importGate() {
  vi.resetModules();
  return import("@/lib/security/sandbox-gate");
}

afterEach(() => {
  delete process.env.SANDBOX_ALLOW_UNVERIFIED_EMAIL;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("gateSandboxEndpoint", () => {
  beforeEach(() => {
    getSystemSettingsMock.mockResolvedValue({ emailVerificationRequired: true });
    resolveCapabilitiesMock.mockResolvedValue(new Set());
    consumeUserDailyQuotaMock.mockResolvedValue(null);
  });

  it("returns a 403 when the user's email is not verified", async () => {
    mockUserRow({ emailVerified: null, role: "student" });

    const { gateSandboxEndpoint } = await importGate();
    const result = await gateSandboxEndpoint({ userId: "user-1", endpoint: "sandbox:run", maxPerDay: 10 });

    expect(result).toBeInstanceOf(NextResponse);
    expect(result?.status).toBe(403);
    const body = await result?.json();
    expect(body.error).toBe("emailVerificationRequired");
    expect(consumeUserDailyQuotaMock).not.toHaveBeenCalled();
  });

  it("returns null when the user is verified and under the daily quota", async () => {
    mockUserRow({ emailVerified: new Date("2026-01-01T00:00:00Z"), role: "student" });

    const { gateSandboxEndpoint } = await importGate();
    const result = await gateSandboxEndpoint({ userId: "user-1", endpoint: "sandbox:run", maxPerDay: 10 });

    expect(result).toBeNull();
    expect(consumeUserDailyQuotaMock).toHaveBeenCalledWith("user-1", "sandbox:run", 10);
  });

  it("returns a 429 when the user is verified but over the daily quota", async () => {
    mockUserRow({ emailVerified: new Date("2026-01-01T00:00:00Z"), role: "student" });
    consumeUserDailyQuotaMock.mockResolvedValue(
      NextResponse.json({ error: "dailyQuotaExceeded" }, { status: 429 })
    );

    const { gateSandboxEndpoint } = await importGate();
    const result = await gateSandboxEndpoint({ userId: "user-1", endpoint: "sandbox:run", maxPerDay: 10 });

    expect(result).toBeInstanceOf(NextResponse);
    expect(result?.status).toBe(429);
    const body = await result?.json();
    expect(body.error).toBe("dailyQuotaExceeded");
  });

  it("bypasses the quota and returns null for an admin with system.settings capability", async () => {
    mockUserRow({ emailVerified: null, role: "admin" });
    resolveCapabilitiesMock.mockResolvedValue(new Set(["system.settings"]));
    consumeUserDailyQuotaMock.mockResolvedValue(
      NextResponse.json({ error: "dailyQuotaExceeded" }, { status: 429 })
    );

    const { gateSandboxEndpoint } = await importGate();
    const result = await gateSandboxEndpoint({ userId: "admin-1", endpoint: "sandbox:run", maxPerDay: 10 });

    expect(result).toBeNull();
    expect(consumeUserDailyQuotaMock).not.toHaveBeenCalled();
  });
});
