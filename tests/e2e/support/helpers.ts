/**
 * Shared helper functions for E2E tests.
 *
 * Only patterns that appear in 2+ spec files are extracted here.
 */

import type { Page, APIRequestContext } from "@playwright/test";
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

// ---------------------------------------------------------------------------
// API helpers for test setup/teardown
// ---------------------------------------------------------------------------

const CSRF_HEADERS = {
  "Content-Type": "application/json",
  "X-Requested-With": "XMLHttpRequest",
};

/**
 * Create a problem directly via API for test setup.
 *
 * @returns The created problem's data object (includes `id`).
 */
export async function createProblemViaApi(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; title: string }> {
  const suffix = `e2e-${Date.now()}`;
  const body = {
    title: `[E2E] Test Problem ${suffix}`,
    description: "Automated test problem.",
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    visibility: "public",
    testCases: [
      { input: "1 2\n", expectedOutput: "3", isVisible: true, sortOrder: 0 },
    ],
    ...overrides,
  };

  const res = await request.post("/api/v1/problems", {
    data: body,
    headers: CSRF_HEADERS,
  });
  if (!res.ok()) {
    throw new Error(`createProblemViaApi failed (${res.status()}): ${await res.text()}`);
  }
  const json = await res.json();
  return json.data;
}

/**
 * Submit code to a problem directly via API.
 *
 * @returns The created submission's data object (includes `id`).
 */
export async function createSubmissionViaApi(
  request: APIRequestContext,
  problemId: string,
  language: string,
  sourceCode: string,
): Promise<{ id: string; status: string }> {
  const res = await request.post("/api/v1/submissions", {
    data: { problemId, language, sourceCode },
    headers: CSRF_HEADERS,
  });
  if (!res.ok()) {
    throw new Error(`createSubmissionViaApi failed (${res.status()}): ${await res.text()}`);
  }
  const json = await res.json();
  return json.data;
}

/**
 * Poll a submission until judging completes (reaches a terminal status).
 *
 * @returns The final submission data object.
 */
export async function waitForSubmissionResult(
  request: APIRequestContext,
  submissionId: string,
  timeoutMs = 60_000,
): Promise<{ id: string; status: string; score: number | null }> {
  const terminalStatuses = new Set([
    "accepted",
    "wrong_answer",
    "time_limit",
    "memory_limit",
    "runtime_error",
    "compile_error",
  ]);
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const res = await request.get(`/api/v1/submissions/${submissionId}`);
    if (res.ok()) {
      const json = await res.json();
      const data = json.data ?? json;
      if (terminalStatuses.has(data.status)) {
        return data;
      }
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }

  throw new Error(`Submission ${submissionId} did not finish within ${timeoutMs}ms`);
}
