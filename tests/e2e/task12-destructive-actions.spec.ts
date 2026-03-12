import type { Page } from "@playwright/test";
import { hash } from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import {
  auditEvents,
  assignmentProblems,
  assignments,
  groups,
  problems,
  submissions,
  users,
} from "@/lib/db/schema";
import { captureEvidence } from "./support/evidence";
import { expect, test } from "./fixtures";
import { getPlaywrightBaseUrl, RUNTIME_ADMIN_USERNAME } from "./support/runtime-admin";

const RUNTIME_STUDENT_PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? "StudentPass234";

async function loginWithCredentials(page: Page, username: string, password: string) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(dashboard|change-password)(?:$|\?)/, { timeout: 15_000 });

  if (page.url().includes("/change-password")) {
    throw new Error(`Unexpected forced password change for ${username}`);
  }
}

async function createRuntimeStudent(runtimeSuffix: string) {
  const id = nanoid();
  const username = `task12_student_${runtimeSuffix}`;
  const email = `${username}@example.com`;
  const passwordHash = await hash(RUNTIME_STUDENT_PASSWORD, 12);

  db.insert(users)
    .values({
      id,
      email,
      isActive: true,
      mustChangePassword: false,
      name: `Task 12 Student ${runtimeSuffix}`,
      passwordHash,
      role: "student",
      updatedAt: new Date(),
      username,
    })
    .run();

  return { id, username };
}

async function seedProblemDeleteFixtures(authorId: string, submissionUserId: string, runtimeSuffix: string) {
  const blockedProblemId = nanoid();
  const safeProblemId = nanoid();
  const groupId = nanoid();
  const assignmentId = nanoid();
  const blockedProblemTitle = `Task 12 Blocked Problem ${runtimeSuffix}`;
  const safeProblemTitle = `Task 12 Safe Problem ${runtimeSuffix}`;

  db.insert(problems)
    .values([
      {
        id: blockedProblemId,
        authorId,
        description: "Blocked delete verification problem",
        memoryLimitMb: 256,
        timeLimitMs: 2000,
        title: blockedProblemTitle,
        updatedAt: new Date(),
        visibility: "private",
      },
      {
        id: safeProblemId,
        authorId,
        description: "Safe delete verification problem",
        memoryLimitMb: 256,
        timeLimitMs: 2000,
        title: safeProblemTitle,
        updatedAt: new Date(),
        visibility: "private",
      },
    ])
    .run();

  db.insert(groups)
    .values({
      id: groupId,
      description: "Task 12 delete guard group",
      instructorId: authorId,
      name: `Task 12 Group ${runtimeSuffix}`,
      updatedAt: new Date(),
    })
    .run();

  db.insert(assignments)
    .values({
      id: assignmentId,
      description: "Task 12 delete guard assignment",
      groupId,
      title: `Task 12 Assignment ${runtimeSuffix}`,
      updatedAt: new Date(),
    })
    .run();

  db.insert(assignmentProblems)
    .values({
      assignmentId,
      problemId: blockedProblemId,
      points: 100,
      sortOrder: 0,
    })
    .run();

  db.insert(submissions)
    .values({
      assignmentId,
      id: nanoid(),
      language: "python",
      problemId: blockedProblemId,
      score: 100,
      sourceCode: "print(sum(map(int, input().split())))\n",
      status: "accepted",
      userId: submissionUserId,
    })
    .run();

  return { blockedProblemId, blockedProblemTitle, safeProblemId, safeProblemTitle };
}

