import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("playwright remote safety configuration", () => {
  it("restricts remote runs to an explicit safe allowlist via profile selection", () => {
    const source = readFileSync(join(process.cwd(), "playwright.config.ts"), "utf8");

    expect(source).toContain("const remoteSafeSpecsWithAuth = [");
    expect(source).toContain('"tests/e2e/admin-languages.spec.ts"');
    expect(source).toContain('"tests/e2e/admin-workers.spec.ts"');
    expect(source).toContain('"tests/e2e/contest-nav-test.spec.ts"');
    expect(source).toContain('"tests/e2e/rankings.spec.ts"');
    // Profile-based selection: smoke uses the remote-safe allowlist, full (the
    // undefined branch) runs all specs.
    expect(source).toContain('PLAYWRIGHT_PROFILE');
    expect(source).toContain('profile === "smoke"');
    expect(source).toContain('remoteSafeSpecsWithAuth');
    expect(source).toContain(': undefined');
  });

  it("keeps known destructive specs outside the remote-safe allowlist", () => {
    const source = readFileSync(join(process.cwd(), "playwright.config.ts"), "utf8");

    expect(source).not.toContain('"tests/e2e/admin-users.spec.ts"');
    expect(source).not.toContain('"tests/e2e/problem-management.spec.ts"');
    expect(source).not.toContain('"tests/e2e/contest-full-lifecycle.spec.ts"');
    expect(source).not.toContain('"tests/e2e/student-submission-flow.spec.ts"');
    expect(source).not.toContain('"tests/e2e/contest-participant-audit.spec.ts"');
    expect(source).not.toContain('"tests/e2e/contest-system.spec.ts"');
  });
});
