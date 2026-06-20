import { hash } from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import {
  auditEvents,
  assignmentProblems,
  assignments,
  groups,
  problemGroupAccess,
  problems,
  submissions,
  users,
} from "@/lib/db/schema";
import type { Page } from "@playwright/test";
import { captureEvidence } from "./support/evidence";
import { expect, test } from "./fixtures";
import { loginWithCredentials } from "./support/helpers";
import { getPlaywrightBaseUrl, RUNTIME_ADMIN_USERNAME } from "./support/runtime-admin";

const RUNTIME_STUDENT_PASSWORD = process.env.E2E_GROUP_STUDENT_PASSWORD ?? "GroupStudentPass234";

async function waitForAuditEvent(action: string, resourceId: string) {
  await expect.poll(async () => {
    const event = await db.query.auditEvents.findFirst({
      where: and(
        eq(auditEvents.action, action),
        eq(auditEvents.resourceId, resourceId)
      ),
    });
    return Boolean(event);
  }).toBe(true);
}

async function expectAuditEventLabel(action: string, resourceId: string, resourceLabel: string) {
  await expect.poll(async () => {
    const event = await db.query.auditEvents.findFirst({
      where: and(
        eq(auditEvents.action, action),
        eq(auditEvents.resourceId, resourceId)
      ),
    });
    return event?.resourceLabel ?? null;
  }).toBe(resourceLabel);
}

