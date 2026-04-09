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
    revalidatePath: vi.fn(),
    loggerError: vi.fn(),

    // DB chain helpers
    dbUpdateSet: vi.fn(),
    dbUpdateWhere: vi.fn(),
    dbSelectFrom: vi.fn(),
    dbSelectFromWhere: vi.fn(),
    dbInsertValues: vi.fn(),

    // Language config helpers
    JUDGE_LANGUAGE_CONFIGS: {} as Record<string, {
      dockerImage: string;
      compiler?: string;
      compileCommand?: string[];
      runCommand: string[];
    }>,
    serializeJudgeCommand: vi.fn<(cmd?: string[]) => string | null>(),
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

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: mocks.loggerError,
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    eq: vi.fn((_field: unknown, value: unknown) => ({ _eq: value })),
  };
});

vi.mock("@/lib/db/schema", () => ({
  languageConfigs: {
    id: "languageConfigs.id",
    language: "languageConfigs.language",
    isEnabled: "languageConfigs.isEnabled",
  },
}));

vi.mock("@/lib/db", () => {
  const updateChainFactory = () => ({
    set: vi.fn((...setArgs: unknown[]) => {
      mocks.dbUpdateSet(...setArgs);
      return {
        where: vi.fn((...whereArgs: unknown[]) => {
          mocks.dbUpdateWhere(...whereArgs);
          return Promise.resolve();
        }),
      };
    }),
  });

  return {
    db: {
      update: vi.fn(() => updateChainFactory()),
      select: vi.fn(() => ({
        from: vi.fn((...fromArgs: unknown[]) => {
          mocks.dbSelectFrom(...fromArgs);
          return {
            where: vi.fn((...whereArgs: unknown[]) => {
              mocks.dbSelectFromWhere(...whereArgs);
              return Promise.resolve(mocks.dbSelectFromWhere.mock.results.length > 0
                ? mocks.dbSelectFromWhere.mock.results[mocks.dbSelectFromWhere.mock.results.length - 1].value
                : []);
            }),
            limit: vi.fn(() =>
              Promise.resolve(
                mocks.dbSelectFromWhere.mock.results.length > 0
                  ? mocks.dbSelectFromWhere.mock.results[mocks.dbSelectFromWhere.mock.results.length - 1].value
                  : []
              )
            ),
          };
        }),
      })),
      insert: vi.fn(() => ({
        values: vi.fn((...args: unknown[]) => {
          mocks.dbInsertValues(...args);
          return Promise.resolve();
        }),
      })),
      transaction: vi.fn(async (callback: (tx: { update: () => ReturnType<typeof updateChainFactory> }) => Promise<unknown>) =>
        callback({
          update: vi.fn(() => updateChainFactory()),
        })),
    },
  };
});

