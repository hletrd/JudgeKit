import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const localBaseUrl = "http://localhost:3110";
const localServerUrl = localBaseUrl;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? localBaseUrl;
const isRemoteRun = Boolean(process.env.PLAYWRIGHT_BASE_URL);
const evidenceRoot = path.join(".sisyphus", "evidence", "playwright");
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

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: isRemoteRun ? remoteSafeSpecs : undefined,
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
