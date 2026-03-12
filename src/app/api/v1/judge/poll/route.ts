import { NextRequest, NextResponse } from "next/server";
import { db, sqlite } from "@/lib/db";
import { problems, submissions, submissionResults, testCases } from "@/lib/db/schema";
import { eq, asc, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { recordAuditEvent } from "@/lib/audit/events";
import { isJudgeAuthorized } from "@/lib/judge/auth";
import {
  buildSubmissionResultRows,
  computeFinalJudgeMetrics,
  IN_PROGRESS_JUDGE_STATUSES,
} from "@/lib/judge/verdict";
import { isSubmissionStatus } from "@/lib/security/constants";
import { judgeStatusReportSchema } from "@/lib/validators/api";

const claimedSubmissionRowSchema = z.object({
  id: z.string(),
  userId: z.string(),
  problemId: z.string(),
  assignmentId: z.string().nullable(),
  claimToken: z.string().nullable(),
  language: z.string(),
  sourceCode: z.string(),
  status: z.string().nullable(),
  compileOutput: z.string().nullable(),
  executionTimeMs: z.number().nullable(),
  memoryUsedKb: z.number().nullable(),
  score: z.number().nullable(),
  judgedAt: z.number().nullable(),
  submittedAt: z.number(),
});

type ClaimedSubmissionRow = z.infer<typeof claimedSubmissionRowSchema>;

export async function GET(request: NextRequest) {
  try {
    if (!isJudgeAuthorized(request)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const claimToken = nanoid();
    const claimCreatedAt = Date.now();

    // Raw SQL is required here for an atomic UPDATE...RETURNING claim operation.
    // Drizzle ORM does not natively support UPDATE...RETURNING for SQLite in a
    // single round-trip, which would create a race condition between claim and fetch.
    const claimedRaw = sqlite
      .prepare(
        `
          UPDATE submissions
          SET
            status = 'queued',
            judge_claim_token = @claimToken,
            judge_claimed_at = @claimCreatedAt
          WHERE id = (
            SELECT id
            FROM submissions
            WHERE status = 'pending'
               OR (status IN ('queued', 'judging')
                   AND judge_claimed_at < (unixepoch('now') * 1000 - 300000))
            ORDER BY submitted_at ASC
            LIMIT 1
          )
          RETURNING
            id,
            user_id AS userId,
            problem_id AS problemId,
            assignment_id AS assignmentId,
            judge_claim_token AS claimToken,
            language,
            source_code AS sourceCode,
            status,
            compile_output AS compileOutput,
            execution_time_ms AS executionTimeMs,
            memory_used_kb AS memoryUsedKb,
            score,
            judged_at AS judgedAt,
            submitted_at AS submittedAt
        `
      )
      .get({ claimToken, claimCreatedAt });

    const claimed: ClaimedSubmissionRow | undefined = claimedRaw !== undefined
      ? claimedSubmissionRowSchema.parse(claimedRaw)
      : undefined;

    if (!claimed) {
      return NextResponse.json({ data: null });
    }

    if (claimed.status !== null && claimed.status !== 'pending') {
      console.warn(
        `[judge/poll] Reclaimed stale submission ${claimed.id} with previous status '${claimed.status}' (judge_claimed_at was stale)`
      );
    }

    recordAuditEvent({
      action: "submission.claimed_for_judging",
      actorRole: "system",
      resourceType: "submission",
      resourceId: claimed.id,
      resourceLabel: claimed.id,
      summary: `Claimed submission ${claimed.id} for judging`,
      details: {
        assignmentId: claimed.assignmentId,
        claimTokenPresent: Boolean(claimed.claimToken),
        language: claimed.language,
        problemId: claimed.problemId,
        status: claimed.status,
      },
      request,
    });

    const problem = await db.query.problems.findFirst({
      where: eq(problems.id, claimed.problemId),
      columns: {
        timeLimitMs: true,
        memoryLimitMb: true,
      },
    });

    if (!problem) {
      return NextResponse.json({ error: "problemNotFound" }, { status: 500 });
    }

    // Fetch test cases for the problem
    const cases = await db
      .select()
      .from(testCases)
      .where(eq(testCases.problemId, claimed.problemId))
      .orderBy(asc(testCases.sortOrder));

    return NextResponse.json({
      data: {
        ...claimed,
        timeLimitMs: problem.timeLimitMs,
        memoryLimitMb: problem.memoryLimitMb,
        testCases: cases,
      },
    });
  } catch (error) {
    console.error("GET /api/v1/judge/poll error:", error);
    return NextResponse.json({ error: "internalServerError" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isJudgeAuthorized(request)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const parsed = judgeStatusReportSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "invalidJudgeResult" },
        { status: 400 }
      );
    }

    const { submissionId, claimToken, status, compileOutput, results } = parsed.data;

    if (!isSubmissionStatus(status)) {
      return NextResponse.json({ error: "invalidSubmissionStatus" }, { status: 400 });
    }

    if (results?.some((result) => !isSubmissionStatus(result.status))) {
      return NextResponse.json({ error: "invalidJudgeResult" }, { status: 400 });
    }

    const submission = await db.query.submissions.findFirst({
      where: eq(submissions.id, submissionId),
    });

    if (!submission) {
      return NextResponse.json({ error: "submissionNotFound" }, { status: 404 });
    }

    if (IN_PROGRESS_JUDGE_STATUSES.has(status)) {
      const inProgressResult = db
        .update(submissions)
        .set({
          status,
          judgeClaimedAt: submission.judgeClaimedAt ?? new Date(),
        })
        .where(
          and(eq(submissions.id, submissionId), eq(submissions.judgeClaimToken, claimToken))
        )
        .run();

      if (inProgressResult.changes === 0) {
        return NextResponse.json({ error: "invalidJudgeClaim" }, { status: 403 });
      }

      const updatedInProgress = await db.query.submissions.findFirst({
        where: eq(submissions.id, submissionId),
      });

      recordAuditEvent({
        action: "submission.status_updated",
        actorRole: "system",
        resourceType: "submission",
        resourceId: submission.id,
        resourceLabel: submission.id,
        summary: `Marked submission ${submission.id} as ${status}`,
        details: {
          claimTokenPresent: true,
          previousStatus: submission.status,
          status,
        },
        request,
      });

      return NextResponse.json({ data: updatedInProgress });
    }

    const { score, maxExecutionTimeMs, maxMemoryUsedKb } = computeFinalJudgeMetrics(results);

    try {
      sqlite.transaction(() => {
        const finalResult = db.update(submissions).set({
          status,
          judgeClaimToken: null,
          judgeClaimedAt: null,
          compileOutput: compileOutput ?? null,
          score,
          executionTimeMs: maxExecutionTimeMs,
          memoryUsedKb: maxMemoryUsedKb,
          judgedAt: new Date(),
        }).where(
          and(eq(submissions.id, submissionId), eq(submissions.judgeClaimToken, claimToken))
        ).run();

        if (finalResult.changes === 0) {
          throw new Error("claim_mismatch");
        }

        db.delete(submissionResults).where(eq(submissionResults.submissionId, submissionId)).run();

        const rows = buildSubmissionResultRows(submissionId, results);
        if (rows.length > 0) {
          db.insert(submissionResults).values(rows).run();
        }
      })();
    } catch (txError) {
      if (txError instanceof Error && txError.message === "claim_mismatch") {
        return NextResponse.json({ error: "invalidJudgeClaim" }, { status: 403 });
      }
      throw txError;
    }

    const updated = await db.query.submissions.findFirst({
      where: eq(submissions.id, submissionId),
    });

    recordAuditEvent({
      action: "submission.judged",
      actorRole: "system",
      resourceType: "submission",
      resourceId: submission.id,
      resourceLabel: submission.id,
      summary: `Recorded final verdict ${status} for submission ${submission.id}`,
      details: {
        claimTokenCleared: true,
        compileOutputPresent: Boolean(compileOutput),
        previousStatus: submission.status,
        resultCount: Array.isArray(results) ? results.length : 0,
        score,
        status,
      },
      request,
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("POST /api/v1/judge/poll error:", error);
    return NextResponse.json({ error: "internalServerError" }, { status: 500 });
  }
}
