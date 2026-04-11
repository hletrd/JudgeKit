import type { Browser, Page } from "@playwright/test";

const DEFAULT_PLAYWRIGHT_BASE_URL = "http://localhost:3110";
const RUNTIME_ADMIN_EMAIL = "pwadmin_runtime@example.com";
const RUNTIME_ADMIN_NAME = "Playwright Runtime Admin";

export const RUNTIME_ADMIN_USERNAME = "pwadmin_runtime";
export const RUNTIME_ADMIN_INITIAL_PASSWORD = "admin123";
export const RUNTIME_ADMIN_UPDATED_PASSWORD = "AdminPass234";

export function getPlaywrightBaseUrl() {
  return process.env.PLAYWRIGHT_BASE_URL ?? DEFAULT_PLAYWRIGHT_BASE_URL;
}

function isRemoteTarget(): boolean {
  const baseUrl = getPlaywrightBaseUrl();
  try {
    const url = new URL(baseUrl);
    return url.hostname !== "localhost" && url.hostname !== "127.0.0.1";
  } catch {
    return false;
  }
}

/**
 * Ensure the runtime admin user exists with a known password via direct DB writes.
 * Used for local testing where the test runner has direct DB access.
 */
async function ensureRuntimeAdminUserViaDb(): Promise<string> {
  // Dynamic imports to avoid loading DB modules when testing remotely
  const { hash } = await import("bcryptjs");
  const { eq } = await import("drizzle-orm");
  const { nanoid } = await import("nanoid");
  const { db } = await import("../../../src/lib/db");
  const { submissions, users } = await import("../../../src/lib/db/schema");

  const passwordHash = await hash(RUNTIME_ADMIN_INITIAL_PASSWORD, 12);
  const existingUser = await db.query.users.findFirst({
    where: eq(users.username, RUNTIME_ADMIN_USERNAME),
  });

  if (existingUser) {
    await db.delete(submissions).where(eq(submissions.userId, existingUser.id));

    await db.update(users)
      .set({
        email: RUNTIME_ADMIN_EMAIL,
        isActive: true,
        mustChangePassword: true,
        name: RUNTIME_ADMIN_NAME,
        passwordHash,
        role: "admin",
        updatedAt: new Date(),
      })
      .where(eq(users.id, existingUser.id));

    return existingUser.id;
  }

  const id = nanoid();

  await db.insert(users)
    .values({
      id,
      email: RUNTIME_ADMIN_EMAIL,
      isActive: true,
      mustChangePassword: true,
      name: RUNTIME_ADMIN_NAME,
      passwordHash,
      role: "admin",
      updatedAt: new Date(),
      username: RUNTIME_ADMIN_USERNAME,
    })
    ;

  return id;
}

/**
 * For remote targets: no-op. We reuse the existing E2E admin account directly,
 * avoiding mustChangePassword and server-action origin issues.
 *
 * For local targets: creates/resets the pwadmin_runtime user in the local DB.
 */
export async function ensureRuntimeAdminUser(browser?: Browser) {
  if (isRemoteTarget()) {
    // Remote: reuse the E2E admin account (no user creation needed)
    return "remote-e2e-admin";
  }
  return ensureRuntimeAdminUserViaDb();
}

/**
 * Log in as the runtime admin user.
 *
 * - Local: logs in as pwadmin_runtime and handles the mustChangePassword flow.
 * - Remote: logs in as the E2E admin (E2E_USERNAME/E2E_PASSWORD) directly,
 *   bypassing the change-password server action which is blocked by origin checks.
 */
export async function loginAsRuntimeAdmin(page: Page) {
  if (isRemoteTarget()) {
    const username = process.env.E2E_USERNAME;
    const password = process.env.E2E_PASSWORD;
    if (!username || !password) {
      throw new Error("E2E_USERNAME and E2E_PASSWORD env vars required for remote targets");
    }

    await page.goto("/login", { waitUntil: "networkidle" });
    await page.locator("#username").fill(username);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: /sign in|로그인/i }).click();
    await page.waitForURL(/\/(dashboard|change-password)/, { timeout: 15_000 });

    if (page.url().includes("/change-password")) {
      throw new Error(
        "E2E admin account requires password change — set up the account on the remote server first"
      );
    }

    await page.waitForURL("**/dashboard", { timeout: 15_000 });
    return;
  }

  // Local: login as pwadmin_runtime with change-password flow
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.locator("#username").fill(RUNTIME_ADMIN_USERNAME);
  await page.locator("#password").fill(RUNTIME_ADMIN_INITIAL_PASSWORD);
  await page.getByRole("button", { name: /sign in|로그인/i }).click();
  await page.waitForURL(/\/(dashboard|change-password)/, { timeout: 15_000 });

  if (page.url().includes("/change-password")) {
    await page.locator("#currentPassword").fill(RUNTIME_ADMIN_INITIAL_PASSWORD);
    await page.locator("#newPassword").fill(RUNTIME_ADMIN_UPDATED_PASSWORD);
    await page.locator("#confirmPassword").fill(RUNTIME_ADMIN_UPDATED_PASSWORD);
    await page.getByRole("button", { name: /change password|비밀번호 변경/i }).click();
  }

  await page.waitForURL("**/dashboard", { timeout: 30_000 });
}