test("task 12 destructive flows revoke user access and guard problem deletes", async ({
  browser,
  runtimeAdminPage: page,
  runtimeSuffix,
}, testInfo) => {
  test.slow();

  const runtimeAdmin = await db.query.users.findFirst({
    where: eq(users.username, RUNTIME_ADMIN_USERNAME),
  });
  const superAdmin = await db.query.users.findFirst({
    where: eq(users.role, "super_admin"),
  });

  if (!runtimeAdmin) {
    throw new Error("Runtime admin user is unavailable for Task 12 verification");
  }

  if (!superAdmin) {
    throw new Error("A super admin user is required for Task 12 UI protection verification");
  }

  const student = await createRuntimeStudent(runtimeSuffix.replace(/[^a-zA-Z0-9]/g, ""));
  const { blockedProblemId, safeProblemId, safeProblemTitle } = await seedProblemDeleteFixtures(
    runtimeAdmin.id,
    student.id,
    runtimeSuffix.replace(/[^a-zA-Z0-9]/g, "")
  );

  const studentContext = await browser.newContext({
    baseURL: getPlaywrightBaseUrl(),
    extraHTTPHeaders: {
      "x-forwarded-for": `198.51.100.${((testInfo.retry + 20) % 200) + 1}`,
    },
  });
  const studentPage = await studentContext.newPage();

  await loginWithCredentials(studentPage, student.username, RUNTIME_STUDENT_PASSWORD);
  await studentPage.goto("/dashboard/problems", { waitUntil: "networkidle" });
  await expect(studentPage).toHaveURL(/\/dashboard\/problems$/);

  await test.step("admin users UI hides destructive toggles for self and super admin rows", async () => {
    await page.goto("/dashboard/admin/users", { waitUntil: "networkidle" });

    await expect(page.getByTestId(`user-access-toggle-${runtimeAdmin.id}`)).toHaveCount(0);
    await expect(page.getByTestId(`user-access-toggle-${superAdmin.id}`)).toHaveCount(0);
  });

  await test.step("admin deactivates a user and the next protected request is revoked", async () => {
    await page.goto("/dashboard/admin/users", { waitUntil: "networkidle" });

    const toggleTrigger = page.getByTestId(`user-access-toggle-${student.id}`);
    await expect(toggleTrigger).toBeVisible();
    await toggleTrigger.click();
    await expect(page.getByTestId(`user-access-toggle-confirm-${student.id}`)).toBeVisible();
    await page.getByTestId(`user-access-toggle-confirm-${student.id}`).click();

    await expect(page.getByText("User access deactivated successfully")).toBeVisible();
    await expect(page.getByTestId(`user-access-toggle-${student.id}`)).toContainText("Restore access");
    await captureEvidence(page, testInfo, "task12-user-deactivated");

    await studentPage.goto("/dashboard/problems", { waitUntil: "networkidle" });
    await expect(studentPage).toHaveURL(/\/login\?callbackUrl=%2Fdashboard%2Fproblems$/);
    await expect(studentPage.getByRole("button", { name: "Sign in" })).toBeVisible();

    const accessDeactivatedAudit = await db.query.auditEvents.findFirst({
      where: and(
        eq(auditEvents.action, "user.access_deactivated"),
        eq(auditEvents.resourceId, student.id)
      ),
    });
    expect(accessDeactivatedAudit).not.toBeUndefined();

    const protectedApiResult = await studentPage.evaluate(async () => {
      const response = await fetch("/api/v1/problems");
      return {
        body: await response.json(),
        status: response.status,
      };
    });

    expect(protectedApiResult.status).toBe(401);
    expect(protectedApiResult.body.error).toBe("Unauthorized");
  });

  await test.step("admin can restore the deactivated user", async () => {
    await page.getByTestId(`user-access-toggle-${student.id}`).click();
    await expect(page.getByTestId(`user-access-toggle-confirm-${student.id}`)).toBeVisible();
    await page.getByTestId(`user-access-toggle-confirm-${student.id}`).click();

    await expect(page.getByText("User access restored successfully")).toBeVisible();
    await expect(page.getByTestId(`user-access-toggle-${student.id}`)).toContainText("Deactivate access");

    await loginWithCredentials(studentPage, student.username, RUNTIME_STUDENT_PASSWORD);
    await studentPage.goto("/dashboard/problems", { waitUntil: "networkidle" });
    await expect(studentPage).toHaveURL(/\/dashboard\/problems$/);

    const accessRestoredAudit = await db.query.auditEvents.findFirst({
      where: and(
        eq(auditEvents.action, "user.access_restored"),
        eq(auditEvents.resourceId, student.id)
      ),
    });
    expect(accessRestoredAudit).not.toBeUndefined();
  });

  await test.step("problem delete stays blocked when submissions and assignment links exist", async () => {
    await page.goto(`/dashboard/problems/${blockedProblemId}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId(`problem-delete-${blockedProblemId}`)).toBeVisible();

    const blockedDeleteResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/v1/problems/${blockedProblemId}`) &&
        response.request().method() === "DELETE"
    );

    await page.getByTestId(`problem-delete-${blockedProblemId}`).click();
    await expect(page.getByRole("dialog", { name: "Delete this problem permanently?" })).toBeVisible();
    await page.getByTestId(`problem-delete-confirm-${blockedProblemId}`).click();

    const response = await blockedDeleteResponse;
    const payload = await response.json();

    expect(response.status()).toBe(409);
    expect(payload).toEqual({
      details: {
        assignmentLinkCount: 1,
        submissionCount: 1,
      },
      error: "problemDeleteBlocked",
    });

    await expect(
      page.getByText(
        "This problem cannot be deleted because it still has 1 submission(s) and 1 assignment link(s)."
      )
    ).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/dashboard/problems/${blockedProblemId}$`));
    await captureEvidence(page, testInfo, "task12-problem-delete-blocked");

    await page.goto(`/dashboard/problems/${blockedProblemId}/edit`, { waitUntil: "networkidle" });
    await expect(page.getByTestId(`problem-delete-${blockedProblemId}`)).toBeVisible();
  });

  await test.step("safe draft problems can still be deleted from the edit surface", async () => {
    await page.goto(`/dashboard/problems/${safeProblemId}/edit`, { waitUntil: "networkidle" });
    await expect(page.getByTestId(`problem-delete-${safeProblemId}`)).toBeVisible();

    const safeDeleteResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/v1/problems/${safeProblemId}`) &&
        response.request().method() === "DELETE"
    );

    await page.getByTestId(`problem-delete-${safeProblemId}`).click();
    await page.getByTestId(`problem-delete-confirm-${safeProblemId}`).click();

    const response = await safeDeleteResponse;
    expect(response.status()).toBe(200);
    await expect(page).toHaveURL(/\/dashboard\/problems$/);
    await expect(page.getByRole("link", { name: safeProblemTitle, exact: true })).toHaveCount(0);

    const deletedProblemResult = await page.evaluate(async (problemId) => {
      const getResponse = await fetch(`/api/v1/problems/${problemId}`);
      return {
        body: await getResponse.json(),
        status: getResponse.status,
      };
    }, safeProblemId);

    expect(deletedProblemResult.status).toBe(404);

    const problemDeletedAudit = await db.query.auditEvents.findFirst({
      where: and(
        eq(auditEvents.action, "problem.deleted"),
        eq(auditEvents.resourceId, safeProblemId)
      ),
    });
    expect(problemDeletedAudit?.resourceLabel).toBe(safeProblemTitle);

    await captureEvidence(page, testInfo, "task12-problem-delete-safe");
  });

  await studentContext.close();
});
