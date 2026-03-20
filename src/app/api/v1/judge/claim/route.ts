import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db, sqlite } from "@/lib/db";
import { problems, testCases, languageConfigs } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { recordAuditEvent } from "@/lib/audit/events";
import { isJudgeAuthorized } from "@/lib/judge/auth";
import { logger } from "@/lib/logger";

import { getConfiguredSettings } from "@/lib/system-settings-config";

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

export async function POST(request: NextRequest) {
  try {
    if (!isJudgeAuthorized(request)) {
      return apiError("unauthorized", 401);
    }

    const contentType = request.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      return apiError("unsupportedMediaType", 415);
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
                   AND judge_claimed_at < (unixepoch('now') * 1000 - @staleClaimTimeoutMs))
            ORDER BY submitted_at ASC, rowid ASC
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
      .get({ claimToken, claimCreatedAt, staleClaimTimeoutMs: getConfiguredSettings().staleClaimTimeoutMs });

    const claimed: ClaimedSubmissionRow | undefined = claimedRaw !== undefined
      ? claimedSubmissionRowSchema.parse(claimedRaw)
      : undefined;

    if (!claimed) {
      return apiSuccess(null);
    }

    if (claimed.status !== null && claimed.status !== 'pending') {
      logger.warn({ submissionId: claimed.id, previousStatus: claimed.status }, "[judge/claim] Reclaimed stale submission (judge_claimed_at was stale)");
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
        comparisonMode: true,
        floatAbsoluteError: true,
        floatRelativeError: true,
      },
    });

    if (!problem) {
      return apiError("problemNotFound", 500);
    }

    // Fetch test cases for the problem
    const cases = await db
      .select()
      .from(testCases)
      .where(eq(testCases.problemId, claimed.problemId))
      .orderBy(asc(testCases.sortOrder));

    const langConfig = await db.query.languageConfigs.findFirst({
      where: eq(languageConfigs.language, claimed.language),
      columns: {
        dockerImage: true,
        compileCommand: true,
        runCommand: true,
      },
    });

    return apiSuccess({
      ...claimed,
      timeLimitMs: problem.timeLimitMs,
      memoryLimitMb: problem.memoryLimitMb,
      comparisonMode: problem.comparisonMode ?? "exact",
      floatAbsoluteError: problem.floatAbsoluteError ?? null,
      floatRelativeError: problem.floatRelativeError ?? null,
      testCases: cases,
      // Language config overrides from DB (used by worker when present)
      dockerImage: langConfig?.dockerImage ?? null,
      compileCommand: langConfig?.compileCommand ? ["sh", "-c", langConfig.compileCommand] : null,
      runCommand: langConfig?.runCommand ? ["sh", "-c", langConfig.runCommand] : null,
    });
  } catch (error) {
    logger.error({ err: error }, "POST /api/v1/judge/claim error");
    return apiError("internalServerError", 500);
  }
}
