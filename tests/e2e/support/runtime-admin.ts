import type { Page } from "@playwright/test";
import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../../../src/lib/db";
import { users } from "../../../src/lib/db/schema";

const DEFAULT_PLAYWRIGHT_BASE_URL = "http://localhost:3110";
const RUNTIME_ADMIN_EMAIL = "pwadmin_runtime@example.com";
const RUNTIME_ADMIN_NAME = "Playwright Runtime Admin";

export const RUNTIME_ADMIN_USERNAME = "pwadmin_runtime";
export const RUNTIME_ADMIN_INITIAL_PASSWORD = "admin123";
export const RUNTIME_ADMIN_UPDATED_PASSWORD = "AdminPass234";

export function getPlaywrightBaseUrl() {
  return process.env.PLAYWRIGHT_BASE_URL ?? DEFAULT_PLAYWRIGHT_BASE_URL;
}

export async function ensureRuntimeAdminUser() {
  const passwordHash = await hash(RUNTIME_ADMIN_INITIAL_PASSWORD, 12);
  const existingUser = await db.query.users.findFirst({
    where: eq(users.username, RUNTIME_ADMIN_USERNAME),
  });

  if (existingUser) {
    db.update(users)
      .set({
        email: RUNTIME_ADMIN_EMAIL,
        isActive: true,
        mustChangePassword: true,
        name: RUNTIME_ADMIN_NAME,
        passwordHash,
        role: "admin",
        updatedAt: new Date(),
      })
      .where(eq(users.id, existingUser.id))
      .run();

    return existingUser.id;
  }

  const id = nanoid();

  db.insert(users)
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
    .run();

  return id;
}

export async function loginAsRuntimeAdmin(page: Page) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.locator("#username").fill(RUNTIME_ADMIN_USERNAME);
  await page.locator("#password").fill(RUNTIME_ADMIN_INITIAL_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(dashboard|change-password)/, { timeout: 15_000 });

  if (page.url().includes("/change-password")) {
    await page.locator("#currentPassword").fill(RUNTIME_ADMIN_INITIAL_PASSWORD);
    await page.locator("#newPassword").fill(RUNTIME_ADMIN_UPDATED_PASSWORD);
    await page.locator("#confirmPassword").fill(RUNTIME_ADMIN_UPDATED_PASSWORD);
    await page.getByRole("button", { name: "Change Password" }).click();
  }

  await page.waitForURL("**/dashboard", { timeout: 15_000 });
}
