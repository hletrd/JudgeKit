/**
 * Shared constants for E2E tests.
 */

/** Base URL for Playwright tests. Reads PLAYWRIGHT_BASE_URL env var with fallback. */
export const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3110";

/**
 * Default credentials used by all-languages-judge and other standalone tests
 * that do not use the runtimeAdminPage fixture.
 */
export const DEFAULT_CREDENTIALS = {
  username: process.env.E2E_USERNAME ?? "test",
  password: process.env.E2E_PASSWORD ?? "Admin1234",
} as const;

/** Common CSS/ARIA selectors reused across multiple spec files. */
export const SELECTORS = {
  usernameInput: "#username",
  passwordInput: "#password",
  signInButton: '[role="button"]',
  dashboardMainContent: "#dashboard-main-content",
} as const;
