import { db } from "@/lib/db";
import { assignments, examSessions, users } from "@/lib/db/schema";
import { and, eq, asc, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDbNowUncached } from "@/lib/db-time";

export type ExamSession = {
  id: string;
  assignmentId: string;
  userId: string;
  startedAt: Date;
  personalDeadline: Date;
};

export type ExamSessionWithUser = ExamSession & {
  username: string;
  name: string;
  className: string | null;
};

export async function startExamSession(
  assignmentId: string,
  userId: string,
  ipAddress?: string | null
): Promise<ExamSession> {
  // Fetch assignment metadata and DB time outside the transaction.
  // Only the exam session existence check + insert needs transaction isolation.
  const assignment = await db.query.assignments.findFirst({
    where: eq(assignments.id, assignmentId),
    columns: {
      id: true,
      examMode: true,
      examDurationMinutes: true,
      startsAt: true,
      deadline: true,
    },
  });

  if (!assignment) {
    throw new Error("assignmentNotFound");
  }

  if (assignment.examMode !== "windowed") {
    throw new Error("examModeInvalid");
  }

  if (!assignment.examDurationMinutes || assignment.examDurationMinutes <= 0) {
    throw new Error("examDurationInvalid");
  }

  const now = await getDbNowUncached();

  return db.transaction(async (tx) => {

    if (assignment.startsAt && now < assignment.startsAt) {
      throw new Error("assignmentNotStarted");
    }

    if (assignment.deadline && now >= assignment.deadline) {
      throw new Error("assignmentClosed");
    }

    // Check for existing session (idempotent)
    const existing = await tx.query.examSessions.findFirst({
      where: and(
        eq(examSessions.assignmentId, assignmentId),
        eq(examSessions.userId, userId)
      ),
    });

    if (existing) {
      return {
        id: existing.id,
        assignmentId: existing.assignmentId,
        userId: existing.userId,
        startedAt: existing.startedAt,
        personalDeadline: existing.personalDeadline,
      };
    }

    const durationMs = (assignment.examDurationMinutes ?? 0) * 60_000;
    const personalDeadlineMs = now.getTime() + durationMs;
    const personalDeadline =
      assignment.deadline && assignment.deadline.getTime() < personalDeadlineMs
        ? assignment.deadline
        : new Date(personalDeadlineMs);

    const id = nanoid();
    const startedAt = now;

    await tx.insert(examSessions).values({
      id,
      assignmentId,
      userId,
      startedAt,
      personalDeadline,
      ipAddress: ipAddress ?? null,
    }).onConflictDoNothing();

    // Re-fetch the authoritative row (covers both newly-inserted and race-condition existing)
    const session = await tx.query.examSessions.findFirst({
      where: and(
        eq(examSessions.assignmentId, assignmentId),
        eq(examSessions.userId, userId)
      ),
    });

    if (!session) {
      throw new Error("assignmentClosed");
    }

    return {
      id: session.id,
      assignmentId: session.assignmentId,
      userId: session.userId,
      startedAt: session.startedAt,
      personalDeadline: session.personalDeadline,
    };
  });
}

/**
 * Staff-granted time extension for one participant's windowed-exam session
 * (RPF cycle-1 AGG-5: accommodations / incident recovery).
 *
 * Semantics:
 *  - extends `personal_deadline` by exactly `extendMinutes` (never shrinks —
 *    callers validate `extendMinutes >= 1`);
 *  - the extension is computed in SQL against the CURRENT stored deadline, so
 *    concurrent extensions compose instead of clobbering each other;
 *  - the result MAY exceed the assignment deadline by design — that is the
 *    point of an accommodation. `validateAssignmentSubmission` honors the
 *    per-session deadline past the assignment close for windowed exams, and
 *    late-penalty scoring already keys on `exam_sessions.personal_deadline`.
 *
 * Returns the updated session, or null when the participant has no session
 * for this assignment (they never started the exam — nothing to extend).
 */
export async function extendExamSession(
  assignmentId: string,
  userId: string,
  extendMinutes: number
): Promise<ExamSession | null> {
  if (!Number.isInteger(extendMinutes) || extendMinutes < 1) {
    throw new Error("extendMinutesInvalid");
  }

  const [updated] = await db
    .update(examSessions)
    .set({
      personalDeadline: sql`${examSessions.personalDeadline} + make_interval(mins => ${extendMinutes})`,
    })
    .where(and(eq(examSessions.assignmentId, assignmentId), eq(examSessions.userId, userId)))
    .returning({
      id: examSessions.id,
      assignmentId: examSessions.assignmentId,
      userId: examSessions.userId,
      startedAt: examSessions.startedAt,
      personalDeadline: examSessions.personalDeadline,
    });

  return updated ?? null;
}

export async function getExamSession(
  assignmentId: string,
  userId: string
): Promise<ExamSession | null> {
  const session = await db.query.examSessions.findFirst({
    where: and(
      eq(examSessions.assignmentId, assignmentId),
      eq(examSessions.userId, userId)
    ),
  });

  if (!session) return null;

  return {
    id: session.id,
    assignmentId: session.assignmentId,
    userId: session.userId,
    startedAt: session.startedAt,
    personalDeadline: session.personalDeadline,
  };
}

export async function getExamSessionsForAssignment(
  assignmentId: string
): Promise<ExamSessionWithUser[]> {
  const rows = await db
    .select({
      id: examSessions.id,
      assignmentId: examSessions.assignmentId,
      userId: examSessions.userId,
      startedAt: examSessions.startedAt,
      personalDeadline: examSessions.personalDeadline,
      username: users.username,
      name: users.name,
      className: users.className,
    })
    .from(examSessions)
    .innerJoin(users, eq(examSessions.userId, users.id))
    .where(eq(examSessions.assignmentId, assignmentId))
    .orderBy(asc(examSessions.startedAt));

  return rows.map((row) => ({
    id: row.id,
    assignmentId: row.assignmentId,
    userId: row.userId,
    startedAt: row.startedAt,
    personalDeadline: row.personalDeadline,
    username: row.username,
    name: row.name,
    className: row.className,
  }));
}
