import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

export default defineConfig({
  testDir: "./tests/visual",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: [["list"]],
  use: {
    headless: true,
    trace: "off",
    video: "off",
    screenshot: "on",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
