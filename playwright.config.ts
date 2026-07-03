import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const localBaseUrl = "http://localhost:3110";
const localServerUrl = localBaseUrl;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? localBaseUrl;
const isRemoteRun = Boolean(process.env.PLAYWRIGHT_BASE_URL);
const evidenceRoot = path.join(".sisyphus", "evidence", "playwright");

if (!isRemoteRun) {
  process.env.PLAYWRIGHT_BASE_URL ??= localBaseUrl;
  process.env.DATABASE_URL ??= "postgres://judgekit:judgekit_test@127.0.0.1:55432/judgekit";
  process.env.E2E_USERNAME ??= "admin";
  process.env.E2E_PASSWORD ??= "admin123";
}

/**
 * Specs that are safe to execute against a live remote deployment.
 * These tests do not mutate critical state, create heavy DB load, or
 * require local-only fixtures or seeded contest data that may be absent on a
 * shared test host.
 */
const remoteSafeSpecsWithAuth = [
  "tests/e2e/admin-languages.spec.ts",
  "tests/e2e/admin-workers.spec.ts",
  "tests/e2e/auth-flow.spec.ts",
  "tests/e2e/contest-access-code-gate.spec.ts",
  "tests/e2e/contest-nav-test.spec.ts",
  "tests/e2e/locale-cookie-respected.spec.ts",
  "tests/e2e/ops-health.spec.ts",
  "tests/e2e/public-routes-no-error.spec.ts",
  "tests/e2e/public-shell.spec.ts",
  "tests/e2e/rankings.spec.ts",
  "tests/e2e/responsive-layout.spec.ts",
  "tests/e2e/session-deslop-changes.spec.ts",
  "tests/e2e/system-settings-recent-changes.spec.ts",
];

const remoteSafeSpecsWithoutAuth = remoteSafeSpecsWithAuth.filter(
  (spec) =>
    ![
      "tests/e2e/admin-languages.spec.ts",
      "tests/e2e/admin-workers.spec.ts",
      "tests/e2e/auth-flow.spec.ts",
      "tests/e2e/contest-access-code-gate.spec.ts",
      "tests/e2e/contest-nav-test.spec.ts",
      "tests/e2e/rankings.spec.ts",
    ].includes(spec),
);

/**
 * Profile selection:
 *
 *  PLAYWRIGHT_PROFILE=smoke   — remote-safe subset only (post-deploy check)
 *  PLAYWRIGHT_PROFILE=full    — all specs (full regression, local CI)
 *
 * Legacy behaviour: `PLAYWRIGHT_BASE_URL` alone still implies smoke.
 */
const profile = process.env.PLAYWRIGHT_PROFILE ?? (isRemoteRun ? "smoke" : "full");
const hasRemoteSmokeCredentials =
  !isRemoteRun || Boolean(process.env.E2E_PASSWORD && process.env.E2E_PASSWORD !== "skip-login");
const testMatch =
  profile === "smoke"
    ? hasRemoteSmokeCredentials
      ? remoteSafeSpecsWithAuth
      : remoteSafeSpecsWithoutAuth
    : undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch,
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  outputDir: path.join(evidenceRoot, "artifacts"),
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: path.join(evidenceRoot, "html-report") }],
  ],
  use: {
    baseURL,
    headless: true,
    trace: isRemoteRun ? "off" : "retain-on-failure",
    video: isRemoteRun ? "off" : "retain-on-failure",
    screenshot: isRemoteRun ? "off" : "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
  webServer: isRemoteRun
    ? undefined
    : {
        command: "bash scripts/playwright-local-webserver.sh",
        env: {
          ...process.env,
          AUTH_URL: localBaseUrl,
          AUTH_TRUST_HOST: "true",
          TRUSTED_PROXY_HOPS: "1",
          TRUST_HOST_OVERRIDE: "1",
          // Pass through the operator's JUDGE_AUTH_TOKEN only when it is a real
          // value. Never inject the placeholder fallback: it is byte-identical
          // to JUDGE_AUTH_TOKEN_PLAYWRIGHT_PLACEHOLDER, which
          // getValidatedJudgeAuthToken() rejects (src/lib/security/env.ts), so
          // the server would throw at boot. When unset, the webServer script
          // mints a strong ephemeral token itself.
          ...(process.env.JUDGE_AUTH_TOKEN
            ? { JUDGE_AUTH_TOKEN: process.env.JUDGE_AUTH_TOKEN }
            : {}),
        },
        reuseExistingServer: false,
        timeout: 600_000,
        url: localServerUrl,
      },
});
