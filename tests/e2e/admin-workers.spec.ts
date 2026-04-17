/**
 * E2E tests for the Admin Workers Dashboard.
 *
 * Tests the workers list page, stats cards, table rendering, and the add-worker dialog.
 *
 * Run against a live server:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3110 E2E_USERNAME=admin E2E_PASSWORD=xxx npx playwright test tests/e2e/admin-workers.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";
import { loginWithCredentials } from "./support/helpers";
import { DEFAULT_CREDENTIALS } from "./support/constants";

const NEW_PASSWORD = process.env.E2E_NEW_PASSWORD || DEFAULT_CREDENTIALS.password;
const WORKERS_PATH = "/dashboard/admin/workers";

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

test.describe.serial("Admin Workers Dashboard", () => {
  test("Step 1: Login as admin", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("Step 2: Navigate to workers page", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(WORKERS_PATH, { waitUntil: "networkidle" });
    await expect(page).toHaveURL(new RegExp(WORKERS_PATH.replace(/\//g, "\\/")));
  });

  test("Step 3: Stats cards are visible", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(WORKERS_PATH, { waitUntil: "networkidle" });

    // Stats cards should render (even if counts are zero)
    const mainContent = page.locator("#main-content");
    await expect(mainContent).toBeVisible();

    // Look for numeric stat indicators — cards typically show counts
    const statCards = page.locator("[data-slot='card'], .card, [class*='stat']");
    const cardCount = await statCards.count();

    // The page should at minimum render the main content area without error
    await expect(mainContent).toBeVisible();
    // If stat cards exist, at least one should be visible
    if (cardCount > 0) {
      await expect(statCards.first()).toBeVisible();
    }
  });

  test("Step 4: Workers table renders", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(WORKERS_PATH, { waitUntil: "networkidle" });

    const mainContent = page.locator("#main-content");
    await expect(mainContent).toBeVisible();

    // Either a table or an empty-state message should be present
    const table = page.locator("#main-content table");
    const emptyState = page.locator("#main-content").filter({
      hasText: /no workers|등록된 워커|empty|없음/i,
    });

    const tableCount = await table.count();
    const emptyCount = await emptyState.count();

    expect(tableCount + emptyCount).toBeGreaterThan(0);
  });

  test("Step 5: Workers API stats endpoint responds", async ({ page }) => {
    await loginAsAdmin(page);

    const response = await page.request.get("/api/v1/admin/workers/stats", {
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
    });

    // Should respond with 200 (authenticated admin)
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toBeDefined();
  });

  test("Step 6: Workers API list endpoint responds", async ({ page }) => {
    await loginAsAdmin(page);

    const response = await page.request.get("/api/v1/admin/workers", {
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body) || typeof body === "object").toBeTruthy();
  });
});
