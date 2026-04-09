import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { rawQueryOne } from "@/lib/db/queries";
import { problems, testCases, languageConfigs, judgeWorkers } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { recordAuditEvent } from "@/lib/audit/events";
import { isJudgeAuthorized } from "@/lib/judge/auth";
import { logger } from "@/lib/logger";
import { deserializeStoredJudgeCommand } from "@/lib/judge/languages";

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

    const body = await request.json();
    const workerId: string | null = typeof body?.workerId === "string" ? body.workerId : null;

    // Validate that the worker exists, is online, and has capacity
    if (workerId) {
      const [worker] = await db
        .select({
          status: judgeWorkers.status,
          activeTasks: judgeWorkers.activeTasks,
          concurrency: judgeWorkers.concurrency,
        })
        .from(judgeWorkers)
        .where(eq(judgeWorkers.id, workerId))
        .limit(1);

      if (!worker || worker.status !== "online") {
        return apiError("workerNotFound", 403);
      }

      if (worker.activeTasks >= worker.concurrency) {
        return apiError("workerAtCapacity", 503);
      }
    }

    const claimToken = nanoid();
    const claimCreatedAt = Date.now();

    // Atomic UPDATE...RETURNING for race-free claim via raw SQL (PostgreSQL).
    const claimedRaw = await rawQueryOne<ClaimedSubmissionRow>(
      `
        UPDATE submissions
        SET
          status = 'queued',
          judge_claim_token = @claimToken,
          judge_claimed_at = to_timestamp(@claimCreatedAt::double precision / 1000),
          judge_worker_id = @workerId
        WHERE id = (
          SELECT s.id
          FROM submissions s
          INNER JOIN problems p ON p.id = s.problem_id
          WHERE (s.status = 'pending'
             OR (s.status IN ('queued', 'judging')
                 AND s.judge_claimed_at < NOW() - (@staleClaimTimeoutMs || ' milliseconds')::interval))
            AND COALESCE(p.problem_type, 'auto') != 'manual'
          ORDER BY s.submitted_at ASC, s.id ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        RETURNING
          id,
          user_id AS "userId",
          problem_id AS "problemId",
          assignment_id AS "assignmentId",
          judge_claim_token AS "claimToken",
          language,
          source_code AS "sourceCode",
          status,
          compile_output AS "compileOutput",
          execution_time_ms AS "executionTimeMs",
          memory_used_kb AS "memoryUsedKb",
          score,
          EXTRACT(EPOCH FROM judged_at)::integer AS "judgedAt",
          EXTRACT(EPOCH FROM submitted_at)::integer AS "submittedAt"
      `,
      { claimToken, claimCreatedAt, staleClaimTimeoutMs: getConfiguredSettings().staleClaimTimeoutMs, workerId }
    );

    const claimed: ClaimedSubmissionRow | undefined = claimedRaw
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
        workerId,
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

    const [langConfig] = await db
      .select({
        dockerImage: languageConfigs.dockerImage,
        compileCommand: languageConfigs.compileCommand,
        runCommand: languageConfigs.runCommand,
      })
      .from(languageConfigs)
      .where(eq(languageConfigs.language, claimed.language))
      .limit(1);

    return apiSuccess({
      ...claimed,
      timeLimitMs: problem.timeLimitMs,
      memoryLimitMb: problem.memoryLimitMb,
      comparisonMode: problem.comparisonMode ?? "exact",
      floatAbsoluteError: problem.floatAbsoluteError ?? null,
      floatRelativeError: problem.floatRelativeError ?? null,
      testCases: cases,
      // Language config overrides from DB (used by worker when present)
      dockerImage: langConfig?.dockerImage?.trim() || null,
      compileCommand: deserializeStoredJudgeCommand(langConfig?.compileCommand),
      runCommand: deserializeStoredJudgeCommand(langConfig?.runCommand),
    });
  } catch (error) {
    logger.error({ err: error }, "POST /api/v1/judge/claim error");
    return apiError("internalServerError", 500);
  }
}
