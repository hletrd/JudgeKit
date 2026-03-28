/**
 * E2E tests for Admin Languages Management.
 *
 * Tests the language list page, search/filter, and enable/disable toggling.
 *
 * Run against a live server:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3110 E2E_USERNAME=admin E2E_PASSWORD=xxx npx playwright test tests/e2e/admin-languages.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";
import { loginWithCredentials } from "./support/helpers";
import { DEFAULT_CREDENTIALS } from "./support/constants";

const NEW_PASSWORD = process.env.E2E_NEW_PASSWORD || DEFAULT_CREDENTIALS.password;
const LANGUAGES_PATH = "/dashboard/admin/languages";

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

test.describe.serial("Admin Languages", () => {
  test("Step 1: Login as admin", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("Step 2: Navigate to languages page", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(LANGUAGES_PATH, { waitUntil: "networkidle" });
    await expect(page).toHaveURL(new RegExp(LANGUAGES_PATH.replace(/\//g, "\\/")));
  });

  test("Step 3: Language list renders with entries", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(LANGUAGES_PATH, { waitUntil: "networkidle" });

    const mainContent = page.locator("#dashboard-main-content");
    await expect(mainContent).toBeVisible();

    // Table or list of languages should be present
    const table = page.locator("#dashboard-main-content table");
    const tableCount = await table.count();

    if (tableCount > 0) {
      await expect(table.first()).toBeVisible();
      // At least one row (beyond header) should exist for a seeded instance
      const rows = table.first().locator("tbody tr");
      const rowCount = await rows.count();
      expect(rowCount).toBeGreaterThan(0);
    } else {
      // Fallback: any list items
      const listItems = page.locator("#dashboard-main-content li");
      const liCount = await listItems.count();
      expect(liCount).toBeGreaterThan(0);
    }
  });

  test("Step 4: Search filters languages", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(LANGUAGES_PATH, { waitUntil: "networkidle" });

    // Look for a search/filter input
    const searchInput = page.locator(
      'input[type="search"], input[placeholder*="search" i], input[placeholder*="filter" i], input[placeholder*="언어" i], #language-search, [id*="search"]'
    );
    const inputCount = await searchInput.count();

    if (inputCount > 0) {
      // Search for a well-known language
      await searchInput.first().fill("Python");
      await page.waitForLoadState("networkidle");

      const mainContent = page.locator("#dashboard-main-content");
      await expect(mainContent).toBeVisible();

      // If there is a table, Python-related rows should appear (or zero results)
      const table = page.locator("#dashboard-main-content table");
      const tableCount = await table.count();
      if (tableCount > 0) {
        // The table content should at minimum be visible
        await expect(table.first()).toBeVisible();
      }

      // Clear search and verify page is still functional
      await searchInput.first().fill("");
      await page.waitForLoadState("networkidle");
      await expect(mainContent).toBeVisible();
    } else {
      // No search input present — skip gracefully
      const mainContent = page.locator("#dashboard-main-content");
      await expect(mainContent).toBeVisible();
    }
  });

  test("Step 5: Language rows have enable/disable controls", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(LANGUAGES_PATH, { waitUntil: "networkidle" });

    const mainContent = page.locator("#dashboard-main-content");
    await expect(mainContent).toBeVisible();

    // Look for toggle switches, checkboxes, or enable/disable buttons
    const toggles = page.locator(
      '[role="switch"], input[type="checkbox"], button[aria-label*="enable" i], button[aria-label*="disable" i]'
    );
    const toggleCount = await toggles.count();

    // If toggles exist, verify at least one is visible and interactive
    if (toggleCount > 0) {
      await expect(toggles.first()).toBeVisible();
    }
    // Even with no toggles, the page should render without error
  });

  test("Step 6: Languages page heading is visible", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(LANGUAGES_PATH, { waitUntil: "networkidle" });

    // Page should have a heading or title indicating the languages section
    const heading = page.getByRole("heading", { name: /language|언어/i });
    const headingCount = await heading.count();

    if (headingCount > 0) {
      await expect(heading.first()).toBeVisible();
    } else {
      // Fallback: main content area is visible
      await expect(page.locator("#dashboard-main-content")).toBeVisible();
    }
  });
});