async function createRuntimeStudent(runtimeSuffix: string) {
  const id = nanoid();
  const username = `group_student_${runtimeSuffix}`;
  const email = `${username}@example.com`;
  const passwordHash = await hash(RUNTIME_STUDENT_PASSWORD, 12);

  await db.insert(users)
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
    ;

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

  await db.insert(groups)
    .values({
      id: groupId,
      description: "Group assignment management verification group",
      instructorId: authorId,
      name: `Group Assignment ${runtimeSuffix}`,
      updatedAt: new Date(now),
    })
    ;

  await db.insert(problems)
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
    ;

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

  await adminPage.goto(`/groups/${fixtures.groupId}`, { waitUntil: "networkidle" });
  await adminPage.getByRole("combobox", { name: "Available users" }).click();
  await adminPage.getByRole("option", { name: `${student.name} (@${student.username})` }).click();
  await adminPage.getByRole("button", { name: "Add member" }).click();
  const membersTable = adminPage.locator("table").filter({ hasText: "Affiliation" }).first();
  await expect(membersTable).toContainText(student.name);
  await expect(membersTable).toContainText(`@${student.username}`);

  await waitForAuditEvent("group.member_added", student.id);

  await test.step("assignment edits and deletes clean stale problem access rows", async () => {
    await adminPage.getByRole("button", { name: "Create assignment" }).click();
    await adminPage.locator("#assignment-title-new").fill(cleanupAssignmentTitle);
    await adminPage.getByRole("button", { name: "Add problem" }).click();
    const createDialog = adminPage.getByRole("dialog", { name: "Create assignment" });
    await createDialog.locator('[role="combobox"]').last().click();
    await adminPage.getByRole("option", { name: fixtures.problemTitle, exact: true }).click();
    await adminPage.getByRole("button", { name: "Create" }).click();
    await adminPage.waitForURL(new RegExp(`/groups/${fixtures.groupId}/assignments/[^/]+$`));

    const cleanupAssignment = await db.query.assignments.findFirst({
      where: and(eq(assignments.groupId, fixtures.groupId), eq(assignments.title, cleanupAssignmentTitle)),
    });

    expect(cleanupAssignment).not.toBeNull();

    if (!cleanupAssignment) {
      throw new Error("Expected cleanup assignment to exist after creation");
    }

    await waitForAuditEvent("assignment.created", cleanupAssignment.id);

    const initialAccess = await db.query.problemGroupAccess.findFirst({
      where: and(
        eq(problemGroupAccess.groupId, fixtures.groupId),
        eq(problemGroupAccess.problemId, fixtures.problemId)
      ),
    });
    expect(initialAccess).not.toBeNull();

    await adminPage.goto(`/groups/${fixtures.groupId}`, { waitUntil: "networkidle" });
    const cleanupRow = adminPage.getByRole("row", { name: new RegExp(cleanupAssignmentTitle) });
    await cleanupRow.getByRole("button", { name: "Edit" }).click();
    const editDialog = adminPage.getByRole("dialog", { name: "Edit assignment" });
    await editDialog.locator('[role="combobox"]').last().click();
    await adminPage.getByRole("option", { name: fixtures.secondaryProblemTitle, exact: true }).click();
    await adminPage.getByRole("button", { name: "Save" }).click();

    await expect.poll(async () => {
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
      return `${Boolean(stalePrimaryAccess)}:${Boolean(activeSecondaryAccess)}`;
    }).toBe("false:true");

    await waitForAuditEvent("assignment.updated", cleanupAssignment.id);

    await cleanupRow.getByTestId(`assignment-delete-${cleanupAssignment?.id}`).click();
    await adminPage.getByTestId(`assignment-delete-confirm-${cleanupAssignment?.id}`).click();
    await expect.poll(async () => {
      const deletedAssignment = await db.query.assignments.findFirst({
        where: eq(assignments.id, cleanupAssignment.id),
      });
      const deletedSecondaryAccess = await db.query.problemGroupAccess.findFirst({
        where: and(
          eq(problemGroupAccess.groupId, fixtures.groupId),
          eq(problemGroupAccess.problemId, fixtures.secondaryProblemId)
        ),
      });
      return `${Boolean(deletedAssignment)}:${Boolean(deletedSecondaryAccess)}`;
    }).toBe("false:false");

    await expectAuditEventLabel("assignment.deleted", cleanupAssignment.id, cleanupAssignmentTitle);
  });

  await test.step("students cannot submit assignment problems without assignment context", async () => {
    const assignmentAId = nanoid();
    const assignmentBId = nanoid();
    await db.insert(assignments).values([
      {
        id: assignmentAId,
        groupId: fixtures.groupId,
        title: chooserAssignmentTitleA,
        updatedAt: new Date(),
      },
      {
        id: assignmentBId,
        groupId: fixtures.groupId,
        title: chooserAssignmentTitleB,
        updatedAt: new Date(),
      },
    ]);
    await db.insert(assignmentProblems).values([
      {
        id: nanoid(),
        assignmentId: assignmentAId,
        problemId: fixtures.problemId,
        points: 100,
        sortOrder: 0,
      },
      {
        id: nanoid(),
        assignmentId: assignmentBId,
        problemId: fixtures.problemId,
        points: 100,
        sortOrder: 0,
      },
    ]);

    const studentContext = await browser.newContext({
      baseURL: getPlaywrightBaseUrl(),
    });
    const studentPage = await studentContext.newPage();

    await loginWithCredentials(studentPage, student.username, RUNTIME_STUDENT_PASSWORD);
    await studentPage.goto(`/practice/problems/${fixtures.problemId}`, { waitUntil: "networkidle" });

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
    await adminPage.goto(`/groups/${fixtures.groupId}`, { waitUntil: "networkidle" });

    await adminPage.getByRole("combobox", { name: "Available users" }).click();
    await adminPage
      .getByRole("option", { name: `${student.name} (@${student.username})` })
      .click();
    await adminPage.getByRole("button", { name: "Add member" }).click();
    const membersTable = adminPage.locator("table").filter({ hasText: "Affiliation" }).first();
    await expect(membersTable).toContainText(student.name);
    await expect(membersTable).toContainText(`@${student.username}`);
    await expect(adminPage.getByText(student.name, { exact: true })).toBeVisible();
    await expect(adminPage.getByText(`@${student.username}`, { exact: true })).toBeVisible();

    await adminPage.getByRole("button", { name: "Create assignment" }).click();
    await adminPage.locator("#assignment-title-new").fill(initialAssignmentTitle);
    await adminPage.getByRole("button", { name: "Add problem" }).click();
    const createAssignmentDialog = adminPage.getByRole("dialog", { name: "Create assignment" });
    await createAssignmentDialog.locator('[role="combobox"]').last().click();
    await adminPage.getByRole("option", { name: fixtures.problemTitle, exact: true }).click();
    await adminPage.getByRole("button", { name: "Create" }).click();

    await adminPage.waitForURL(new RegExp(`/groups/${fixtures.groupId}/assignments/[^/]+$`));

    const createdAssignment = await db.query.assignments.findFirst({
      where: and(eq(assignments.groupId, fixtures.groupId), eq(assignments.title, initialAssignmentTitle)),
    });

    expect(createdAssignment).not.toBeNull();

    if (!createdAssignment) {
      throw new Error("Expected created assignment to exist after UI creation step");
    }

    await waitForAuditEvent("assignment.created", createdAssignment.id);

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
    await adminPage.goto(`/groups/${fixtures.groupId}`, { waitUntil: "networkidle" });

    const assignmentRow = adminPage.getByRole("row", { name: new RegExp(initialAssignmentTitle) });
    await assignmentRow.getByRole("button", { name: "Edit" }).click();
    await adminPage.locator(`#assignment-title-${createdAssignment.id}`).fill(updatedAssignmentTitle);
    await adminPage.getByRole("button", { name: "Save" }).click();

    await expect(adminPage.getByRole("row", { name: new RegExp(updatedAssignmentTitle) })).toBeVisible();

    await waitForAuditEvent("assignment.updated", createdAssignment.id);
  });

  await test.step("student opens the assignment detail page and creates an assignment-linked submission", async () => {
    const studentContext = await browser.newContext({
      baseURL: getPlaywrightBaseUrl(),
    });
    const studentPage = await studentContext.newPage();

    await loginWithCredentials(studentPage, student.username, RUNTIME_STUDENT_PASSWORD);
    await studentPage.goto(`/groups/${fixtures.groupId}`, { waitUntil: "networkidle" });
    await studentPage.getByRole("link", { name: updatedAssignmentTitle }).click();

    await expect(studentPage).toHaveURL(
      new RegExp(`/groups/${fixtures.groupId}/assignments/${createdAssignment.id}$`)
    );
    await expect(studentPage.getByRole("button", { name: "Open problem" })).toBeVisible();
    await studentPage.getByRole("button", { name: "Open problem" }).click();
    await expect(studentPage).toHaveURL(
      new RegExp(`/practice/problems/${fixtures.problemId}\\?assignmentId=${createdAssignment.id}`)
    );

    const createSubmissionResponse = await studentPage.evaluate(async ({ assignmentId, problemId }) => {
      const response = await fetch("/api/v1/submissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({
          assignmentId,
          problemId,
          language: "python",
          sourceCode: 'print("assignment flow")',
        }),
      });

      return {
        body: await response.json(),
        status: response.status,
      };
    }, { assignmentId: createdAssignment.id, problemId: fixtures.problemId });

    expect(createSubmissionResponse.status).toBe(201);

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

    const claimToken = `playwright-claim-${runtimeSuffix}`;
    const hiddenCompileOutput = "do-not-log-this-compiler-output";

    await db
      .update(submissions)
      .set({
        compileOutput: hiddenCompileOutput,
        judgeClaimToken: claimToken,
        judgeClaimedAt: new Date(),
        status: "accepted",
      })
      .where(eq(submissions.id, assignmentSubmission.id));

    await waitForAuditEvent("submission.created", assignmentSubmission.id);
    await db.insert(auditEvents).values([
      {
        actorRole: "system",
        action: "submission.status_updated",
        resourceType: "submission",
        resourceId: assignmentSubmission.id,
        resourceLabel: assignmentSubmission.id,
        summary: "System-generated event",
        details: JSON.stringify({ status: "judging" }),
      },
      {
        actorRole: "system",
        action: "submission.judged",
        resourceType: "submission",
        resourceId: assignmentSubmission.id,
        resourceLabel: assignmentSubmission.id,
        summary: "System-generated event",
        details: JSON.stringify({ status: "accepted" }),
      },
    ]);

    const finalizedSubmission = await db.query.submissions.findFirst({
      where: eq(submissions.id, assignmentSubmission.id),
    });
    expect(finalizedSubmission?.status).toBe("accepted");

    await waitForAuditEvent("submission.status_updated", assignmentSubmission.id);
    await waitForAuditEvent("submission.judged", assignmentSubmission.id);

    await adminPage.goto(`/dashboard/admin/audit-logs?search=${assignmentSubmission.id}`, {
      waitUntil: "networkidle",
    });
    const auditLogsTable = adminPage.locator("#main-content table:visible").first();
    await expect(auditLogsTable).toContainText("submission.judged");
    await expect(auditLogsTable).toContainText("System");
    await expect(auditLogsTable).toContainText("System-generated event");
    await expect(auditLogsTable).not.toContainText('print("assignment flow")');
    await expect(auditLogsTable).not.toContainText(hiddenCompileOutput);

    await captureEvidence(studentPage, testInfo, "group-assignment-student-flow");
    await studentContext.close();
  });

  await test.step("admin cannot remove the member or delete the assignment after submissions exist", async () => {
    await adminPage.goto(`/groups/${fixtures.groupId}`, { waitUntil: "networkidle" });

    await adminPage.getByTestId(`group-member-remove-${student.id}`).click();
    await adminPage.getByTestId(`group-member-remove-confirm-${student.id}`).click();
    await expect(
      adminPage.getByText(
        "This member cannot be removed because they already have assignment submissions in this group."
      )
    ).toBeVisible();
    await adminPage.getByRole("button", { name: "Cancel" }).click();

    const blockedAssignmentDelete = await adminPage.evaluate(async ({ assignmentId, groupId }) => {
      const response = await fetch(`/api/v1/groups/${groupId}/assignments/${assignmentId}`, {
        method: "DELETE",
        headers: {
          "X-Requested-With": "XMLHttpRequest",
        },
      });

      return {
        body: await response.json(),
        status: response.status,
      };
    }, { assignmentId: createdAssignment.id, groupId: fixtures.groupId });

    expect(blockedAssignmentDelete.status).toBe(409);
    expect(blockedAssignmentDelete.body.error).toBe("assignmentDeleteBlocked");
    await expect.poll(async () => {
      const assignment = await db.query.assignments.findFirst({
        where: eq(assignments.id, createdAssignment.id),
      });
      return Boolean(assignment);
    }).toBe(true);

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
    expect(blockedGroupDelete.body.error).toBe("groupDeleteBlocked");

    await captureEvidence(adminPage, testInfo, "group-assignment-management-blocks");
  });
});
