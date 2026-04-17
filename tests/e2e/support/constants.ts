/**
 * Shared constants for E2E tests.
 */

/** Base URL for Playwright tests. Reads PLAYWRIGHT_BASE_URL env var with fallback. */
export const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3110";

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(
      `Missing required E2E environment variable: ${name}. ` +
      `Set it in .env or pass via CLI: ${name}=value npx playwright test`
    );
  }
  return value;
}

/**
 * Default credentials used by all-languages-judge and other standalone tests
 * that do not use the runtimeAdminPage fixture.
 */
export const DEFAULT_CREDENTIALS = {
  username: requireEnv("E2E_USERNAME", "test"),
  password: requireEnv("E2E_PASSWORD"),
} as const;

/** Common CSS/ARIA selectors reused across multiple spec files. */
export const SELECTORS = {
  usernameInput: "#username",
  passwordInput: "#password",
  signInButton: '[role="button"]',
  dashboardMainContent: "#main-content",
} as const;