vi.mock("@/lib/judge/languages", () => ({
  JUDGE_LANGUAGE_CONFIGS: mocks.JUDGE_LANGUAGE_CONFIGS,
  serializeJudgeCommand: mocks.serializeJudgeCommand,
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
    requestPath: "/dashboard/admin/languages",
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveCapabilities.mockImplementation((role: string) =>
    Promise.resolve(new Set(role === "admin" || role === "super_admin" ? ["system.settings"] : []))
  );
  // Default: no language configs
  Object.keys(mocks.JUDGE_LANGUAGE_CONFIGS).forEach((k) => {
    delete mocks.JUDGE_LANGUAGE_CONFIGS[k];
  });
  mocks.serializeJudgeCommand.mockImplementation((cmd?: string[]) =>
    cmd ? cmd.join(" ") : null
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// toggleLanguage
// ─────────────────────────────────────────────────────────────────────────────

describe("toggleLanguage", () => {
  it("returns unauthorized when origin is untrusted", async () => {
    const { toggleLanguage } = await import("@/lib/actions/language-configs");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(false);

    const result = await toggleLanguage("python3", true);
    expect(result).toEqual({ success: false, error: "unauthorized" });
  });

  it("returns unauthorized when session lacks system.settings", async () => {
    const { toggleLanguage } = await import("@/lib/actions/language-configs");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(true);
    mocks.auth.mockResolvedValue({
      user: { id: "u1", role: "student" },
    });
    mocks.resolveCapabilities.mockResolvedValue(new Set());

    const result = await toggleLanguage("python3", true);
    expect(result).toEqual({ success: false, error: "unauthorized" });
  });

  it("allows a custom role with system.settings", async () => {
    const { toggleLanguage } = await import("@/lib/actions/language-configs");
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
      requestPath: "/dashboard/admin/languages",
    });

    const result = await toggleLanguage("python3", true);
    expect(result).toEqual({ success: true });
  });

  it("returns unauthorized when session is null", async () => {
    const { toggleLanguage } = await import("@/lib/actions/language-configs");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(true);
    mocks.auth.mockResolvedValue(null);

    const result = await toggleLanguage("python3", true);
    expect(result).toEqual({ success: false, error: "unauthorized" });
  });

  it("returns rateLimited when rate limit is exceeded", async () => {
    const { toggleLanguage } = await import("@/lib/actions/language-configs");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(true);
    mocks.auth.mockResolvedValue({ user: { id: "actor-1", role: "admin" } });
    mocks.checkServerActionRateLimit.mockReturnValue({ error: "rateLimited" });

    const result = await toggleLanguage("python3", true);
    expect(result).toEqual({ success: false, error: "rateLimited" });
  });

  it("successfully enables a language", async () => {
    const { toggleLanguage } = await import("@/lib/actions/language-configs");
    setupAuthorizedAdmin();

    const result = await toggleLanguage("python3", true);
    expect(result).toEqual({ success: true });
    expect(mocks.dbUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ isEnabled: true })
    );
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "language_config.toggled",
        resourceId: "python3",
        details: expect.objectContaining({ language: "python3", enabled: true }),
      })
    );
  });

  it("successfully disables a language", async () => {
    const { toggleLanguage } = await import("@/lib/actions/language-configs");
    setupAuthorizedAdmin();

    const result = await toggleLanguage("python3", false);
    expect(result).toEqual({ success: true });
    expect(mocks.dbUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ isEnabled: false })
    );
  });

  it("returns toggleFailed when db throws", async () => {
    const { toggleLanguage } = await import("@/lib/actions/language-configs");
    setupAuthorizedAdmin();

    const { db } = await import("@/lib/db");
    (db.update as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.reject(new Error("db error"))),
      })),
    }));

    const result = await toggleLanguage("python3", true);
    expect(result).toEqual({ success: false, error: "toggleFailed" });
    expect(mocks.loggerError).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// updateLanguageConfig
// ─────────────────────────────────────────────────────────────────────────────

