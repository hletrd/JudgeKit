import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  return {
    isTrustedServerActionOrigin: vi.fn<() => Promise<boolean>>(),
    auth: vi.fn<() => Promise<{ user: { id: string; role: string } } | null>>(),
    resolveCapabilities: vi.fn<(role: string) => Promise<Set<string>>>(),
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

vi.mock("@/lib/capabilities/cache", () => ({
  resolveCapabilities: mocks.resolveCapabilities,
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
  DEFAULT_PLATFORM_MODE: "homework",
}));

vi.mock("@/lib/system-settings-config", () => ({
  invalidateSettingsCache: mocks.invalidateSettingsCache,
}));

vi.mock("@/lib/security/hcaptcha", () => ({
  isHcaptchaConfigured: vi.fn(() => Promise.resolve(true)),
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
  mocks.resolveCapabilities.mockResolvedValue(new Set(["system.settings"]));
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
  platformMode: "contest" as const,
  aiAssistantEnabled: true,
  publicSignupEnabled: false,
  signupHcaptchaEnabled: false,
};

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveCapabilities.mockImplementation((role: string) =>
    Promise.resolve(new Set(role === "admin" || role === "super_admin" ? ["system.settings"] : []))
  );
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

  it("returns unauthorized when user lacks system.settings", async () => {
    const { updateSystemSettings } = await import("@/lib/actions/system-settings");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(true);
    mocks.auth.mockResolvedValue({
      user: { id: "u1", role: "student" },
    });
    mocks.resolveCapabilities.mockResolvedValue(new Set());

    const result = await updateSystemSettings(validInput);
    expect(result).toEqual({ success: false, error: "unauthorized" });
  });

  it("allows a custom role with system.settings", async () => {
    const { updateSystemSettings } = await import("@/lib/actions/system-settings");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(true);
    mocks.auth.mockResolvedValue({
      user: { id: "ops-1", role: "ops_manager" },
    });
    mocks.resolveCapabilities.mockResolvedValue(new Set(["system.settings"]));
    mocks.checkServerActionRateLimit.mockReturnValue(null);
    mocks.buildServerActionAuditContext.mockResolvedValue({
      ipAddress: "127.0.0.1",
      userAgent: "test",
      requestMethod: "SERVER_ACTION",
      requestPath: "/dashboard/admin/settings",
    });

    const result = await updateSystemSettings(validInput);
    expect(result).toEqual({ success: true });
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

  it("rejects enabling sign-up hCaptcha when credentials are unavailable", async () => {
    const { updateSystemSettings } = await import("@/lib/actions/system-settings");
    const { isHcaptchaConfigured } = await import("@/lib/security/hcaptcha");
    vi.mocked(isHcaptchaConfigured).mockResolvedValue(false);
    setupAuthorizedAdmin();

    const result = await updateSystemSettings({
      publicSignupEnabled: true,
      signupHcaptchaEnabled: true,
    });

    expect(result).toEqual({ success: false, error: "signupHcaptchaUnavailable" });
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
        platformMode: "contest",
        aiAssistantEnabled: true,
      })
    );
  });

  it("does not overwrite unrelated settings when a tab submits only one field", async () => {
    const { updateSystemSettings } = await import("@/lib/actions/system-settings");
    setupAuthorizedAdmin();

    const result = await updateSystemSettings({
      allowedHosts: ["algo.xylolabs.com"],
    });

    expect(result).toEqual({ success: true });
    expect(mocks.dbInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "global",
        allowedHosts: JSON.stringify(["algo.xylolabs.com"]),
      })
    );

    const insertedValues = mocks.dbInsertValues.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(insertedValues).not.toHaveProperty("siteTitle");
    expect(insertedValues).not.toHaveProperty("platformMode");
    expect(insertedValues).not.toHaveProperty("aiAssistantEnabled");
    expect(insertedValues).not.toHaveProperty("publicSignupEnabled");
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

  it("leaves top-level settings untouched when no related fields are provided", async () => {
    const { updateSystemSettings } = await import("@/lib/actions/system-settings");
    setupAuthorizedAdmin();

    await updateSystemSettings({});
    const insertedValues = mocks.dbInsertValues.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(insertedValues).not.toHaveProperty("siteTitle");
    expect(insertedValues).not.toHaveProperty("siteDescription");
    expect(insertedValues).not.toHaveProperty("timeZone");
    expect(insertedValues).not.toHaveProperty("platformMode");
  });
});
