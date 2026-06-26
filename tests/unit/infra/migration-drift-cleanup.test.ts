import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

/**
 * Regression guard for AGG-69 / TE-16: `scripts/check-migration-drift.sh`
 * previously ran `git clean -fdq -- drizzle/` to discard probe artifacts,
 * which silently deleted any untracked migration files in a developer's
 * working tree. The cleanup must be surgical — only files the probe created
 * may be removed.
 */
const SCRIPT_PATH = join(process.cwd(), "scripts/check-migration-drift.sh");

describe("check-migration-drift.sh cleanup is non-destructive", () => {
  it("does not delete a developer's untracked file under drizzle/ (no-drift path)", () => {
    const untracked = join(process.cwd(), "drizzle", "zz_probe_untracked.txt");
    writeFileSync(untracked, "developer scratch file — must survive db:check\n", "utf8");

    try {
      const result = spawnSync(
        "bash",
        [SCRIPT_PATH],
        { encoding: "utf8", env: { ...process.env } },
      );

      // Repo is in sync, so the drift check should pass. The load-bearing
      // assertion is that the developer's untracked file is preserved.
      expect(result.status).toBe(0);
      expect(existsSync(untracked)).toBe(true);
    } finally {
      rmSync(untracked, { force: true });
    }
  });

  it("does not use destructive `git clean -fd` to discard probe artifacts", () => {
    const source = readFileSync(SCRIPT_PATH, "utf8");

    // `git clean -fd[q] -- drizzle/` recursively removes ALL untracked files
    // under the pathspec. It must never appear as an actual command (only the
    // surgical restore of probe-touched entries is allowed). Match command
    // invocations at line start so explanatory comments are not flagged.
    expect(source).not.toMatch(/^\s*git clean\s+-fd/m);
    // The non-destructive cleanup restores only probe-touched entries by
    // diffing the before/after porcelain snapshot.
    expect(source).toContain("DRIFT_BEFORE");
    expect(source).toContain("DRIFT_AFTER");
  });
});
