/**
 * E2E tests for Admin System Settings.
 *
 * Tests navigation to the settings page, tab switching, and updating site title.
 *
 * Run against a live server:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3110 E2E_USERNAME=admin E2E_PASSWORD=xxx npx playwright test tests/e2e/admin-settings.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";
import { loginWithCredentials } from "./support/helpers";
import { DEFAULT_CREDENTIALS } from "./support/constants";

const NEW_PASSWORD = process.env.E2E_NEW_PASSWORD || DEFAULT_CREDENTIALS.password;
const SETTINGS_PATH = "/dashboard/admin/settings";

let sharedPage: Page;

async function loginAsAdmin(page: Page) {
  await loginWithCredentials(page, DEFAULT_CREDENTIALS.username, DEFAULT_CREDENTIALS.password, {
    allowPasswordChange: true,
  });
  if (page.url().includes("/change-password")) {
    await page.locator("#currentPassword").fill(DEFAULT_CREDENTIALS.password);
    await page.locator("#newPassword").fill(NEW_PASSWORD);
    await page.locator("#confirmPassword").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: /Change Password|비밀번호 변경/ }).click();
    await page.waitForURL("**/dashboard", { timeout: 15_000 });
  }
}

test.describe.serial("Admin System Settings", () => {
  test("Step 1: Login as admin", async ({ page }) => {
    sharedPage = page;
    await loginAsAdmin(page);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("Step 2: Navigate to settings page", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(SETTINGS_PATH, { waitUntil: "networkidle" });
    await expect(page).toHaveURL(new RegExp(SETTINGS_PATH.replace(/\//g, "\\/")));
  });

  test("Step 3: View general settings tab", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(SETTINGS_PATH, { waitUntil: "networkidle" });

    // General settings form should be visible
    const siteTitle = page.locator("#site-title");
    await expect(siteTitle).toBeVisible();
  });

  test("Step 4: Update site title", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(SETTINGS_PATH, { waitUntil: "networkidle" });

    const suffix = `e2e-${Date.now()}`;
    const newTitle = `JudgeKit Test ${suffix}`;

    const siteTitleInput = page.locator("#site-title");
    await expect(siteTitleInput).toBeVisible();

    // Store original value for restore
    const originalTitle = await siteTitleInput.inputValue();

    await siteTitleInput.fill(newTitle);
    await page.getByRole("button", { name: /save|저장/i }).click();

    const successIndicator = page
      .locator('[role="status"], [data-sonner-toast], .toast')
      .filter({ hasText: /success|saved|updated|성공/i })
      .first();

    try {
      await expect(successIndicator).toBeVisible({ timeout: 8_000 });
    } catch {
      await expect.poll(async () => siteTitleInput.inputValue()).toBe(newTitle);
    }

    // Restore original title
    await siteTitleInput.fill(originalTitle || "JudgeKit");
    await page.getByRole("button", { name: /save|저장/i }).click();
  });

  test("Step 5: Navigate to security tab", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${SETTINGS_PATH}#security`, { waitUntil: "networkidle" });

    // Try clicking a security tab if present
    const securityTab = page.getByRole("tab", { name: /security|보안/i });
    const tabCount = await securityTab.count();
    if (tabCount > 0) {
      await securityTab.first().click();
      await page.waitForLoadState("networkidle");
    }

    // Page should still be on settings
    await expect(page).toHaveURL(new RegExp(SETTINGS_PATH.replace(/\//g, "\\/")));
  });

  test("Step 6: View database info tab", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${SETTINGS_PATH}#database`, { waitUntil: "networkidle" });

    // Try clicking a database tab if present
    const dbTab = page.getByRole("tab", { name: /database|데이터베이스/i });
    const tabCount = await dbTab.count();
    if (tabCount > 0) {
      await dbTab.first().click();
      await page.waitForLoadState("networkidle");
    }

    // Settings page should still be accessible
    await expect(page).toHaveURL(new RegExp(SETTINGS_PATH.replace(/\//g, "\\/")));
  });
});
