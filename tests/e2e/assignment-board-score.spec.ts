import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { formatSubmissionIdPrefix } from "@/lib/submissions/id";
import { db } from "@/lib/db";
import {
  assignmentProblems,
  assignments,
  enrollments,
  groups,
  problems,
  submissions,
  users,
} from "@/lib/db/schema";
import { captureEvidence } from "./support/evidence";
import { expect, test } from "./fixtures";
import { RUNTIME_ADMIN_USERNAME } from "./support/runtime-admin";

async function seedAssignmentBoardScoreFixtures(runtimeSuffix: string) {
  const runtimeAdmin = await db.query.users.findFirst({
    where: eq(users.username, RUNTIME_ADMIN_USERNAME),
  });

  if (!runtimeAdmin) {
    throw new Error("Runtime admin user is unavailable for assignment board verification");
  }

  const studentId = nanoid();
  const groupId = nanoid();
  const assignmentId = nanoid();
  const firstProblemId = nanoid();
  const secondProblemId = nanoid();
  const firstAcceptedSubmissionId = nanoid();
  const firstLatestSubmissionId = nanoid();
  const secondLatestSubmissionId = nanoid();
  const now = Date.now();

  db.insert(users)
    .values({
      id: studentId,
      className: `Board ${runtimeSuffix}`,
      email: `assignment-board-${runtimeSuffix}@example.com`,
      isActive: true,
      mustChangePassword: false,
      name: `Assignment Board ${runtimeSuffix}`,
      role: "student",
      updatedAt: new Date(now),
      username: `assignment_board_${runtimeSuffix}`,
    })
    .run();

  db.insert(groups)
    .values({
      id: groupId,
      description: "Assignment board score verification group",
      instructorId: runtimeAdmin.id,
      name: `Assignment Board Group ${runtimeSuffix}`,
      updatedAt: new Date(now),
    })
    .run();

  db.insert(enrollments)
    .values({
      groupId,
      userId: studentId,
    })
    .run();

  db.insert(assignments)
    .values({
      id: assignmentId,
      description: "Verify assignment board score math for non-100-point problems.",
      groupId,
      title: `Assignment Board Score ${runtimeSuffix}`,
      updatedAt: new Date(now),
    })
    .run();

  db.insert(problems)
    .values([
      {
        id: firstProblemId,
        authorId: runtimeAdmin.id,
        description: "First non-100-point assignment problem",
        memoryLimitMb: 256,
        timeLimitMs: 2000,
        title: `Board Problem A ${runtimeSuffix}`,
        updatedAt: new Date(now),
        visibility: "private",
      },
      {
        id: secondProblemId,
        authorId: runtimeAdmin.id,
        description: "Second non-100-point assignment problem",
        memoryLimitMb: 256,
        timeLimitMs: 2000,
        title: `Board Problem B ${runtimeSuffix}`,
        updatedAt: new Date(now),
        visibility: "private",
      },
    ])
    .run();

  db.insert(assignmentProblems)
    .values([
      {
        assignmentId,
        problemId: firstProblemId,
        points: 50,
        sortOrder: 0,
      },
      {
        assignmentId,
        problemId: secondProblemId,
        points: 30,
        sortOrder: 1,
      },
    ])
    .run();

  db.insert(submissions)
    .values([
      {
        assignmentId,
        id: firstAcceptedSubmissionId,
        judgedAt: new Date(now - 3_000),
        language: "python",
        problemId: firstProblemId,
        score: 100,
        sourceCode: "print(1)\n",
        status: "accepted",
        submittedAt: new Date(now - 3_000),
        userId: studentId,
      },
      {
        assignmentId,
        id: firstLatestSubmissionId,
        judgedAt: new Date(now - 2_000),
        language: "python",
        problemId: firstProblemId,
        score: 0,
        sourceCode: "print(0)\n",
        status: "wrong_answer",
        submittedAt: new Date(now - 2_000),
        userId: studentId,
      },
      {
        assignmentId,
        id: secondLatestSubmissionId,
        judgedAt: new Date(now - 1_000),
        language: "python",
        problemId: secondProblemId,
        score: 50,
        sourceCode: "print(2)\n",
        status: "wrong_answer",
        submittedAt: new Date(now - 1_000),
        userId: studentId,
      },
    ])
    .run();

  return {
    assignmentId,
    firstAcceptedSubmissionId,
    firstLatestSubmissionId,
    firstProblemId,
    groupId,
    secondLatestSubmissionId,
    secondProblemId,
    studentId,
    studentName: `Assignment Board ${runtimeSuffix}`,
  };
}

test("assignment board renders earned points for non-100-point problems", async ({
  runtimeAdminPage: page,
  runtimeSuffix,
}, testInfo) => {
  test.slow();

  const fixtures = await seedAssignmentBoardScoreFixtures(runtimeSuffix.replace(/[^a-zA-Z0-9]/g, ""));

  await page.goto(
    `/dashboard/groups/${fixtures.groupId}/assignments/${fixtures.assignmentId}`,
    { waitUntil: "networkidle" }
  );

  const studentRow = page.getByRole("row", { name: new RegExp(fixtures.studentName) });
  await expect(studentRow).toBeVisible();
  await expect(page.getByTestId(`assignment-total-score-${fixtures.studentId}`)).toHaveText("65/80");
  await expect(page.getByTestId(`assignment-attempt-count-${fixtures.studentId}`)).toHaveText("3");
  await expect(page.getByTestId(`assignment-row-status-${fixtures.studentId}`)).toContainText(
    "Wrong Answer"
  );

  const firstProblemScore = page.getByTestId(
    `assignment-problem-score-${fixtures.studentId}-${fixtures.firstProblemId}`
  );
  await expect(firstProblemScore).toContainText("Best score: 50/50");
  await expect(firstProblemScore).toContainText("Attempts: 2");
  await expect(firstProblemScore).toContainText(
    formatSubmissionIdPrefix(fixtures.firstLatestSubmissionId)
  );

  const secondProblemScore = page.getByTestId(
    `assignment-problem-score-${fixtures.studentId}-${fixtures.secondProblemId}`
  );
  await expect(secondProblemScore).toContainText("Best score: 15/30");
  await expect(secondProblemScore).toContainText("Attempts: 1");
  await expect(secondProblemScore).toContainText(
    formatSubmissionIdPrefix(fixtures.secondLatestSubmissionId)
  );

  await captureEvidence(page, testInfo, "assignment-board-score");
});
