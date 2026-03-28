import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  return {
    isTrustedServerActionOrigin: vi.fn<() => Promise<boolean>>(),
    auth: vi.fn<() => Promise<{ user: { id: string; role: string } } | null>>(),
    checkServerActionRateLimit: vi.fn<() => { error: string } | null>(),
    buildServerActionAuditContext: vi.fn<() => Promise<Record<string, string>>>(),
    recordAuditEvent: vi.fn(),
    invalidateSettingsCache: vi.fn(),
    revalidatePath: vi.fn(),

    dbInsertValues: vi.fn(),
    dbInsertOnConflictDoUpdate: vi.fn(),
  };
});

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@/lib/security/server-actions", () => ({
  isTrustedServerActionOrigin: mocks.isTrustedServerActionOrigin,
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/security/api-rate-limit", () => ({
  checkServerActionRateLimit: mocks.checkServerActionRateLimit,
}));

vi.mock("@/lib/audit/events", () => ({
  buildServerActionAuditContext: mocks.buildServerActionAuditContext,
  recordAuditEvent: mocks.recordAuditEvent,
}));

vi.mock("@/lib/system-settings", () => ({
  GLOBAL_SETTINGS_ID: "global",
}));

vi.mock("@/lib/system-settings-config", () => ({
  invalidateSettingsCache: mocks.invalidateSettingsCache,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/db/schema", () => ({
  systemSettings: { id: "systemSettings.id" },
}));

vi.mock("@/lib/validators/system-settings", async () => {
  const actual = await vi.importActual<typeof import("@/lib/validators/system-settings")>(
    "@/lib/validators/system-settings"
  );
  return actual;
});

vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn((...args: unknown[]) => {
        mocks.dbInsertValues(...args);
        return {
          onConflictDoUpdate: vi.fn((...opts: unknown[]) => {
            mocks.dbInsertOnConflictDoUpdate(...opts);
            return Promise.resolve();
          }),
        };
      }),
    })),
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function setupAuthorizedAdmin(role: "admin" | "super_admin" = "admin") {
  mocks.isTrustedServerActionOrigin.mockResolvedValue(true);
  mocks.auth.mockResolvedValue({
    user: { id: "actor-1", role },
  });
  mocks.checkServerActionRateLimit.mockReturnValue(null);
  mocks.buildServerActionAuditContext.mockResolvedValue({
    ipAddress: "127.0.0.1",
    userAgent: "test",
    requestMethod: "SERVER_ACTION",
    requestPath: "/dashboard/admin/settings",
  });
}

const validInput = {
  siteTitle: "JudgeKit",
  siteDescription: "A competitive programming judge",
  timeZone: "UTC",
  aiAssistantEnabled: true,
};

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("updateSystemSettings", () => {
  it("returns unauthorized when origin is not trusted", async () => {
    const { updateSystemSettings } = await import("@/lib/actions/system-settings");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(false);

    const result = await updateSystemSettings(validInput);
    expect(result).toEqual({ success: false, error: "unauthorized" });
  });

  it("returns unauthorized when session has no user", async () => {
    const { updateSystemSettings } = await import("@/lib/actions/system-settings");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(true);
    mocks.auth.mockResolvedValue(null);

    const result = await updateSystemSettings(validInput);
    expect(result).toEqual({ success: false, error: "unauthorized" });
  });

  it("returns unauthorized when user is not admin or super_admin", async () => {
    const { updateSystemSettings } = await import("@/lib/actions/system-settings");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(true);
    mocks.auth.mockResolvedValue({
      user: { id: "u1", role: "student" },
    });

    const result = await updateSystemSettings(validInput);
    expect(result).toEqual({ success: false, error: "unauthorized" });
  });

  it("returns rateLimited when rate limit is exceeded", async () => {
    const { updateSystemSettings } = await import("@/lib/actions/system-settings");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(true);
    mocks.auth.mockResolvedValue({ user: { id: "actor-1", role: "admin" } });
    mocks.checkServerActionRateLimit.mockReturnValue({ error: "rateLimited" });

    const result = await updateSystemSettings(validInput);
    expect(result).toEqual({ success: false, error: "rateLimited" });
  });

  it("returns validation error for invalid input", async () => {
    const { updateSystemSettings } = await import("@/lib/actions/system-settings");
    setupAuthorizedAdmin();

    // siteTitle over 100 chars is invalid
    const result = await updateSystemSettings({
      siteTitle: "x".repeat(101),
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("returns validation error for invalid timezone", async () => {
    const { updateSystemSettings } = await import("@/lib/actions/system-settings");
    setupAuthorizedAdmin();

    const result = await updateSystemSettings({
      timeZone: "Not/A/Valid/Timezone/String/123",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("invalidTimeZone");
  });

  it("successfully updates settings and returns success", async () => {
    const { updateSystemSettings } = await import("@/lib/actions/system-settings");
    setupAuthorizedAdmin();

    const result = await updateSystemSettings(validInput);
    expect(result).toEqual({ success: true });
    expect(mocks.dbInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "global",
        siteTitle: "JudgeKit",
        siteDescription: "A competitive programming judge",
        timeZone: "UTC",
        aiAssistantEnabled: true,
      })
    );
  });

  it("calls invalidateSettingsCache on success", async () => {
    const { updateSystemSettings } = await import("@/lib/actions/system-settings");
    setupAuthorizedAdmin();

    await updateSystemSettings(validInput);
    expect(mocks.invalidateSettingsCache).toHaveBeenCalledOnce();
  });

  it("records audit event on success", async () => {
    const { updateSystemSettings } = await import("@/lib/actions/system-settings");
    setupAuthorizedAdmin();

    await updateSystemSettings(validInput);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "actor-1",
        action: "system_settings.updated",
        resourceType: "system_settings",
        resourceId: "global",
      })
    );
  });

  it("calls revalidatePath for the settings page on success", async () => {
    const { updateSystemSettings } = await import("@/lib/actions/system-settings");
    setupAuthorizedAdmin();

    await updateSystemSettings(validInput);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard/admin/settings");
  });

  it("works when called by a super_admin", async () => {
    const { updateSystemSettings } = await import("@/lib/actions/system-settings");
    setupAuthorizedAdmin("super_admin");

    const result = await updateSystemSettings(validInput);
    expect(result).toEqual({ success: true });
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ actorRole: "super_admin" })
    );
  });

  it("stores null for siteTitle when not provided", async () => {
    const { updateSystemSettings } = await import("@/lib/actions/system-settings");
    setupAuthorizedAdmin();

    await updateSystemSettings({});
    expect(mocks.dbInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        siteTitle: null,
        siteDescription: null,
        timeZone: null,
      })
    );
  });
});
