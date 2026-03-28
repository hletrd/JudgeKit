/**
 * Admin User Management E2E Test
 *
 * Tests admin user management: navigate to the users page, verify the table
 * renders, create a user via API, search for the user in the UI, and
 * deactivate (or delete) the user.
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3110 E2E_USERNAME=admin E2E_PASSWORD=yourpass npx playwright test tests/e2e/admin-users.spec.ts
 */

import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { loginWithCredentials, navigateTo } from "./support/helpers";
import { DEFAULT_CREDENTIALS, BASE_URL } from "./support/constants";

const CSRF_HEADERS = {
  "Content-Type": "application/json",
  "X-Requested-With": "XMLHttpRequest",
};

const suffix = `e2e-${Date.now()}`;

// Shared state across serial tests
let adminPage: Page;
let adminRequest: APIRequestContext;
let createdUserId: string;

const newUsername = `e2e-user-${suffix}`;
const newUserName = `E2E Test User ${suffix}`;
const newUserPassword = "TestUser123!";

async function loginAsAdmin(page: Page) {
  await loginWithCredentials(page, DEFAULT_CREDENTIALS.username, DEFAULT_CREDENTIALS.password, {
    allowPasswordChange: true,
  });
  if (page.url().includes("/change-password")) {
    await page.locator("#currentPassword").fill(DEFAULT_CREDENTIALS.password);
    await page.locator("#newPassword").fill(DEFAULT_CREDENTIALS.password);
    await page.locator("#confirmPassword").fill(DEFAULT_CREDENTIALS.password);
    await page.getByRole("button", { name: /Change Password|비밀번호 변경/ }).click();
    await page.waitForURL("**/dashboard", { timeout: 15_000 });
  }
}

async function apiPost(request: APIRequestContext, path: string, data: Record<string, unknown>) {
  const res = await request.post(path, { data, headers: CSRF_HEADERS });
  const body = await res.json();
  if (!res.ok()) {
    throw new Error(`API POST ${path} failed (${res.status()}): ${JSON.stringify(body)}`);
  }
  return body;
}

test.describe.serial("Admin User Management", () => {
  test("Step 1: Admin login", async ({ browser }) => {
    adminPage = await browser.newPage();
    await loginAsAdmin(adminPage);
    adminRequest = adminPage.request;
    expect(adminPage.url()).toContain("/dashboard");
  });

  test("Step 2: Navigate to admin users page", async () => {
    await navigateTo(adminPage, "/dashboard/admin/users");
    await adminPage.waitForLoadState("networkidle");

    const content = await adminPage.textContent("body");
    expect(content).toMatch(/user|사용자/i);
  });

  test("Step 3: Users list renders with a table", async () => {
    await navigateTo(adminPage, "/dashboard/admin/users");
    await adminPage.waitForLoadState("networkidle");

    // Table should be present with at least the admin user
    const table = adminPage.locator("table").first();
    await expect(table).toBeVisible();

    const rows = table.locator("tbody tr");
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);

    // Admin user should be listed
    const content = await adminPage.textContent("body");
    expect(content).toContain(DEFAULT_CREDENTIALS.username);
  });

  test("Step 4: Create new user via API", async () => {
    const res = await apiPost(adminRequest, "/api/v1/users", {
      username: newUsername,
      name: newUserName,
      role: "student",
      password: newUserPassword,
    });
    createdUserId = res.data.user?.id ?? res.data.id;
    expect(createdUserId).toBeTruthy();
    console.log(`  Created user: ${createdUserId} — @${newUsername}`);
  });

  test("Step 5: Created user appears in users list", async () => {
    await navigateTo(adminPage, "/dashboard/admin/users");
    await adminPage.waitForLoadState("networkidle");

    const content = await adminPage.textContent("body");
    expect(content).toContain(newUsername);
  });

  test("Step 6: Search for created user", async () => {
    await navigateTo(adminPage, "/dashboard/admin/users");
    await adminPage.waitForLoadState("networkidle");

    // Look for a search input on the page
    const searchInput = adminPage
      .locator('input[type="search"], input[placeholder*="search" i], input[placeholder*="Search" i], #user-search')
      .first();

    const searchCount = await searchInput.count();
    if (searchCount > 0) {
      await searchInput.fill(newUsername);
      // Trigger search (Enter or button click)
      await searchInput.press("Enter");
      await adminPage.waitForLoadState("networkidle");

      const content = await adminPage.textContent("body");
      expect(content).toContain(newUsername);
    } else {
      // No search input visible — navigate with query param
      await navigateTo(adminPage, `/dashboard/admin/users?search=${newUsername}`);
      await adminPage.waitForLoadState("networkidle");
      const content = await adminPage.textContent("body");
      expect(content).toContain(newUsername);
    }
  });

  test("Step 7: Navigate to user detail page", async () => {
    await navigateTo(adminPage, `/dashboard/admin/users/${createdUserId}`);
    await adminPage.waitForLoadState("networkidle");

    const content = await adminPage.textContent("body");
    expect(content).toContain(newUsername);
    expect(content).toContain(newUserName);
  });

  test("Step 8: Deactivate user via API (PATCH isActive=false)", async () => {
    const res = await adminRequest.patch(`/api/v1/users/${createdUserId}`, {
      data: { isActive: false },
      headers: CSRF_HEADERS,
    });
    expect([200, 204]).toContain(res.status());
    console.log(`  Deactivated user: ${createdUserId} (status ${res.status()})`);
  });

  test("Step 9: User API reflects deactivated state", async () => {
    const res = await adminRequest.get(`/api/v1/users/${createdUserId}`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.data.isActive).toBe(false);
    console.log(`  User isActive: ${body.data.isActive}`);
  });

  test("Step 10: Delete user via API", async () => {
    const res = await adminRequest.delete(`/api/v1/users/${createdUserId}`, {
      headers: CSRF_HEADERS,
    });
    // Accept 200, 204, or 404 (may not support hard delete — soft delete only)
    expect([200, 204, 404, 405]).toContain(res.status());
    console.log(`  Delete user response: ${res.status()}`);
  });

  test("Step 11: Cleanup - close admin page", async () => {
    await adminPage?.close();
  });
});
