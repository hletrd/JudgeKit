import type { Page } from "@playwright/test";
import { hash } from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import {
  auditEvents,
  assignments,
  groups,
  problemGroupAccess,
  problems,
  submissions,
  users,
} from "@/lib/db/schema";
import { captureEvidence } from "./support/evidence";
import { expect, test } from "./fixtures";
import { getPlaywrightBaseUrl, RUNTIME_ADMIN_USERNAME } from "./support/runtime-admin";

const RUNTIME_STUDENT_PASSWORD = "GroupStudentPass234";
const PLAYWRIGHT_JUDGE_AUTH_TOKEN = process.env.JUDGE_AUTH_TOKEN ?? "playwright-local-token-for-smoke";

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
  const username = `group_student_${runtimeSuffix}`;
  const email = `${username}@example.com`;
  const passwordHash = await hash(RUNTIME_STUDENT_PASSWORD, 12);

  db.insert(users)
    .values({
      id,
      email,
      isActive: true,
      mustChangePassword: false,
      name: `Group Student ${runtimeSuffix}`,
      passwordHash,
      role: "student",
      updatedAt: new Date(),
      username,
    })
    .run();

  return {
    id,
    name: `Group Student ${runtimeSuffix}`,
    username,
  };
}

async function seedGroupAssignmentFixtures(authorId: string, runtimeSuffix: string) {
  const groupId = nanoid();
  const problemId = nanoid();
  const secondaryProblemId = nanoid();
  const now = Date.now();

  db.insert(groups)
    .values({
      id: groupId,
      description: "Group assignment management verification group",
      instructorId: authorId,
      name: `Group Assignment ${runtimeSuffix}`,
      updatedAt: new Date(now),
    })
    .run();

  db.insert(problems)
    .values([
      {
        id: problemId,
        authorId,
        description: "Runtime assignment management verification problem",
        memoryLimitMb: 256,
        timeLimitMs: 2000,
        title: `Group Problem ${runtimeSuffix}`,
        updatedAt: new Date(now),
        visibility: "private",
      },
      {
        id: secondaryProblemId,
        authorId,
        description: "Secondary runtime assignment management verification problem",
        memoryLimitMb: 256,
        timeLimitMs: 2000,
        title: `Group Problem Secondary ${runtimeSuffix}`,
        updatedAt: new Date(now),
        visibility: "private",
      },
    ])
    .run();

  return {
    groupId,
    problemId,
    problemTitle: `Group Problem ${runtimeSuffix}`,
    secondaryProblemId,
    secondaryProblemTitle: `Group Problem Secondary ${runtimeSuffix}`,
  };
}

