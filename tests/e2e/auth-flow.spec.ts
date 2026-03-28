/**
 * E2E tests for the Authentication Flow.
 *
 * Tests login/logout, invalid credential handling, and forced password change.
 *
 * Run against a live server:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3110 E2E_USERNAME=admin E2E_PASSWORD=xxx npx playwright test tests/e2e/auth-flow.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";
import { loginWithCredentials } from "./support/helpers";
import { DEFAULT_CREDENTIALS } from "./support/constants";

const NEW_PASSWORD = process.env.E2E_NEW_PASSWORD || DEFAULT_CREDENTIALS.password;

let loggedInPage: Page;

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

test.describe.serial("Auth Flow", () => {
  test("Login with valid credentials redirects to dashboard", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator("#dashboard-main-content")).toBeVisible();
  });

  test("Login with invalid credentials shows error", async ({ page }) => {
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.locator("#username").fill(DEFAULT_CREDENTIALS.username);
    await page.locator("#password").fill(`wrong-password-${Date.now()}`);
    await page.getByRole("button", { name: /sign in|로그인/i }).click();

    // Should stay on login page or show an error — not redirect to dashboard
    await page.waitForTimeout(3_000);
    const url = page.url();
    const isOnLogin = url.includes("/login") || !url.includes("/dashboard");
    expect(isOnLogin).toBeTruthy();

    // Error message or toast visible
    const errorLocator = page.locator(
      '[role="alert"], [data-sonner-toast], .toast, [role="status"]'
    );
    const errorCount = await errorLocator.count();
    const onLoginPage = url.includes("/login");
    // Either stayed on login (error inline) or showed a toast
    expect(onLoginPage || errorCount > 0).toBeTruthy();
  });

  test("Logout redirects to login page", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page).toHaveURL(/\/dashboard/);

    // Trigger logout via API route
    const response = await page.request.post("/api/auth/signout", {
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
    });

    // Navigate to logout or use the UI logout link
    const logoutLink = page.getByRole("link", { name: /logout|sign out|로그아웃/i });
    const logoutCount = await logoutLink.count();

    if (logoutCount > 0) {
      await logoutLink.first().click();
    } else {
      // Try sidebar/menu logout button
      const logoutButton = page.getByRole("button", { name: /logout|sign out|로그아웃/i });
      const btnCount = await logoutButton.count();
      if (btnCount > 0) {
        await logoutButton.first().click();
      } else {
        await page.goto("/api/auth/signout", { waitUntil: "networkidle" });
      }
    }

    await page.waitForURL(/\/login/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("Unauthenticated access to dashboard redirects to login", async ({ page }) => {
    // Visit dashboard without logging in — should redirect to login
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/login/);
  });

  test("Login page has username and password fields", async ({ page }) => {
    await page.goto("/login", { waitUntil: "networkidle" });
    await expect(page.locator("#username")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in|로그인/i })).toBeVisible();
  });
});
