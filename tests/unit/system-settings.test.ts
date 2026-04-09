import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  return {
    // db.query.systemSettings.findFirst
    dbQuerySystemSettingsFindFirst: vi.fn(),

    // db.select chain
    dbSelectFrom: vi.fn(),
    dbSelectFromWhere: vi.fn(),
    dbSelectFromWhereLimit: vi.fn(),
  };
});

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("react", () => ({
  cache: (fn: unknown) => fn,
}));

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    eq: vi.fn((_field: unknown, value: unknown) => ({ _eq: value })),
  };
});

vi.mock("@/lib/datetime", () => ({
  DEFAULT_TIME_ZONE: "Asia/Seoul",
}));

vi.mock("@/lib/db/schema", () => ({
  systemSettings: {
    id: "systemSettings.id",
    siteTitle: "systemSettings.siteTitle",
    siteDescription: "systemSettings.siteDescription",
    timeZone: "systemSettings.timeZone",
    platformMode: "systemSettings.platformMode",
    updatedAt: "systemSettings.updatedAt",
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      systemSettings: {
        findFirst: (...args: unknown[]) => mocks.dbQuerySystemSettingsFindFirst(...args),
      },
    },
    select: vi.fn(() => ({
      from: vi.fn((...args: unknown[]) => {
        mocks.dbSelectFrom(...args);
        return {
          where: vi.fn((...wArgs: unknown[]) => {
            mocks.dbSelectFromWhere(...wArgs);
            return {
              limit: vi.fn((...lArgs: unknown[]) => {
                return mocks.dbSelectFromWhereLimit(...lArgs);
              }),
            };
          }),
        };
      }),
    })),
  },
}));

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL_SETTINGS_ID
// ─────────────────────────────────────────────────────────────────────────────

