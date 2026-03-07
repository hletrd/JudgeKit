import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const localServerUrl = "http://127.0.0.1:3110";
const localBaseUrl = "http://localhost:3110";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? localBaseUrl;
const evidenceRoot = path.join(".sisyphus", "evidence", "playwright");

export default defineConfig({
  testDir: "./tests/e2e",
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
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run start -- --hostname 127.0.0.1 --port 3110",
        env: {
          ...process.env,
          AUTH_URL: localBaseUrl,
          JUDGE_AUTH_TOKEN: process.env.JUDGE_AUTH_TOKEN ?? "playwright-local-token-for-smoke",
        },
        reuseExistingServer: true,
        timeout: 120_000,
        url: localServerUrl,
      },
});