test("group assignment invariants keep access rows clean and require assignment context", async ({
  browser,
  runtimeAdminPage: adminPage,
  runtimeSuffix,
}, testInfo) => {
  test.slow();

  const normalizedSuffix = `${runtimeSuffix.replace(/[^a-zA-Z0-9]/g, "")}-invariants`;
  const runtimeAdmin = await db.query.users.findFirst({
    where: eq(users.username, RUNTIME_ADMIN_USERNAME),
  });

  if (!runtimeAdmin) {
    throw new Error("Runtime admin user is unavailable for group assignment invariant verification");
  }

  const student = await createRuntimeStudent(normalizedSuffix);
  const fixtures = await seedGroupAssignmentFixtures(runtimeAdmin.id, normalizedSuffix);
  const cleanupAssignmentTitle = `Cleanup Assignment ${normalizedSuffix}`;
  const chooserAssignmentTitleA = `Chooser Assignment A ${normalizedSuffix}`;
  const chooserAssignmentTitleB = `Chooser Assignment B ${normalizedSuffix}`;

  await adminPage.goto(`/dashboard/groups/${fixtures.groupId}`, { waitUntil: "networkidle" });
  await adminPage.getByRole("combobox", { name: "Available students" }).click();
  await adminPage.getByRole("option", { name: `${student.name} (@${student.username})` }).click();
  await adminPage.getByRole("button", { name: "Add member" }).click();
  await expect(adminPage.getByText("Group member added successfully")).toBeVisible();

  const memberAddedAudit = await db.query.auditEvents.findFirst({
    where: and(
      eq(auditEvents.action, "group.member_added"),
      eq(auditEvents.resourceId, student.id)
    ),
  });
  expect(memberAddedAudit).not.toBeUndefined();

  await test.step("assignment edits and deletes clean stale problem access rows", async () => {
    await adminPage.getByRole("button", { name: "Create assignment" }).click();
    await adminPage.locator("#assignment-title-new").fill(cleanupAssignmentTitle);
    await adminPage.getByRole("button", { name: "Add problem" }).click();
    const createDialog = adminPage.getByRole("dialog", { name: "Create assignment" });
    await createDialog.locator('[role="combobox"]').first().click();
    await adminPage.getByRole("option", { name: fixtures.problemTitle, exact: true }).click();
    await adminPage.getByRole("button", { name: "Create" }).click();
    await adminPage.waitForURL(new RegExp(`/dashboard/groups/${fixtures.groupId}/assignments/[^/]+$`));

    const cleanupAssignment = await db.query.assignments.findFirst({
      where: and(eq(assignments.groupId, fixtures.groupId), eq(assignments.title, cleanupAssignmentTitle)),
    });

    expect(cleanupAssignment).not.toBeNull();

    if (!cleanupAssignment) {
      throw new Error("Expected cleanup assignment to exist after creation");
    }

    const assignmentCreatedAudit = await db.query.auditEvents.findFirst({
      where: and(
        eq(auditEvents.action, "assignment.created"),
        eq(auditEvents.resourceId, cleanupAssignment.id)
      ),
    });
    expect(assignmentCreatedAudit).not.toBeUndefined();

    const initialAccess = await db.query.problemGroupAccess.findFirst({
      where: and(
        eq(problemGroupAccess.groupId, fixtures.groupId),
        eq(problemGroupAccess.problemId, fixtures.problemId)
      ),
    });
    expect(initialAccess).not.toBeNull();

    await adminPage.goto(`/dashboard/groups/${fixtures.groupId}`, { waitUntil: "networkidle" });
    const cleanupRow = adminPage.getByRole("row", { name: new RegExp(cleanupAssignmentTitle) });
    await cleanupRow.getByRole("button", { name: "Edit" }).click();
    const editDialog = adminPage.getByRole("dialog", { name: "Edit assignment" });
    await editDialog.locator('[role="combobox"]').first().click();
    await adminPage.getByRole("option", { name: fixtures.secondaryProblemTitle, exact: true }).click();
    await adminPage.getByRole("button", { name: "Save" }).click();
    await expect(adminPage.getByText("Assignment updated successfully")).toBeVisible();

    const stalePrimaryAccess = await db.query.problemGroupAccess.findFirst({
      where: and(
        eq(problemGroupAccess.groupId, fixtures.groupId),
        eq(problemGroupAccess.problemId, fixtures.problemId)
      ),
    });
    const activeSecondaryAccess = await db.query.problemGroupAccess.findFirst({
      where: and(
        eq(problemGroupAccess.groupId, fixtures.groupId),
        eq(problemGroupAccess.problemId, fixtures.secondaryProblemId)
      ),
    });

    expect(stalePrimaryAccess).toBeUndefined();
    expect(activeSecondaryAccess).not.toBeNull();

    const assignmentUpdatedAudit = await db.query.auditEvents.findFirst({
      where: and(
        eq(auditEvents.action, "assignment.updated"),
        eq(auditEvents.resourceId, cleanupAssignment.id)
      ),
    });
    expect(assignmentUpdatedAudit).not.toBeUndefined();

    await cleanupRow.getByTestId(`assignment-delete-${cleanupAssignment?.id}`).click();
    await adminPage.getByTestId(`assignment-delete-confirm-${cleanupAssignment?.id}`).click();
    await expect(adminPage.getByText("Assignment deleted successfully")).toBeVisible();

    const deletedSecondaryAccess = await db.query.problemGroupAccess.findFirst({
      where: and(
        eq(problemGroupAccess.groupId, fixtures.groupId),
        eq(problemGroupAccess.problemId, fixtures.secondaryProblemId)
      ),
    });

    expect(deletedSecondaryAccess).toBeUndefined();

    const assignmentDeletedAudit = await db.query.auditEvents.findFirst({
      where: and(
        eq(auditEvents.action, "assignment.deleted"),
        eq(auditEvents.resourceId, cleanupAssignment.id)
      ),
    });
    expect(assignmentDeletedAudit?.resourceLabel).toBe(cleanupAssignmentTitle);
  });

  await test.step("students see an assignment chooser and API rejects missing assignment context", async () => {
    for (const title of [chooserAssignmentTitleA, chooserAssignmentTitleB]) {
      await adminPage.getByRole("button", { name: "Create assignment" }).click();
      await adminPage.locator("#assignment-title-new").fill(title);
      await adminPage.getByRole("button", { name: "Add problem" }).click();
      const createDialog = adminPage.getByRole("dialog", { name: "Create assignment" });
      await createDialog.locator('[role="combobox"]').first().click();
      await adminPage.getByRole("option", { name: fixtures.problemTitle, exact: true }).click();
      await adminPage.getByRole("button", { name: "Create" }).click();
      await adminPage.goto(`/dashboard/groups/${fixtures.groupId}`, { waitUntil: "networkidle" });
    }

    const studentContext = await browser.newContext({
      baseURL: getPlaywrightBaseUrl(),
    });
    const studentPage = await studentContext.newPage();

    await loginWithCredentials(studentPage, student.username, RUNTIME_STUDENT_PASSWORD);
    await studentPage.goto(`/dashboard/problems/${fixtures.problemId}`, { waitUntil: "networkidle" });

    await expect(studentPage).toHaveURL(new RegExp(`/dashboard/problems/${fixtures.problemId}$`));
    await expect(studentPage.getByText("Choose an assignment context")).toBeVisible();
    await expect(
      studentPage.getByRole("button", { name: new RegExp(chooserAssignmentTitleA) })
    ).toBeVisible();
    await expect(
      studentPage.getByRole("button", { name: new RegExp(chooserAssignmentTitleB) })
    ).toBeVisible();
    await expect(studentPage.getByRole("button", { name: "Submit" })).toHaveCount(0);

    const missingContextResponse = await studentPage.evaluate(async ({ problemId }) => {
      const response = await fetch("/api/v1/submissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({
          problemId,
          language: "python",
          sourceCode: 'print("missing context")',
        }),
      });

      return {
        body: await response.json(),
        status: response.status,
      };
    }, { problemId: fixtures.problemId });

    expect(missingContextResponse.status).toBe(409);
    expect(missingContextResponse.body).toEqual({
      error: "assignmentContextRequired",
    });
    await captureEvidence(studentPage, testInfo, "group-assignment-invariants-chooser");
    await studentContext.close();
  });
});

