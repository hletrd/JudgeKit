import { beforeEach, describe, expect, it, vi } from "vitest";

const { selectMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: selectMock,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  systemSettings: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

function mockDbRow(row?: Record<string, unknown>) {
  selectMock.mockReturnValue({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve(row ? [row] : [])),
      })),
    })),
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  delete process.env.RATE_LIMIT_MAX_ATTEMPTS;
  delete process.env.API_RATE_LIMIT_MAX;
  delete process.env.SUBMISSION_MAX_PENDING;
});

describe("getConfiguredSettings", () => {
  it("returns defaults when DB has no row", async () => {
    mockDbRow(undefined);
    const { initializeSettings, getConfiguredSettings, SETTING_DEFAULTS } = await import("@/lib/system-settings-config");

    await initializeSettings();
    const settings = getConfiguredSettings();

    expect(settings.loginRateLimitMaxAttempts).toBe(SETTING_DEFAULTS.loginRateLimitMaxAttempts);
    expect(settings.submissionMaxPending).toBe(SETTING_DEFAULTS.submissionMaxPending);
    expect(settings.defaultTimeLimitMs).toBe(SETTING_DEFAULTS.defaultTimeLimitMs);
  });

  it("uses DB values when present", async () => {
    mockDbRow({ loginRateLimitMaxAttempts: 10, submissionMaxPending: 5 });
    const { initializeSettings, getConfiguredSettings } = await import("@/lib/system-settings-config");

    await initializeSettings();
    const settings = getConfiguredSettings();

    expect(settings.loginRateLimitMaxAttempts).toBe(10);
    expect(settings.submissionMaxPending).toBe(5);
  });

  it("prefers env variable over DB value", async () => {
    process.env.RATE_LIMIT_MAX_ATTEMPTS = "20";
    mockDbRow({ loginRateLimitMaxAttempts: 10 });
    const { initializeSettings, getConfiguredSettings } = await import("@/lib/system-settings-config");

    await initializeSettings();
    const settings = getConfiguredSettings();

    expect(settings.loginRateLimitMaxAttempts).toBe(20);
  });

  it("ignores non-numeric env values", async () => {
    process.env.RATE_LIMIT_MAX_ATTEMPTS = "not-a-number";
    mockDbRow({ loginRateLimitMaxAttempts: 10 });
    const { initializeSettings, getConfiguredSettings } = await import("@/lib/system-settings-config");

    await initializeSettings();
    const settings = getConfiguredSettings();

    expect(settings.loginRateLimitMaxAttempts).toBe(10);
  });

  it("falls back to defaults when DB throws", async () => {
    selectMock.mockImplementation(() => {
      throw new Error("DB unavailable");
    });
    const { initializeSettings, getConfiguredSettings, SETTING_DEFAULTS } = await import("@/lib/system-settings-config");

    await initializeSettings();
    const settings = getConfiguredSettings();

    expect(settings.loginRateLimitMaxAttempts).toBe(SETTING_DEFAULTS.loginRateLimitMaxAttempts);
  });

  it("caches results for subsequent calls", async () => {
    mockDbRow({ loginRateLimitMaxAttempts: 10 });
    const { initializeSettings, getConfiguredSettings } = await import("@/lib/system-settings-config");

    await initializeSettings();
    getConfiguredSettings();
    getConfiguredSettings();

    expect(selectMock).toHaveBeenCalledOnce();
  });

  it("reloads after cache invalidation", async () => {
    mockDbRow({ loginRateLimitMaxAttempts: 10 });
    const { initializeSettings, getConfiguredSettings, invalidateSettingsCache } = await import("@/lib/system-settings-config");

    await initializeSettings();
    expect(getConfiguredSettings().loginRateLimitMaxAttempts).toBe(10);

    mockDbRow({ loginRateLimitMaxAttempts: 20 });
    await invalidateSettingsCache();

    const settings = getConfiguredSettings();
    expect(settings.loginRateLimitMaxAttempts).toBe(20);
    expect(selectMock).toHaveBeenCalledTimes(2);
  });
});

describe("invalidateSettingsCache", () => {
  it("forces next call to reload from DB", async () => {
    mockDbRow({});
    const { initializeSettings, getConfiguredSettings, invalidateSettingsCache } = await import("@/lib/system-settings-config");

    await initializeSettings();
    expect(selectMock).toHaveBeenCalledOnce();

    mockDbRow({ loginRateLimitMaxAttempts: 15 });
    await invalidateSettingsCache();

    expect(getConfiguredSettings().loginRateLimitMaxAttempts).toBe(15);
    expect(selectMock).toHaveBeenCalledTimes(2);
  });
});

describe("SETTING_DEFAULTS", () => {
  it("has all expected keys", async () => {
    const { SETTING_DEFAULTS } = await import("@/lib/system-settings-config");
    const expectedKeys = [
      "loginRateLimitMaxAttempts",
      "loginRateLimitWindowMs",
      "loginRateLimitBlockMs",
      "apiRateLimitMax",
      "apiRateLimitWindowMs",
      "submissionRateLimitMaxPerMinute",
      "submissionMaxPending",
      "submissionGlobalQueueLimit",
      "defaultTimeLimitMs",
      "defaultMemoryLimitMb",
      "maxSourceCodeSizeBytes",
      "staleClaimTimeoutMs",
      "sessionMaxAgeSeconds",
      "defaultPageSize",
      "maxSseConnectionsPerUser",
      "ssePollIntervalMs",
      "sseTimeoutMs",
    ];
    for (const key of expectedKeys) {
      expect(SETTING_DEFAULTS).toHaveProperty(key);
      expect(typeof SETTING_DEFAULTS[key as keyof typeof SETTING_DEFAULTS]).toBe("number");
    }
  });
});
