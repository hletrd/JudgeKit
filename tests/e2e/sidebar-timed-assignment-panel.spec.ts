import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import {
  assignmentProblems,
  assignments,
  enrollments,
  groups,
  problems,
  users,
} from "@/lib/db/schema";
import { expect, test } from "@playwright/test";
import { loginWithCredentials } from "./support/helpers";

const STUDENT_PASSWORD = "StudentPass123";
const ADMIN_USERNAME = "admin";

async function seedTimedAssignment(runtimeSuffix: string) {
  const adminUser = await db.query.users.findFirst({
    where: eq(users.username, ADMIN_USERNAME),
  });

  if (!adminUser) {
    throw new Error("Seeded admin user is unavailable for sidebar timer verification");
  }

  const now = Date.now();
  const studentId = nanoid();
  const groupId = nanoid();
  const assignmentId = nanoid();
  const problemId = nanoid();
  const username = `sidebar_student_${runtimeSuffix}`;
  const passwordHash = await hash(STUDENT_PASSWORD, 12);

  await db.insert(users).values({
    id: studentId,
    className: `Sidebar ${runtimeSuffix}`,
    email: `sidebar-student-${runtimeSuffix}@example.com`,
    isActive: true,
    mustChangePassword: false,
    name: `Sidebar Student ${runtimeSuffix}`,
    passwordHash,
    role: "student",
    updatedAt: new Date(now),
    username,
  });

  await db.insert(groups).values({
    id: groupId,
    description: "Sidebar timed assignment verification group",
    instructorId: adminUser.id,
    name: `Sidebar Group ${runtimeSuffix}`,
    updatedAt: new Date(now),
  });

  await db.insert(enrollments).values({ groupId, userId: studentId });

  await db.insert(assignments).values({
    id: assignmentId,
    description: "Sidebar timer verification assignment",
    examMode: "scheduled",
    groupId,
    startsAt: new Date(now - 10 * 60 * 1000),
    deadline: new Date(now + 50 * 60 * 1000),
    title: `Sidebar Contest ${runtimeSuffix}`,
    updatedAt: new Date(now),
  });

  await db.insert(problems).values({
    id: problemId,
    authorId: adminUser.id,
    description: "Sidebar timer verification problem",
    memoryLimitMb: 256,
    timeLimitMs: 2000,
    title: `Sidebar Problem ${runtimeSuffix}`,
    updatedAt: new Date(now),
    visibility: "private",
  });

  await db.insert(assignmentProblems).values({
    assignmentId,
    problemId,
    points: 100,
    sortOrder: 0,
  });

  return { assignmentId, groupId, problemId, studentId, username };
}

test("contest detail shows active scheduled assignment timers", async ({ page }, testInfo) => {
  test.slow();

  const runtimeSuffix = `${Date.now()}-${testInfo.workerIndex}`.replace(/[^a-zA-Z0-9]/g, "");
  const fixture = await seedTimedAssignment(runtimeSuffix);

  try {
    await loginWithCredentials(page, fixture.username, STUDENT_PASSWORD);
    await page.waitForURL(/\/dashboard(?:$|\/)/, { timeout: 15_000 });

    await page.goto(`/contests/${fixture.assignmentId}`, { waitUntil: "networkidle" });

    await expect(
      page.getByRole("heading", { name: `Sidebar Contest ${runtimeSuffix}` }).first()
    ).toBeVisible();
    await expect(page.getByText(/Time remaining|Deadline countdown/i).first()).toBeVisible();
    await expect(page.getByRole("timer").first()).toContainText(/00:4\d:|00:5\d:/);
  } finally {
    await db.delete(assignmentProblems).where(eq(assignmentProblems.assignmentId, fixture.assignmentId));
    await db.delete(assignments).where(eq(assignments.id, fixture.assignmentId));
    await db.delete(problems).where(eq(problems.id, fixture.problemId));
    await db.delete(enrollments).where(eq(enrollments.groupId, fixture.groupId));
    await db.delete(groups).where(eq(groups.id, fixture.groupId));
    await db.delete(users).where(eq(users.id, fixture.studentId));
  }
});