describe("updateLanguageConfig", () => {
  it("returns unauthorized when origin is untrusted", async () => {
    const { updateLanguageConfig } = await import("@/lib/actions/language-configs");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(false);

    const result = await updateLanguageConfig("python3", {
      dockerImage: "python:3.12",
      compileCommand: "",
      runCommand: "python3 solution.py",
    });
    expect(result).toEqual({ success: false, error: "unauthorized" });
  });

  it("returns unauthorized when not admin", async () => {
    const { updateLanguageConfig } = await import("@/lib/actions/language-configs");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(true);
    mocks.auth.mockResolvedValue({ user: { id: "u1", role: "instructor" } });

    const result = await updateLanguageConfig("python3", {
      dockerImage: "python:3.12",
      compileCommand: "",
      runCommand: "python3 solution.py",
    });
    expect(result).toEqual({ success: false, error: "unauthorized" });
  });

  it("successfully updates docker image, compile/run commands", async () => {
    const { updateLanguageConfig } = await import("@/lib/actions/language-configs");
    setupAuthorizedAdmin();

    const result = await updateLanguageConfig("cpp17", {
      dockerImage: "gcc:13",
      compileCommand: "g++ -O2 -o solution solution.cpp",
      runCommand: "./solution",
    });
    expect(result).toEqual({ success: true });
    expect(mocks.dbUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        dockerImage: "gcc:13",
        compileCommand: "g++ -O2 -o solution solution.cpp",
        runCommand: "./solution",
      })
    );
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "language_config.updated",
        resourceId: "cpp17",
      })
    );
  });

  it("stores null compileCommand when empty string is passed", async () => {
    const { updateLanguageConfig } = await import("@/lib/actions/language-configs");
    setupAuthorizedAdmin();

    await updateLanguageConfig("python3", {
      dockerImage: "python:3.12",
      compileCommand: "",
      runCommand: "python3 solution.py",
    });
    expect(mocks.dbUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ compileCommand: null })
    );
  });

  it("returns updateFailed when db throws", async () => {
    const { updateLanguageConfig } = await import("@/lib/actions/language-configs");
    setupAuthorizedAdmin();

    const { db } = await import("@/lib/db");
    (db.update as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.reject(new Error("db error"))),
      })),
    }));

    const result = await updateLanguageConfig("python3", {
      dockerImage: "python:3.12",
      compileCommand: "",
      runCommand: "python3 solution.py",
    });
    expect(result).toEqual({ success: false, error: "updateFailed" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// addLanguageConfig
// ─────────────────────────────────────────────────────────────────────────────

describe("addLanguageConfig", () => {
  const validAddInput = {
    language: "brainfuck",
    displayName: "Brainfuck",
    extension: "bf",
    dockerImage: "brainfuck:latest",
    runCommand: "bf solution.bf",
  };

  it("returns unauthorized when origin is untrusted", async () => {
    const { addLanguageConfig } = await import("@/lib/actions/language-configs");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(false);

    const result = await addLanguageConfig(validAddInput);
    expect(result).toEqual({ success: false, error: "unauthorized" });
  });

  it("returns unauthorized when not admin", async () => {
    const { addLanguageConfig } = await import("@/lib/actions/language-configs");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(true);
    mocks.auth.mockResolvedValue({ user: { id: "u1", role: "student" } });

    const result = await addLanguageConfig(validAddInput);
    expect(result).toEqual({ success: false, error: "unauthorized" });
  });

  it("returns rateLimited when rate limit is exceeded", async () => {
    const { addLanguageConfig } = await import("@/lib/actions/language-configs");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(true);
    mocks.auth.mockResolvedValue({ user: { id: "actor-1", role: "admin" } });
    mocks.checkServerActionRateLimit.mockReturnValue({ error: "rateLimited" });

    const result = await addLanguageConfig(validAddInput);
    expect(result).toEqual({ success: false, error: "rateLimited" });
  });

  it("returns invalidLanguageKey for a language key with invalid characters", async () => {
    const { addLanguageConfig } = await import("@/lib/actions/language-configs");
    setupAuthorizedAdmin();

    const result = await addLanguageConfig({ ...validAddInput, language: "C++ 17" });
    expect(result).toEqual({ success: false, error: "invalidLanguageKey" });
  });

  it("returns invalidLanguageKey for language key with uppercase letters", async () => {
    const { addLanguageConfig } = await import("@/lib/actions/language-configs");
    setupAuthorizedAdmin();

    const result = await addLanguageConfig({ ...validAddInput, language: "Python3" });
    expect(result).toEqual({ success: false, error: "invalidLanguageKey" });
  });

  it("returns missingRequiredFields when displayName is empty", async () => {
    const { addLanguageConfig } = await import("@/lib/actions/language-configs");
    setupAuthorizedAdmin();

    const result = await addLanguageConfig({ ...validAddInput, displayName: "   " });
    expect(result).toEqual({ success: false, error: "missingRequiredFields" });
  });

  it("returns missingRequiredFields when extension is empty", async () => {
    const { addLanguageConfig } = await import("@/lib/actions/language-configs");
    setupAuthorizedAdmin();

    const result = await addLanguageConfig({ ...validAddInput, extension: "" });
    expect(result).toEqual({ success: false, error: "missingRequiredFields" });
  });

  it("returns missingRequiredFields when dockerImage is empty", async () => {
    const { addLanguageConfig } = await import("@/lib/actions/language-configs");
    setupAuthorizedAdmin();

    const result = await addLanguageConfig({ ...validAddInput, dockerImage: "" });
    expect(result).toEqual({ success: false, error: "missingRequiredFields" });
  });

  it("returns missingRequiredFields when runCommand is empty", async () => {
    const { addLanguageConfig } = await import("@/lib/actions/language-configs");
    setupAuthorizedAdmin();

    const result = await addLanguageConfig({ ...validAddInput, runCommand: "" });
    expect(result).toEqual({ success: false, error: "missingRequiredFields" });
  });

  it("returns languageAlreadyExists when language already exists in DB", async () => {
    const { addLanguageConfig } = await import("@/lib/actions/language-configs");
    setupAuthorizedAdmin();

    const { db } = await import("@/lib/db");
    (db.select as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([{ id: "existing-id" }])),
        })),
      })),
    }));

    const result = await addLanguageConfig(validAddInput);
    expect(result).toEqual({ success: false, error: "languageAlreadyExists" });
  });

  it("successfully adds a new language", async () => {
    const { addLanguageConfig } = await import("@/lib/actions/language-configs");
    setupAuthorizedAdmin();

    const { db } = await import("@/lib/db");
    (db.select as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([])),
        })),
      })),
    }));

    const result = await addLanguageConfig(validAddInput);
    expect(result).toEqual({ success: true });
    expect(mocks.dbInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        language: "brainfuck",
        displayName: "Brainfuck",
        extension: "bf",
        dockerImage: "brainfuck:latest",
        runCommand: "bf solution.bf",
        isEnabled: true,
      })
    );
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "language_config.created",
        resourceId: "brainfuck",
        resourceLabel: "Brainfuck",
      })
    );
  });

  it("returns createFailed when db insert throws", async () => {
    const { addLanguageConfig } = await import("@/lib/actions/language-configs");
    setupAuthorizedAdmin();

    const { db } = await import("@/lib/db");
    // select returns empty (no conflict)
    (db.select as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([])),
        })),
      })),
    }));
    // insert throws
    (db.insert as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      values: vi.fn(() => Promise.reject(new Error("db error"))),
    }));

    const result = await addLanguageConfig(validAddInput);
    expect(result).toEqual({ success: false, error: "createFailed" });
    expect(mocks.loggerError).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resetLanguageToDefaults