test("group assignment management supports member add, assignment CRUD, and student assignment submissions", async ({
  browser,
  runtimeAdminPage: adminPage,
  runtimeSuffix,
}, testInfo) => {
  test.slow();

  const normalizedSuffix = runtimeSuffix.replace(/[^a-zA-Z0-9]/g, "");
  const runtimeAdmin = await db.query.users.findFirst({
    where: eq(users.username, RUNTIME_ADMIN_USERNAME),
  });

  if (!runtimeAdmin) {
    throw new Error("Runtime admin user is unavailable for group assignment verification");
  }

  const student = await createRuntimeStudent(normalizedSuffix);
  const fixtures = await seedGroupAssignmentFixtures(runtimeAdmin.id, normalizedSuffix);
  const initialAssignmentTitle = `Managed Assignment ${normalizedSuffix}`;
  const updatedAssignmentTitle = `Managed Assignment Updated ${normalizedSuffix}`;

  await test.step("admin adds a member and creates an assignment from the group detail page", async () => {
    await adminPage.goto(`/dashboard/groups/${fixtures.groupId}`, { waitUntil: "networkidle" });

    await adminPage.getByRole("combobox", { name: "Available students" }).click();
    await adminPage
      .getByRole("option", { name: `${student.name} (@${student.username})` })
      .click();
    await adminPage.getByRole("button", { name: "Add member" }).click();
    await expect(adminPage.getByText("Group member added successfully")).toBeVisible();
    await expect(adminPage.getByText(student.name, { exact: true })).toBeVisible();
    await expect(adminPage.getByText(`@${student.username}`, { exact: true })).toBeVisible();

    await adminPage.getByRole("button", { name: "Create assignment" }).click();
    await adminPage.locator("#assignment-title-new").fill(initialAssignmentTitle);
    await adminPage.getByRole("button", { name: "Add problem" }).click();
    const createAssignmentDialog = adminPage.getByRole("dialog", { name: "Create assignment" });
    await createAssignmentDialog.locator('[role="combobox"]').first().click();
    await adminPage.getByRole("option", { name: fixtures.problemTitle, exact: true }).click();
    await adminPage.getByRole("button", { name: "Create" }).click();

    await adminPage.waitForURL(new RegExp(`/dashboard/groups/${fixtures.groupId}/assignments/[^/]+$`));

    const createdAssignment = await db.query.assignments.findFirst({
      where: and(eq(assignments.groupId, fixtures.groupId), eq(assignments.title, initialAssignmentTitle)),
    });

    expect(createdAssignment).not.toBeNull();

    if (!createdAssignment) {
      throw new Error("Expected created assignment to exist after UI creation step");
    }

    const assignmentCreatedAudit = await db.query.auditEvents.findFirst({
      where: and(
        eq(auditEvents.action, "assignment.created"),
        eq(auditEvents.resourceId, createdAssignment.id)
      ),
    });
    expect(assignmentCreatedAudit).not.toBeUndefined();

    const groupAccess = await db.query.problemGroupAccess.findFirst({
      where: and(
        eq(problemGroupAccess.groupId, fixtures.groupId),
        eq(problemGroupAccess.problemId, fixtures.problemId)
      ),
    });

    expect(groupAccess).not.toBeNull();
  });

  const createdAssignment = await db.query.assignments.findFirst({
    where: and(eq(assignments.groupId, fixtures.groupId), eq(assignments.title, initialAssignmentTitle)),
  });

  if (!createdAssignment) {
    throw new Error("Expected created assignment to exist after UI creation step");
  }

  await test.step("admin can edit the assignment title from the group detail page", async () => {
    await adminPage.goto(`/dashboard/groups/${fixtures.groupId}`, { waitUntil: "networkidle" });

    const assignmentRow = adminPage.getByRole("row", { name: new RegExp(initialAssignmentTitle) });
    await assignmentRow.getByRole("button", { name: "Edit" }).click();
    await adminPage.locator(`#assignment-title-${createdAssignment.id}`).fill(updatedAssignmentTitle);
    await adminPage.getByRole("button", { name: "Save" }).click();

    await expect(adminPage.getByText("Assignment updated successfully")).toBeVisible();
    await expect(adminPage.getByRole("row", { name: new RegExp(updatedAssignmentTitle) })).toBeVisible();

    const assignmentUpdatedAudit = await db.query.auditEvents.findFirst({
      where: and(
        eq(auditEvents.action, "assignment.updated"),
        eq(auditEvents.resourceId, createdAssignment.id)
      ),
    });
    expect(assignmentUpdatedAudit).not.toBeUndefined();
  });

  await test.step("student opens the assignment detail page and creates an assignment-linked submission", async () => {
    const studentContext = await browser.newContext({
      baseURL: getPlaywrightBaseUrl(),
    });
    const studentPage = await studentContext.newPage();

    await loginWithCredentials(studentPage, student.username, RUNTIME_STUDENT_PASSWORD);
    await studentPage.goto(`/dashboard/problems/${fixtures.problemId}`, { waitUntil: "networkidle" });
    await expect(studentPage).toHaveURL(
      new RegExp(`/dashboard/problems/${fixtures.problemId}\\?assignmentId=${createdAssignment.id}`)
    );

    await studentPage.goto(`/dashboard/groups/${fixtures.groupId}`, { waitUntil: "networkidle" });
    await studentPage.getByRole("link", { name: updatedAssignmentTitle }).click();

    await expect(studentPage.getByRole("heading", { name: updatedAssignmentTitle })).toBeVisible();
    await studentPage.getByRole("button", { name: "Open problem" }).click();
    await expect(studentPage).toHaveURL(
      new RegExp(`/dashboard/problems/${fixtures.problemId}\\?assignmentId=${createdAssignment.id}`)
    );

    const editor = studentPage.locator('[contenteditable="true"]').first();
    await editor.click();
    await studentPage.keyboard.type('print("assignment flow")');
    await studentPage.getByRole("button", { name: "Submit" }).click();
    await studentPage.getByRole("button", { name: "Send to Judge" }).click();

    await studentPage.waitForURL(/\/dashboard\/submissions\//, { timeout: 15_000 });

    const assignmentSubmission = await db.query.submissions.findFirst({
      where: and(
        eq(submissions.userId, student.id),
        eq(submissions.problemId, fixtures.problemId),
        eq(submissions.assignmentId, createdAssignment.id)
      ),
    });

    expect(assignmentSubmission).not.toBeNull();

    if (!assignmentSubmission) {
      throw new Error("Expected assignment-linked submission to exist after student submission flow");
    }

    const submissionCreatedAudit = await db.query.auditEvents.findFirst({
      where: and(
        eq(auditEvents.action, "submission.created"),
        eq(auditEvents.resourceId, assignmentSubmission.id)
      ),
    });

    expect(submissionCreatedAudit).not.toBeUndefined();

    const judgingResponse = await fetch(`${getPlaywrightBaseUrl()}/api/v1/judge/poll`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PLAYWRIGHT_JUDGE_AUTH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        submissionId: assignmentSubmission.id,
        status: "judging",
      }),
    });

    expect(judgingResponse.status).toBe(200);

    const hiddenCompileOutput = "do-not-log-this-compiler-output";

    const judgedResponse = await fetch(`${getPlaywrightBaseUrl()}/api/v1/judge/poll`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PLAYWRIGHT_JUDGE_AUTH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        compileOutput: hiddenCompileOutput,
        submissionId: assignmentSubmission.id,
        status: "accepted",
        results: [],
      }),
    });

    expect(judgedResponse.status).toBe(200);

    const finalizedSubmission = await db.query.submissions.findFirst({
      where: eq(submissions.id, assignmentSubmission.id),
    });
    expect(finalizedSubmission?.status).toBe("accepted");

    const inProgressAudit = await db.query.auditEvents.findFirst({
      where: and(
        eq(auditEvents.action, "submission.status_updated"),
        eq(auditEvents.resourceId, assignmentSubmission.id)
      ),
    });
    const judgedAudit = await db.query.auditEvents.findFirst({
      where: and(
        eq(auditEvents.action, "submission.judged"),
        eq(auditEvents.resourceId, assignmentSubmission.id)
      ),
    });

    expect(inProgressAudit).not.toBeUndefined();
    expect(judgedAudit).not.toBeUndefined();

    await adminPage.goto(`/dashboard/admin/audit-logs?search=${assignmentSubmission.id}`, {
      waitUntil: "networkidle",
    });
    const auditLogsTable = adminPage.locator("#dashboard-main-content table:visible").first();
    await expect(auditLogsTable).toContainText("submission.judged");
    await expect(auditLogsTable).toContainText("System");
    await expect(auditLogsTable).toContainText("System-generated event");
    await expect(auditLogsTable).not.toContainText('print("assignment flow")');
    await expect(auditLogsTable).not.toContainText(hiddenCompileOutput);

    await captureEvidence(studentPage, testInfo, "group-assignment-student-flow");
    await studentContext.close();
  });

  await test.step("admin cannot remove the member or delete the assignment after submissions exist", async () => {
    await adminPage.goto(`/dashboard/groups/${fixtures.groupId}`, { waitUntil: "networkidle" });

    await adminPage.getByTestId(`group-member-remove-${student.id}`).click();
    await adminPage.getByTestId(`group-member-remove-confirm-${student.id}`).click();
    await expect(
      adminPage.getByText(
        "This member cannot be removed because they already have assignment submissions in this group."
      )
    ).toBeVisible();
    await adminPage.getByRole("button", { name: "Cancel" }).click();

    await adminPage.getByTestId(`assignment-delete-${createdAssignment.id}`).click();
    await adminPage.getByTestId(`assignment-delete-confirm-${createdAssignment.id}`).click();
    await expect(
      adminPage.getByText(
        "This assignment cannot be deleted because it already has 1 submission(s)."
      )
    ).toBeVisible();

    const blockedGroupDelete = await adminPage.evaluate(async (groupId) => {
      const response = await fetch(`/api/v1/groups/${groupId}`, {
        method: "DELETE",
        headers: {
          "X-Requested-With": "XMLHttpRequest",
        },
      });

      return {
        body: await response.json(),
        status: response.status,
      };
    }, fixtures.groupId);

    expect(blockedGroupDelete.status).toBe(409);
    expect(blockedGroupDelete.body).toEqual({
      details: {
        assignmentSubmissionCount: 1,
      },
      error: "groupDeleteBlocked",
    });

    await captureEvidence(adminPage, testInfo, "group-assignment-management-blocks");
  });
});
