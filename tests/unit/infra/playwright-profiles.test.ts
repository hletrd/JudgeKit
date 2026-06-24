import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("Playwright profile configuration", () => {
  const config = read("playwright.config.ts");
  const localWebServerScript = read("scripts/playwright-local-webserver.sh");

  it("exports PLAYWRIGHT_PROFILE env var handling", () => {
    expect(config).toContain("process.env.PLAYWRIGHT_PROFILE");
  });

  it("profile 'smoke' maps to the remote-safe allowlist only", () => {
    expect(config).toContain('profile === "smoke"');
    expect(config).toContain('remoteSafeSpecsWithAuth');
  });

  it("profile 'full' runs all specs (testMatch is undefined)", () => {
    // When profile is not "smoke", testMatch resolves to undefined (no filter)
    expect(config).toContain('profile === "smoke"');
    expect(config).toContain(": undefined");
    // The undefined branch is the full profile — verify the variable is used as testMatch
    expect(config).toContain("testMatch,");
  });

  it("legacy behaviour: PLAYWRIGHT_BASE_URL alone implies smoke profile", () => {
    // isRemoteRun is derived solely from PLAYWRIGHT_BASE_URL
    expect(config).toContain('const isRemoteRun = Boolean(process.env.PLAYWRIGHT_BASE_URL)');
    // When PLAYWRIGHT_PROFILE is absent but isRemoteRun is true the profile falls back to "smoke"
    expect(config).toContain('process.env.PLAYWRIGHT_PROFILE ?? (isRemoteRun ? "smoke" : "full")');
  });

  it("remoteSafeSpecs contains the expected safe specs", () => {
    expect(config).toContain('"tests/e2e/admin-languages.spec.ts"');
    expect(config).toContain('"tests/e2e/admin-workers.spec.ts"');
    expect(config).toContain('"tests/e2e/auth-flow.spec.ts"');
    expect(config).toContain('"tests/e2e/contest-nav-test.spec.ts"');
    expect(config).toContain('"tests/e2e/ops-health.spec.ts"');
    expect(config).toContain('"tests/e2e/rankings.spec.ts"');
  });

  it("allows enough time for the local web server production build", () => {
    expect(config).toContain("timeout: 600_000");
  });

  it("reuses the prebuilt standalone app during local webServer startup", () => {
    expect(localWebServerScript).toContain("PLAYWRIGHT_REBUILD_APP");
    expect(localWebServerScript).toContain("[ ! -f .next/standalone/server.js ]");
    expect(localWebServerScript).toContain("npm run build");
  });

  it("destructive specs are excluded from the remoteSafeSpecs allowlist", () => {
    // Extract only the remoteSafeSpecs array body to avoid false positives
    // from comments or other references elsewhere in the file.
    // remoteSafeSpecsWithoutAuth is derived (filtered) from remoteSafeSpecsWithAuth,
    // so checking the superset allowlist is sufficient for destructive-spec exclusion.
    const arrayMatch = config.match(/const remoteSafeSpecsWithAuth\s*=\s*\[([\s\S]*?)\];/);
    expect(arrayMatch, "remoteSafeSpecsWithAuth array not found").toBeTruthy();
    const arrayBody = arrayMatch![1];

    expect(arrayBody).not.toContain("admin-users.spec.ts");
    expect(arrayBody).not.toContain("problem-management.spec.ts");
    expect(arrayBody).not.toContain("contest-full-lifecycle.spec.ts");
    expect(arrayBody).not.toContain("student-submission-flow.spec.ts");
    expect(arrayBody).not.toContain("contest-participant-audit.spec.ts");
    expect(arrayBody).not.toContain("contest-system.spec.ts");
  });
});