// ─────────────────────────────────────────────────────────────────────────────

describe("resetLanguageToDefaults", () => {
  it("returns unauthorized when origin is untrusted", async () => {
    const { resetLanguageToDefaults } = await import("@/lib/actions/language-configs");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(false);

    const result = await resetLanguageToDefaults("python3");
    expect(result).toEqual({ success: false, error: "unauthorized" });
  });

  it("returns unauthorized when not admin", async () => {
    const { resetLanguageToDefaults } = await import("@/lib/actions/language-configs");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(true);
    mocks.auth.mockResolvedValue({ user: { id: "u1", role: "instructor" } });

    const result = await resetLanguageToDefaults("python3");
    expect(result).toEqual({ success: false, error: "unauthorized" });
  });

  it("returns languageNotFound when language is not in JUDGE_LANGUAGE_CONFIGS", async () => {
    const { resetLanguageToDefaults } = await import("@/lib/actions/language-configs");
    setupAuthorizedAdmin();
    // JUDGE_LANGUAGE_CONFIGS is empty — language not found

    const result = await resetLanguageToDefaults("nonexistent_lang");
    expect(result).toEqual({ success: false, error: "languageNotFound" });
  });

  it("successfully resets language to defaults", async () => {
    const { resetLanguageToDefaults } = await import("@/lib/actions/language-configs");
    setupAuthorizedAdmin();

    mocks.JUDGE_LANGUAGE_CONFIGS["python3"] = {
      dockerImage: "python:3.12-slim",
      compileCommand: undefined,
      runCommand: ["python3", "solution.py"],
    };
    mocks.serializeJudgeCommand.mockReturnValue(null);

    const result = await resetLanguageToDefaults("python3");
    expect(result).toEqual({ success: true });
    expect(mocks.dbUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        dockerImage: "python:3.12-slim",
        runCommand: "python3 solution.py",
      })
    );
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "language_config.reset",
        resourceId: "python3",
        details: expect.objectContaining({ language: "python3" }),
      })
    );
  });

  it("returns resetFailed when db throws", async () => {
    const { resetLanguageToDefaults } = await import("@/lib/actions/language-configs");
    setupAuthorizedAdmin();

    mocks.JUDGE_LANGUAGE_CONFIGS["python3"] = {
      dockerImage: "python:3.12-slim",
      runCommand: ["python3", "solution.py"],
    };

    const { db } = await import("@/lib/db");
    (db.update as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.reject(new Error("db error"))),
      })),
    }));

    const result = await resetLanguageToDefaults("python3");
    expect(result).toEqual({ success: false, error: "resetFailed" });
    expect(mocks.loggerError).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resetAllLanguagesToDefaults
