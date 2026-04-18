import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  antiCheatEvents,
  assignmentProblems,
  codeSnapshots,
  contestAccessTokens,
  examSessions,
  problems,
  submissions,
  users,
} from "@/lib/db/schema";

export type ParticipantTimelineEvent =
  | {
      type: "submission";
      at: Date | null;
      submissionId: string;
      status: string | null;
      score: number | null;
      language: string;
      executionTimeMs: number | null;
    }
  | {
      type: "snapshot";
      at: Date | null;
      snapshotId: string;
      charCount: number;
      language: string;
    }
  | {
      type: "first_ac";
      at: Date | null;
      submissionId: string;
    };

export type ParticipantTimeline = {
  participant: {
    userId: string;
    username: string;
    name: string;
    examStartedAt: Date | null;
    personalDeadline: Date | null;
    contestAccessAt: Date | null;
  };
  problems: Array<{
    problemId: string;
    title: string;
    points: number;
    sortOrder: number;
    summary: {
      totalAttempts: number;
      bestScore: number | null;
      firstSubmissionAt: Date | null;
      lastSubmissionAt: Date | null;
      firstAcAt: Date | null;
      timeToFirstSubmission: number | null;
      timeToFirstAc: number | null;
      wrongBeforeAc: number;
      snapshotCount: number;
    };
    timeline: ParticipantTimelineEvent[];
  }>;
  antiCheatSummary: {
    totalEvents: number;
    byType: Record<string, number>;
  };
};

function toSecondsBetween(start: Date | null, end: Date | null) {
  if (!start || !end) return null;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
}

function sortTimeline(events: ParticipantTimelineEvent[]) {
  return [...events].sort((left, right) => {
    const leftTime = left.at ? left.at.getTime() : 0;
    const rightTime = right.at ? right.at.getTime() : 0;
    if (leftTime !== rightTime) return leftTime - rightTime;
    if (left.type === right.type) return 0;
    return left.type.localeCompare(right.type);
  });
}