describe("GLOBAL_SETTINGS_ID", () => {
  it('equals "global"', async () => {
    const { GLOBAL_SETTINGS_ID } = await import("@/lib/system-settings");
    expect(GLOBAL_SETTINGS_ID).toBe("global");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getSystemSettings
// ─────────────────────────────────────────────────────────────────────────────

describe("getSystemSettings", () => {
  it("returns settings from findFirst when successful", async () => {
    const { getSystemSettings } = await import("@/lib/system-settings");
    const fakeSettings = {
      id: "global",
      siteTitle: "My Site",
      siteDescription: "A site",
      timeZone: "UTC",
      platformMode: "contest",
      updatedAt: new Date("2025-01-01"),
    };
    mocks.dbQuerySystemSettingsFindFirst.mockResolvedValue(fakeSettings);

    const result = await getSystemSettings();
    expect(result).toEqual(fakeSettings);
    expect(mocks.dbQuerySystemSettingsFindFirst).toHaveBeenCalledOnce();
  });

  it("falls back to select query when findFirst throws", async () => {
    const { getSystemSettings } = await import("@/lib/system-settings");
    const fakeRow = {
      id: "global",
      siteTitle: "Fallback Site",
      siteDescription: "Fallback desc",
      timeZone: "America/New_York",
      platformMode: "exam",
      updatedAt: new Date("2025-06-01"),
    };
    mocks.dbQuerySystemSettingsFindFirst.mockRejectedValue(new Error("column not found"));
    mocks.dbSelectFromWhereLimit.mockResolvedValue([fakeRow]);

    const result = await getSystemSettings();
    expect(result).toEqual(fakeRow);
    expect(mocks.dbSelectFromWhereLimit).toHaveBeenCalledWith(1);
  });

  it("returns undefined when fallback select returns no rows", async () => {
    const { getSystemSettings } = await import("@/lib/system-settings");
    mocks.dbQuerySystemSettingsFindFirst.mockRejectedValue(new Error("missing column"));
    mocks.dbSelectFromWhereLimit.mockResolvedValue([]);

    const result = await getSystemSettings();
    expect(result).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getResolvedSystemSettings
// ─────────────────────────────────────────────────────────────────────────────

describe("getResolvedSystemSettings", () => {
  const defaults = {
    siteTitle: "Default Title",
    siteDescription: "Default Description",
    timeZone: "Europe/London",
  };

  it("uses DB values when settings are present", async () => {
    const { getResolvedSystemSettings } = await import("@/lib/system-settings");
    mocks.dbQuerySystemSettingsFindFirst.mockResolvedValue({
      id: "global",
      siteTitle: "DB Title",
      siteDescription: "DB Description",
      timeZone: "Asia/Tokyo",
      platformMode: "contest",
      aiAssistantEnabled: false,
    });

    const result = await getResolvedSystemSettings(defaults);
    expect(result).toEqual({
      siteTitle: "DB Title",
      siteDescription: "DB Description",
      timeZone: "Asia/Tokyo",
      platformMode: "contest",
      aiAssistantEnabled: false,
      defaultLanguage: null,
    });
  });

  it("falls back to defaults when settings are null", async () => {
    const { getResolvedSystemSettings } = await import("@/lib/system-settings");
    mocks.dbQuerySystemSettingsFindFirst.mockResolvedValue(undefined);

    const result = await getResolvedSystemSettings(defaults);
    expect(result).toEqual({
      siteTitle: "Default Title",
      siteDescription: "Default Description",
      timeZone: "Europe/London",
      platformMode: "homework",
      aiAssistantEnabled: true,
      defaultLanguage: null,
    });
  });

  it("uses DEFAULT_SYSTEM_TIME_ZONE as last resort when no timeZone in defaults or DB", async () => {
    const { getResolvedSystemSettings } = await import("@/lib/system-settings");
    mocks.dbQuerySystemSettingsFindFirst.mockResolvedValue(undefined);
    const noTimeZoneDefaults = { siteTitle: "T", siteDescription: "D" };

    const result = await getResolvedSystemSettings(noTimeZoneDefaults);
    expect(result.timeZone).toBe("Asia/Seoul");
  });

  it("aiAssistantEnabled defaults to true when not in DB settings", async () => {
    const { getResolvedSystemSettings } = await import("@/lib/system-settings");
    mocks.dbQuerySystemSettingsFindFirst.mockResolvedValue({
      id: "global",
      siteTitle: "T",
      siteDescription: "D",
      timeZone: "UTC",
      updatedAt: new Date(),
      // aiAssistantEnabled absent
      platformMode: "recruiting",
    });

    const result = await getResolvedSystemSettings(defaults);
    expect(result.aiAssistantEnabled).toBe(true);
    expect(result.platformMode).toBe("recruiting");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isAiAssistantEnabled
// ─────────────────────────────────────────────────────────────────────────────

describe("isAiAssistantEnabled", () => {
  it("returns true by default when aiAssistantEnabled is absent", async () => {
    const { isAiAssistantEnabled } = await import("@/lib/system-settings");
    mocks.dbQuerySystemSettingsFindFirst.mockResolvedValue({
      id: "global",
      siteTitle: "T",
      siteDescription: "D",
      timeZone: "UTC",
      updatedAt: new Date(),
    });

    const result = await isAiAssistantEnabled();
    expect(result).toBe(true);
  });

  it("returns false when aiAssistantEnabled is false in settings", async () => {
    const { isAiAssistantEnabled } = await import("@/lib/system-settings");
    mocks.dbQuerySystemSettingsFindFirst.mockResolvedValue({
      id: "global",
      siteTitle: "T",
      siteDescription: "D",
      timeZone: "UTC",
      updatedAt: new Date(),
      aiAssistantEnabled: false,
    });

    const result = await isAiAssistantEnabled();
    expect(result).toBe(false);
  });

  it("returns true when aiAssistantEnabled is true in settings", async () => {
    const { isAiAssistantEnabled } = await import("@/lib/system-settings");
    mocks.dbQuerySystemSettingsFindFirst.mockResolvedValue({
      id: "global",
      siteTitle: "T",
      siteDescription: "D",
      timeZone: "UTC",
      updatedAt: new Date(),
      aiAssistantEnabled: true,
    });

    const result = await isAiAssistantEnabled();
    expect(result).toBe(true);
  });

  it("returns true on error in homework mode (getSystemSettings throws)", async () => {
    const { isAiAssistantEnabled } = await import("@/lib/system-settings");
    // In the direct aiAssistantEnabled code path, a failing findFirst should
    // fall back to the homework-mode default (enabled).
    mocks.dbQuerySystemSettingsFindFirst.mockRejectedValue(new Error("db down"));

    const result = await isAiAssistantEnabled();
    expect(result).toBe(true);
  });

  it("returns false by default in recruiting mode even when aiAssistantEnabled is true", async () => {
    const { isAiAssistantEnabled } = await import("@/lib/system-settings");
    mocks.dbQuerySystemSettingsFindFirst.mockResolvedValue({
      id: "global",
      siteTitle: "T",
      siteDescription: "D",
      timeZone: "UTC",
      platformMode: "recruiting",
      aiAssistantEnabled: true,
      updatedAt: new Date(),
    });

    const result = await isAiAssistantEnabled();
    expect(result).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getResolvedSystemTimeZone
// ─────────────────────────────────────────────────────────────────────────────

describe("getResolvedSystemTimeZone", () => {
  it("returns the timezone from DB settings when present", async () => {
    const { getResolvedSystemTimeZone } = await import("@/lib/system-settings");
    mocks.dbQuerySystemSettingsFindFirst.mockResolvedValue({
      id: "global",
      siteTitle: "T",
      siteDescription: "D",
      timeZone: "America/Chicago",
      updatedAt: new Date(),
    });

    const result = await getResolvedSystemTimeZone();
    expect(result).toBe("America/Chicago");
  });

  it("returns DEFAULT_SYSTEM_TIME_ZONE when timeZone is not set in DB", async () => {
    const { getResolvedSystemTimeZone } = await import("@/lib/system-settings");
    mocks.dbQuerySystemSettingsFindFirst.mockResolvedValue(undefined);

    const result = await getResolvedSystemTimeZone();
    expect(result).toBe("Asia/Seoul");
  });

  it("returns DEFAULT_SYSTEM_TIME_ZONE when settings row has no timeZone field", async () => {
    const { getResolvedSystemTimeZone } = await import("@/lib/system-settings");
    mocks.dbQuerySystemSettingsFindFirst.mockResolvedValue({
      id: "global",
      siteTitle: "T",
      siteDescription: "D",
      timeZone: null,
      updatedAt: new Date(),
    });

    const result = await getResolvedSystemTimeZone();
    expect(result).toBe("Asia/Seoul");
  });
});
