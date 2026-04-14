import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const localBaseUrl = "http://localhost:3110";
const localServerUrl = localBaseUrl;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? localBaseUrl;
const isRemoteRun = Boolean(process.env.PLAYWRIGHT_BASE_URL);
const evidenceRoot = path.join(".sisyphus", "evidence", "playwright");

/**
 * Specs that are safe to execute against a live remote deployment.
 * These tests do not mutate critical state, create heavy DB load, or
 * require local-only fixtures.
 */
const remoteSafeSpecs = [
  "tests/e2e/admin-languages.spec.ts",
  "tests/e2e/admin-workers.spec.ts",
  "tests/e2e/auth-flow.spec.ts",
  "tests/e2e/contest-nav-test.spec.ts",
  "tests/e2e/contest-participant-audit.spec.ts",
  "tests/e2e/contest-system.spec.ts",
  "tests/e2e/ops-health.spec.ts",
  "tests/e2e/rankings.spec.ts",
];

/**
 * Profile selection:
 *
 *  PLAYWRIGHT_PROFILE=smoke   — remote-safe subset only (post-deploy check)
 *  PLAYWRIGHT_PROFILE=full    — all specs (full regression, local CI)
 *
 * Legacy behaviour: `PLAYWRIGHT_BASE_URL` alone still implies smoke.
 */
const profile = process.env.PLAYWRIGHT_PROFILE ?? (isRemoteRun ? "smoke" : "full");
const testMatch = profile === "smoke" ? remoteSafeSpecs : undefined;

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
          JUDGE_AUTH_TOKEN: process.env.JUDGE_AUTH_TOKEN ?? "playwright-local-token-for-smoke",
        },
        reuseExistingServer: false,
        timeout: 120_000,
        url: localServerUrl,
      },
});
