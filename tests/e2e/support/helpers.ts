/**
 * Shared helper functions for E2E tests.
 *
 * Only patterns that appear in 2+ spec files are extracted here.
 */

import type { Page } from "@playwright/test";
import { BASE_URL } from "./constants";

/**
 * Log in as an arbitrary user via the login form.
 *
 * @param page - Playwright Page instance.
 * @param username - Username to fill in.
 * @param password - Password to fill in.
 * @param options.allowPasswordChange - When true the helper succeeds even if
 *   the server redirects to /change-password (e.g. admin first-login flows).
 *   When false (default) an error is thrown on that redirect so callers are
 *   alerted to unexpected forced-change state.
 */
export async function loginWithCredentials(
  page: Page,
  username: string,
  password: string,
  options: { allowPasswordChange?: boolean } = {},
): Promise<void> {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /sign in|로그인/i }).click();

  await page.waitForURL(/\/(dashboard|change-password)(?:$|\?)/, { timeout: 15_000 });

  if (page.url().includes("/change-password") && !options.allowPasswordChange) {
    throw new Error(`Unexpected forced password change for ${username}`);
  }
}

/**
 * Navigate to a path relative to the Playwright base URL.
 *
 * Useful in contexts where the page baseURL is not configured (e.g. when a
 * test creates a fresh BrowserContext without inheriting the fixture's
 * baseURL).
 */
export async function navigateTo(page: Page, path: string): Promise<void> {
  const url = `${BASE_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
  await page.goto(url, { waitUntil: "networkidle" });
}

/**
 * Wait for a toast notification containing the given text to become visible.
 *
 * @param page - Playwright Page instance.
 * @param message - Substring that must appear inside the toast element.
 * @param options.timeout - Maximum wait time in milliseconds (default 8 000).
 */
export async function waitForToast(
  page: Page,
  message: string,
  options: { timeout?: number } = {},
): Promise<void> {
  const { timeout = 8_000 } = options;
  // Toasts are typically rendered inside [role="status"] or a dedicated
  // .toast / [data-sonner-toast] container — match any of them.
  await page
    .locator('[role="status"], [data-sonner-toast], .toast')
    .filter({ hasText: message })
    .first()
    .waitFor({ state: "visible", timeout });
}
