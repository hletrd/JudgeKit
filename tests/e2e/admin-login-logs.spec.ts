import { hash } from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { loginEvents, users } from "@/lib/db/schema";
import { captureEvidence } from "./support/evidence";
import { expect, test } from "./fixtures";
import { loginWithCredentials } from "./support/helpers";
import { RUNTIME_ADMIN_USERNAME } from "./support/runtime-admin";

const PAGE_SIZE = 50;
const LOGIN_LOGS_PATH = "/dashboard/admin/login-logs";
const RUNTIME_INSTRUCTOR_USERNAME = "pwloginlogs_instructor";
const RUNTIME_INSTRUCTOR_PASSWORD = process.env.E2E_INSTRUCTOR_PASSWORD ?? "InstructorPass234";
const RUNTIME_INSTRUCTOR_EMAIL = "pwloginlogs_instructor@example.com";
const RUNTIME_INSTRUCTOR_NAME = "Playwright Login Logs Instructor";

async function ensureRuntimeInstructorUser() {
  const passwordHash = await hash(RUNTIME_INSTRUCTOR_PASSWORD, 12);
  const existingUser = await db.query.users.findFirst({
    where: eq(users.username, RUNTIME_INSTRUCTOR_USERNAME),
  });

  if (existingUser) {
    await db.update(users)
      .set({
        email: RUNTIME_INSTRUCTOR_EMAIL,
        isActive: true,
        mustChangePassword: false,
        name: RUNTIME_INSTRUCTOR_NAME,
        passwordHash,
        role: "instructor",
        updatedAt: new Date(),
      })
      .where(eq(users.id, existingUser.id));

    return existingUser.id;
  }

  const id = nanoid();

  await db.insert(users)
    .values({
      id,
      email: RUNTIME_INSTRUCTOR_EMAIL,
      isActive: true,
      mustChangePassword: false,
      name: RUNTIME_INSTRUCTOR_NAME,
      passwordHash,
      role: "instructor",
      updatedAt: new Date(),
      username: RUNTIME_INSTRUCTOR_USERNAME,
    });

  return id;
}


async function deleteLoginLogFixtures(prefix: string) {
  await db.delete(loginEvents)
    .where(sql`${loginEvents.attemptedIdentifier} like ${`${prefix}%`}`);
}

