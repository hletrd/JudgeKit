import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * RPF cycle 55 (lane A2) — regression test for the
 * SKIP_INSTRUMENTATION_SYNC=1 env short-circuit that allows the Next.js
 * instrumentation hook to skip the language-config sync in local dev /
 * sandboxed runtime review lanes.
 *
 * Guard must:
 *   - Short-circuit BEFORE touching the DB when process.env
 *     SKIP_INSTRUMENTATION_SYNC === "1".
 *   - NOT short-circuit for other truthy-ish values ("true", "yes", "0",
 *     empty, unset) to avoid accidental production trigger.
 */

const { dbSelectMock, loggerWarnMock } = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: loggerWarnMock,
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe("syncLanguageConfigsOnStartup SKIP_INSTRUMENTATION_SYNC guard", () => {
  const originalEnv = process.env.SKIP_INSTRUMENTATION_SYNC;

  beforeEach(() => {
    dbSelectMock.mockReset();
    loggerWarnMock.mockReset();
    delete process.env.SKIP_INSTRUMENTATION_SYNC;
    vi.resetModules();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SKIP_INSTRUMENTATION_SYNC;
    } else {
      process.env.SKIP_INSTRUMENTATION_SYNC = originalEnv;
    }
  });

  it("short-circuits without touching the DB when SKIP_INSTRUMENTATION_SYNC=1", async () => {
    process.env.SKIP_INSTRUMENTATION_SYNC = "1";
    const { syncLanguageConfigsOnStartup } = await import("@/lib/judge/sync-language-configs");

    await syncLanguageConfigsOnStartup();

    expect(dbSelectMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledTimes(1);
    expect(loggerWarnMock.mock.calls[0]?.[0]).toContain("SKIP_INSTRUMENTATION_SYNC=1");
  });

  it("does NOT short-circuit for non-\"1\" truthy values", async () => {
    for (const value of ["true", "yes", "on", "0", ""]) {
      process.env.SKIP_INSTRUMENTATION_SYNC = value;
      dbSelectMock.mockReset();
      loggerWarnMock.mockReset();
      vi.resetModules();

      // Make db.select throw quickly so we can observe that the function
      // actually went past the guard and attempted real work.
      dbSelectMock.mockImplementation(() => {
        throw new Error("db-reached");
      });

      const { syncLanguageConfigsOnStartup } = await import("@/lib/judge/sync-language-configs");

      // With retries it will eventually give up; set a very tight expectation
      // by racing against the retry loop — we only care that db.select WAS
      // called at least once and the warn guard was NOT taken.
      let threw = false;
      try {
        // Limit test time: the retry backoff is exponential and capped;
        // we only need to observe the first-attempt side effects.
        await Promise.race([
          syncLanguageConfigsOnStartup(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("test-timeout")), 100)),
        ]);
      } catch {
        threw = true;
      }

      expect(threw).toBe(true);
      expect(dbSelectMock).toHaveBeenCalled();
      expect(loggerWarnMock).not.toHaveBeenCalled();
    }
  });

  it("does NOT short-circuit when SKIP_INSTRUMENTATION_SYNC is unset", async () => {
    delete process.env.SKIP_INSTRUMENTATION_SYNC;
    dbSelectMock.mockImplementation(() => {
      throw new Error("db-reached");
    });

    const { syncLanguageConfigsOnStartup } = await import("@/lib/judge/sync-language-configs");

    let threw = false;
    try {
      await Promise.race([
        syncLanguageConfigsOnStartup(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("test-timeout")), 100)),
      ]);
    } catch {
      threw = true;
    }

    expect(threw).toBe(true);
    expect(dbSelectMock).toHaveBeenCalled();
    expect(loggerWarnMock).not.toHaveBeenCalled();
  });
});