export async function getParticipantTimeline(
  assignmentId: string,
  userId: string
): Promise<ParticipantTimeline | null> {
  const [
    participant,
    examSession,
    contestAccess,
    assignmentProblemRows,
    submissionRows,
    snapshotRows,
    antiCheatRows,
  ] = await Promise.all([
    db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        id: true,
        username: true,
        name: true,
      },
    }),
    db.query.examSessions.findFirst({
      where: and(eq(examSessions.assignmentId, assignmentId), eq(examSessions.userId, userId)),
      columns: {
        startedAt: true,
        personalDeadline: true,
      },
    }),
    db.query.contestAccessTokens.findFirst({
      where: and(
        eq(contestAccessTokens.assignmentId, assignmentId),
        eq(contestAccessTokens.userId, userId)
      ),
      columns: {
        redeemedAt: true,
      },
    }),
    db
      .select({
        problemId: assignmentProblems.problemId,
        title: problems.title,
        points: assignmentProblems.points,
        sortOrder: assignmentProblems.sortOrder,
      })
      .from(assignmentProblems)
      .innerJoin(problems, eq(problems.id, assignmentProblems.problemId))
      .where(eq(assignmentProblems.assignmentId, assignmentId))
      .orderBy(assignmentProblems.sortOrder, problems.title),
    db
      .select({
        id: submissions.id,
        problemId: submissions.problemId,
        status: submissions.status,
        score: submissions.score,
        language: submissions.language,
        executionTimeMs: submissions.executionTimeMs,
        submittedAt: submissions.submittedAt,
      })
      .from(submissions)
      .where(and(eq(submissions.assignmentId, assignmentId), eq(submissions.userId, userId)))
      .orderBy(asc(submissions.submittedAt)),
    db
      .select({
        id: codeSnapshots.id,
        problemId: codeSnapshots.problemId,
        language: codeSnapshots.language,
        charCount: codeSnapshots.charCount,
        createdAt: codeSnapshots.createdAt,
      })
      .from(codeSnapshots)
      .where(and(eq(codeSnapshots.assignmentId, assignmentId), eq(codeSnapshots.userId, userId)))
      .orderBy(asc(codeSnapshots.createdAt)),
    db
      .select({
        eventType: antiCheatEvents.eventType,
      })
      .from(antiCheatEvents)
      .where(and(eq(antiCheatEvents.assignmentId, assignmentId), eq(antiCheatEvents.userId, userId)))
      .orderBy(asc(antiCheatEvents.createdAt)),
  ]);

  if (!participant) {
    return null;
  }

  const submissionsByProblem = new Map<string, typeof submissionRows>();
  for (const row of submissionRows) {
    const current = submissionsByProblem.get(row.problemId) ?? [];
    current.push(row);
    submissionsByProblem.set(row.problemId, current);
  }

  const snapshotsByProblem = new Map<string, typeof snapshotRows>();
  for (const row of snapshotRows) {
    const current = snapshotsByProblem.get(row.problemId) ?? [];
    current.push(row);
    snapshotsByProblem.set(row.problemId, current);
  }

  const problemsTimeline = assignmentProblemRows.map((problemRow) => {
    const problemSubmissions = submissionsByProblem.get(problemRow.problemId) ?? [];
    const problemSnapshots = snapshotsByProblem.get(problemRow.problemId) ?? [];
    const firstSubmission = problemSubmissions[0] ?? null;
    const lastSubmission = problemSubmissions.at(-1) ?? null;
    const firstAccepted = problemSubmissions.find((submission) => submission.status === "accepted") ?? null;
    const wrongBeforeAc = firstAccepted
      ? problemSubmissions.filter(
          (submission) =>
            submission !== firstAccepted
            && submission.status !== "accepted"
            && submission.submittedAt
            && firstAccepted.submittedAt
            && submission.submittedAt.getTime() < firstAccepted.submittedAt.getTime()
        ).length
      : 0;
    const bestScore = problemSubmissions.reduce<number | null>((best, submission) => {
      if (submission.score === null || submission.score === undefined) return best;
      if (best === null) return submission.score;
      return Math.max(best, submission.score);
    }, null);

    const timeline = sortTimeline([
      ...problemSubmissions.map((submission) => ({
        type: "submission" as const,
        at: submission.submittedAt,
        submissionId: submission.id,
        status: submission.status,
        score: submission.score,
        language: submission.language,
        executionTimeMs: submission.executionTimeMs,
      })),
      ...problemSnapshots.map((snapshot) => ({
        type: "snapshot" as const,
        at: snapshot.createdAt,
        snapshotId: snapshot.id,
        charCount: snapshot.charCount,
        language: snapshot.language,
      })),
      ...(firstAccepted
        ? [{
            type: "first_ac" as const,
            at: firstAccepted.submittedAt,
            submissionId: firstAccepted.id,
          }]
        : []),
    ]);

    return {
      problemId: problemRow.problemId,
      title: problemRow.title,
      points: problemRow.points ?? 100,
      sortOrder: problemRow.sortOrder ?? 0,
      summary: {
        totalAttempts: problemSubmissions.length,
        bestScore,
        firstSubmissionAt: firstSubmission?.submittedAt ?? null,
        lastSubmissionAt: lastSubmission?.submittedAt ?? null,
        firstAcAt: firstAccepted?.submittedAt ?? null,
        timeToFirstSubmission: toSecondsBetween(examSession?.startedAt ?? null, firstSubmission?.submittedAt ?? null),
        timeToFirstAc: toSecondsBetween(examSession?.startedAt ?? null, firstAccepted?.submittedAt ?? null),
        wrongBeforeAc,
        snapshotCount: problemSnapshots.length,
      },
      timeline,
    };
  });

  const byType: Record<string, number> = {};
  for (const event of antiCheatRows) {
    byType[event.eventType] = (byType[event.eventType] ?? 0) + 1;
  }

  return {
    participant: {
      userId: participant.id,
      username: participant.username,
      name: participant.name,
      examStartedAt: examSession?.startedAt ?? null,
      personalDeadline: examSession?.personalDeadline ?? null,
      contestAccessAt: contestAccess?.redeemedAt ?? null,
    },
    problems: problemsTimeline,
    antiCheatSummary: {
      totalEvents: antiCheatRows.length,
      byType,
    },
  };
}
