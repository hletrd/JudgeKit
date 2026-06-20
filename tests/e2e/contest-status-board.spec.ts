import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import {
  assignmentProblems,
  assignments,
  enrollments,
  examSessions,
  groups,
  problems,
  submissions,
  users,
} from "@/lib/db/schema";
import { captureEvidence } from "./support/evidence";
import { expect, test } from "./fixtures";

const LOCAL_ADMIN_USERNAME = "admin";
const LOCAL_ADMIN_INITIAL_PASSWORD = "admin123";
const LOCAL_ADMIN_UPDATED_PASSWORD = "AdminPass234";

async function loginAsLocalAdmin(page: import("@playwright/test").Page) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.locator("#username").fill(LOCAL_ADMIN_USERNAME);
  await page.locator("#password").fill(LOCAL_ADMIN_INITIAL_PASSWORD);
  await page.getByRole("button", { name: /sign in|로그인/i }).click();
  await page.waitForURL(/\/(dashboard|change-password)/, { timeout: 15_000 });

  if (page.url().includes("/change-password")) {
    await page.locator("#currentPassword").fill(LOCAL_ADMIN_INITIAL_PASSWORD);
    await page.locator("#newPassword").fill(LOCAL_ADMIN_UPDATED_PASSWORD);
    await page.locator("#confirmPassword").fill(LOCAL_ADMIN_UPDATED_PASSWORD);
    await page.getByRole("button", { name: /change password|비밀번호 변경/i }).click();
  }

  await page.waitForURL("**/dashboard", { timeout: 30_000 });
}

async function seedContestStatusFixtures(runtimeSuffix: string) {
  const adminUser = await db.query.users.findFirst({
    where: eq(users.username, LOCAL_ADMIN_USERNAME),
  });

  if (!adminUser) {
    throw new Error("Seeded admin user is unavailable for contest status verification");
  }

  const groupId = nanoid();
  const assignmentId = nanoid();
  const problemId = nanoid();
  const partialStudentId = nanoid();
  const starterStudentId = nanoid();
  const partialSubmissionId = nanoid();
  const now = Date.now();
  const sessionStart = new Date(now - 10 * 60 * 1000);
  const sessionDeadline = new Date(now + 50 * 60 * 1000);

  await db.insert(users).values([
    {
      id: partialStudentId,
      className: `Contest ${runtimeSuffix}`,
      email: `contest-partial-${runtimeSuffix}@example.com`,
      isActive: true,
      mustChangePassword: false,
      name: `Contest Partial ${runtimeSuffix}`,
      role: "student",
      updatedAt: new Date(now),
      username: `contest_partial_${runtimeSuffix}`,
    },
    {
      id: starterStudentId,
      className: `Contest ${runtimeSuffix}`,
      email: `contest-starter-${runtimeSuffix}@example.com`,
      isActive: true,
      mustChangePassword: false,
      name: `Contest Starter ${runtimeSuffix}`,
      role: "student",
      updatedAt: new Date(now),
      username: `contest_starter_${runtimeSuffix}`,
    },
  ]);

  await db.insert(groups).values({
    id: groupId,
    description: "Contest status board verification group",
    instructorId: adminUser.id,
    name: `Contest Status Group ${runtimeSuffix}`,
    updatedAt: new Date(now),
  });

  await db.insert(enrollments).values([
    { groupId, userId: partialStudentId },
    { groupId, userId: starterStudentId },
  ]);

  await db.insert(assignments).values({
    id: assignmentId,
    description: "Verify contest participant statuses reflect overall contest progress.",
    examDurationMinutes: 60,
    examMode: "windowed",
    groupId,
    title: `Contest Status ${runtimeSuffix}`,
    updatedAt: new Date(now),
  });

  await db.insert(problems).values({
    id: problemId,
    authorId: adminUser.id,
    description: "Contest problem used for participant status verification",
    memoryLimitMb: 256,
    timeLimitMs: 2000,
    title: `Contest Status Problem ${runtimeSuffix}`,
    updatedAt: new Date(now),
    visibility: "private",
  });

  await db.insert(assignmentProblems).values({
    assignmentId,
    problemId,
    points: 200,
    sortOrder: 0,
  });

  await db.insert(examSessions).values([
    {
      assignmentId,
      userId: partialStudentId,
      startedAt: sessionStart,
      personalDeadline: sessionDeadline,
    },
    {
      assignmentId,
      userId: starterStudentId,
      startedAt: sessionStart,
      personalDeadline: sessionDeadline,
    },
  ]);

  await db.insert(submissions).values({
    assignmentId,
    id: partialSubmissionId,
    judgedAt: new Date(now - 2 * 60 * 1000),
    language: "python",
    problemId,
    score: 50,
    sourceCode: "print(1)\n",
    status: "accepted",
    submittedAt: new Date(now - 2 * 60 * 1000),
    userId: partialStudentId,
  });

  return {
    assignmentId,
    groupId,
    partialStudentId,
    starterStudentId,
    partialStudentName: `Contest Partial ${runtimeSuffix}`,
    starterStudentName: `Contest Starter ${runtimeSuffix}`,
    problemId,
  };
}

test("contest submissions tab shows in-progress participant statuses instead of accepted/not-submitted", async ({
  page,
  runtimeSuffix,
}, testInfo) => {
  test.slow();

  const fixtures = await seedContestStatusFixtures(runtimeSuffix.replace(/[^a-zA-Z0-9]/g, ""));

  try {
    await loginAsLocalAdmin(page);
    await page.goto(`/contests/manage/${fixtures.assignmentId}`, {
      waitUntil: "networkidle",
    });

    await page.getByRole("tab", { name: /Submissions|제출/ }).click();
    await expect(page.getByTestId(`assignment-row-status-${fixtures.partialStudentId}`)).toContainText(
      /In progress|진행 중/
    );
    await expect(page.getByTestId(`assignment-row-status-${fixtures.starterStudentId}`)).toContainText(
      /In progress|진행 중/
    );
    await expect(page.getByTestId(`assignment-row-status-${fixtures.partialStudentId}`)).not.toContainText(
      /Accepted|정답/
    );
    await expect(page.getByTestId(`assignment-row-status-${fixtures.starterStudentId}`)).not.toContainText(
      /Not submitted|미제출/
    );

    await captureEvidence(page, testInfo, "contest-status-board");
  } finally {
    await db.delete(submissions).where(eq(submissions.assignmentId, fixtures.assignmentId));
    await db.delete(examSessions).where(eq(examSessions.assignmentId, fixtures.assignmentId));
    await db.delete(assignmentProblems).where(eq(assignmentProblems.assignmentId, fixtures.assignmentId));
    await db.delete(assignments).where(eq(assignments.id, fixtures.assignmentId));
    await db.delete(problems).where(eq(problems.id, fixtures.problemId));
    await db.delete(enrollments).where(eq(enrollments.groupId, fixtures.groupId));
    await db.delete(groups).where(eq(groups.id, fixtures.groupId));
    await db.delete(users).where(eq(users.id, fixtures.partialStudentId));
    await db.delete(users).where(eq(users.id, fixtures.starterStudentId));
  }
});