test("admin can navigate, filter, and paginate login logs safely", async ({
  runtimeAdminPage: page,
  runtimeSuffix,
}, testInfo) => {
  const loginLogsTable = page.locator("#main-content table:visible").first();
  const prefix = `pw-task11-${runtimeSuffix}`;
  const paginationPrefix = `${prefix}-page-`;
  const literalNeedle = `${prefix}-literal%_needle`;
  const decoyNeedle = `${prefix}-literalABneedle`;
  const runtimeAdmin = await db.query.users.findFirst({
    where: eq(users.username, RUNTIME_ADMIN_USERNAME),
  });

  if (!runtimeAdmin) {
    throw new Error("Runtime admin user is unavailable for login-log verification");
  }

  await deleteLoginLogFixtures(prefix);

  const baseTimestamp = Date.now();
  const paginationEvents = Array.from({ length: PAGE_SIZE + 2 }, (_, index) => ({
    id: nanoid(),
    attemptedIdentifier: `${paginationPrefix}${String(index).padStart(2, "0")}`,
    createdAt: new Date(baseTimestamp + index),
    ipAddress: `198.51.100.${(index % 200) + 1}`,
    outcome: "success",
    requestMethod: "POST",
    requestPath: "/api/auth/callback/credentials",
    userAgent: `pw-task11-pagination-agent/${index}`,
    userId: index === PAGE_SIZE + 1 ? runtimeAdmin.id : null,
  }));

  const focusedEvents = [
    {
      id: nanoid(),
      attemptedIdentifier: `${literalNeedle}@example.com`,
      createdAt: new Date(baseTimestamp + 1_000),
      ipAddress: "203.0.113.41",
      outcome: "invalid_credentials",
      requestMethod: "POST",
      requestPath: "/api/auth/callback/credentials",
      userAgent:
        `pw-task11-sensitive-agent ${prefix} ` +
        "token_like_value_should_not_render_in_full_because_the_login_log_table_only_shows_a_bounded_summary",
      userId: runtimeAdmin.id,
    },
    {
      id: nanoid(),
      attemptedIdentifier: `${decoyNeedle}@example.com`,
      createdAt: new Date(baseTimestamp + 1_001),
      ipAddress: "203.0.113.42",
      outcome: "invalid_credentials",
      requestMethod: "POST",
      requestPath: "/api/auth/callback/credentials",
      userAgent: `pw-task11-decoy-agent ${prefix}`,
      userId: null,
    },
    {
      id: nanoid(),
      attemptedIdentifier: `${prefix}-policy-denied@example.com`,
      createdAt: new Date(baseTimestamp + 1_002),
      ipAddress: "203.0.113.43",
      outcome: "policy_denied",
      requestMethod: "POST",
      requestPath: "/api/auth/callback/credentials",
      userAgent: `pw-task11-policy-agent ${prefix}`,
      userId: runtimeAdmin.id,
    },
  ] as const;

  try {
    await db.insert(loginEvents)
      .values([...paginationEvents, ...focusedEvents]);

    await test.step("show the admin sidebar entry and first filtered page", async () => {
      const loginLogsLink = page.getByRole("link", { name: "Login Logs" });

      await expect(loginLogsLink).toBeVisible();
      await expect(loginLogsLink).toHaveAttribute("href", LOGIN_LOGS_PATH);
      await page.goto(LOGIN_LOGS_PATH, { waitUntil: "networkidle" });

      await page.locator("#login-log-search").fill(paginationPrefix);
      await page.getByRole("button", { name: "Apply Filters" }).click();

      await expect(page).toHaveURL(new RegExp(`${LOGIN_LOGS_PATH.replaceAll("/", "\\/")}\\?search=`));
      await expect(page.getByLabel("Page 2")).toBeVisible();
      await expect(loginLogsTable).toContainText(`${paginationPrefix}51`);
      await expect(loginLogsTable).not.toContainText(`${paginationPrefix}00`);
      await captureEvidence(page, testInfo, "task11-login-logs-page-1");
    });

    await test.step("paginate to the older login events", async () => {
      await page.getByLabel("Next page").click();

      await expect(page).toHaveURL(new RegExp(`${LOGIN_LOGS_PATH.replaceAll("/", "\\/")}\\?page=2&search=`));
      await expect(page.getByLabel("Page 2")).toBeVisible();
      await expect(loginLogsTable).toContainText(`${paginationPrefix}00`);
      await expect(loginLogsTable).toContainText(`${paginationPrefix}01`);
    });

    await test.step("apply a literal search plus outcome filter without exposing raw metadata", async () => {
      await page.goto(LOGIN_LOGS_PATH, { waitUntil: "networkidle" });
      await page.locator("#login-log-search").fill(literalNeedle);
      await page.locator("#login-log-outcome").selectOption("invalid_credentials");
      await page.getByRole("button", { name: "Apply Filters" }).click();

      await expect(loginLogsTable).toContainText(`${literalNeedle}@example.com`);
      await expect(loginLogsTable).toContainText("Invalid Credentials");
      await expect(loginLogsTable).toContainText(`@${RUNTIME_ADMIN_USERNAME}`);
      await expect(loginLogsTable).not.toContainText(`${decoyNeedle}@example.com`);
      await expect(loginLogsTable).not.toContainText("/api/auth/callback/credentials");
      await expect(loginLogsTable).not.toContainText("POST");
      await captureEvidence(page, testInfo, "task11-login-logs-filtered");
    });

    await test.step("render and filter policy-denied outcomes", async () => {
      await page.goto(LOGIN_LOGS_PATH, { waitUntil: "networkidle" });
      await page.locator("#login-log-outcome").selectOption("policy_denied");
      await page.getByRole("button", { name: "Apply Filters" }).click();

      await expect(loginLogsTable).toContainText(`${prefix}-policy-denied@example.com`);
      await expect(loginLogsTable).toContainText("Policy Denied");
      await expect(loginLogsTable).not.toContainText(`${literalNeedle}@example.com`);
    });
  } finally {
    await deleteLoginLogFixtures(prefix);
  }
});

test("instructors cannot access the admin login-log dashboard", async ({ page }, testInfo) => {
  await ensureRuntimeInstructorUser();

  await loginWithCredentials(page, RUNTIME_INSTRUCTOR_USERNAME, RUNTIME_INSTRUCTOR_PASSWORD);
  await expect(page.getByRole("link", { name: "Login Logs" })).toHaveCount(0);

  await page.goto(LOGIN_LOGS_PATH, { waitUntil: "networkidle" });

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await captureEvidence(page, testInfo, "task11-login-logs-denied");
});