// ─────────────────────────────────────────────────────────────────────────────

describe("resetAllLanguagesToDefaults", () => {
  it("returns unauthorized when origin is untrusted", async () => {
    const { resetAllLanguagesToDefaults } = await import("@/lib/actions/language-configs");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(false);

    const result = await resetAllLanguagesToDefaults();
    expect(result).toEqual({ success: false, error: "unauthorized" });
  });

  it("returns rateLimited when rate limit is exceeded", async () => {
    const { resetAllLanguagesToDefaults } = await import("@/lib/actions/language-configs");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(true);
    mocks.auth.mockResolvedValue({ user: { id: "actor-1", role: "admin" } });
    mocks.checkServerActionRateLimit.mockReturnValue({ error: "rateLimited" });

    const result = await resetAllLanguagesToDefaults();
    expect(result).toEqual({ success: false, error: "rateLimited" });
  });

  it("successfully resets all languages to defaults", async () => {
    const { resetAllLanguagesToDefaults } = await import("@/lib/actions/language-configs");
    setupAuthorizedAdmin();

    mocks.JUDGE_LANGUAGE_CONFIGS["python3"] = {
      dockerImage: "python:3.12-slim",
      runCommand: ["python3", "solution.py"],
    };
    mocks.JUDGE_LANGUAGE_CONFIGS["cpp17"] = {
      dockerImage: "gcc:13",
      compileCommand: ["g++", "-O2", "-o", "solution", "solution.cpp"],
      runCommand: ["./solution"],
    };

    const result = await resetAllLanguagesToDefaults();
    expect(result).toEqual({ success: true });
    // Should have updated once per language
    expect(mocks.dbUpdateSet).toHaveBeenCalledTimes(2);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "language_config.reset_all",
        resourceId: "all",
        details: expect.objectContaining({ resetCount: 2 }),
      })
    );
  });

  it("returns resetAllFailed when db throws", async () => {
    const { resetAllLanguagesToDefaults } = await import("@/lib/actions/language-configs");
    setupAuthorizedAdmin();

    mocks.JUDGE_LANGUAGE_CONFIGS["python3"] = {
      dockerImage: "python:3.12-slim",
      runCommand: ["python3", "solution.py"],
    };

    const { db } = await import("@/lib/db");
    (db.transaction as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      throw new Error("db error");
    });

    const result = await resetAllLanguagesToDefaults();
    expect(result).toEqual({ success: false, error: "resetAllFailed" });
    expect(mocks.loggerError).toHaveBeenCalled();
  });
});
