import { beforeEach, describe, expect, it, vi } from "vitest";

const { selectMock, getMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  getMock: vi.fn(),
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

import {
  getConfiguredSettings,
  invalidateSettingsCache,
  SETTING_DEFAULTS,
} from "@/lib/system-settings-config";

function mockDbRow(overrides: Record<string, unknown> = {}) {
  getMock.mockReturnValue(overrides);
  selectMock.mockReturnValue({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        get: getMock,
      })),
    })),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  invalidateSettingsCache();
  // Clear any env overrides
  delete process.env.RATE_LIMIT_MAX_ATTEMPTS;
  delete process.env.API_RATE_LIMIT_MAX;
  delete process.env.SUBMISSION_MAX_PENDING;
});

describe("getConfiguredSettings", () => {
  it("returns defaults when DB has no row", () => {
    mockDbRow();
    getMock.mockReturnValue(undefined);

    const settings = getConfiguredSettings();

    expect(settings.loginRateLimitMaxAttempts).toBe(SETTING_DEFAULTS.loginRateLimitMaxAttempts);
    expect(settings.submissionMaxPending).toBe(SETTING_DEFAULTS.submissionMaxPending);
    expect(settings.defaultTimeLimitMs).toBe(SETTING_DEFAULTS.defaultTimeLimitMs);
  });

  it("uses DB values when present", () => {
    mockDbRow({ loginRateLimitMaxAttempts: 10, submissionMaxPending: 5 });

    const settings = getConfiguredSettings();

    expect(settings.loginRateLimitMaxAttempts).toBe(10);
    expect(settings.submissionMaxPending).toBe(5);
  });

  it("prefers env variable over DB value", () => {
    process.env.RATE_LIMIT_MAX_ATTEMPTS = "20";
    mockDbRow({ loginRateLimitMaxAttempts: 10 });

    const settings = getConfiguredSettings();

    expect(settings.loginRateLimitMaxAttempts).toBe(20);
  });

  it("ignores non-numeric env values", () => {
    process.env.RATE_LIMIT_MAX_ATTEMPTS = "not-a-number";
    mockDbRow({ loginRateLimitMaxAttempts: 10 });

    const settings = getConfiguredSettings();

    expect(settings.loginRateLimitMaxAttempts).toBe(10);
  });

  it("falls back to defaults when DB throws", () => {
    selectMock.mockImplementation(() => {
      throw new Error("DB unavailable");
    });

    const settings = getConfiguredSettings();

    expect(settings.loginRateLimitMaxAttempts).toBe(SETTING_DEFAULTS.loginRateLimitMaxAttempts);
  });

  it("caches results for subsequent calls", () => {
    mockDbRow({ loginRateLimitMaxAttempts: 10 });

    getConfiguredSettings();
    getConfiguredSettings();

    expect(selectMock).toHaveBeenCalledOnce();
  });

  it("reloads after cache invalidation", () => {
    mockDbRow({ loginRateLimitMaxAttempts: 10 });
    getConfiguredSettings();

    invalidateSettingsCache();
    mockDbRow({ loginRateLimitMaxAttempts: 20 });

    const settings = getConfiguredSettings();

    expect(settings.loginRateLimitMaxAttempts).toBe(20);
    expect(selectMock).toHaveBeenCalledTimes(2);
  });
});

describe("invalidateSettingsCache", () => {
  it("forces next call to reload from DB", () => {
    mockDbRow({});
    getConfiguredSettings();
    expect(selectMock).toHaveBeenCalledOnce();

    invalidateSettingsCache();
    mockDbRow({});
    getConfiguredSettings();

    expect(selectMock).toHaveBeenCalledTimes(2);
  });
});

describe("SETTING_DEFAULTS", () => {
  it("has all expected keys", () => {
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
      "minPasswordLength",
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
