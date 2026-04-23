import { NextRequest } from "next/server";
import { safeTokenCompare } from "@/lib/security/timing";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { rawQueryOne } from "@/lib/db/queries";
import { problems, testCases, languageConfigs, judgeWorkers } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { recordAuditEvent } from "@/lib/audit/events";
import { isJudgeAuthorized, isJudgeAuthorizedForWorker, hashToken } from "@/lib/judge/auth";
import { isJudgeIpAllowed } from "@/lib/judge/ip-allowlist";
import { logger } from "@/lib/logger";
import { consumeUserApiRateLimit } from "@/lib/security/api-rate-limit";
import { extractClientIp } from "@/lib/security/ip";
import { deserializeStoredJudgeCommand } from "@/lib/judge/languages";

import { getConfiguredSettings } from "@/lib/system-settings-config";
import { getDbNowUncached } from "@/lib/db-time";

const claimedSubmissionRowSchema = z.object({
  id: z.string(),
  userId: z.string(),
  problemId: z.string(),
  assignmentId: z.string().nullable(),
  previousStatus: z.string().nullable().optional(),
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

const claimRequestSchema = z.object({
  workerId: z.string().min(1).optional(),
  workerSecret: z.string().min(1).optional(),
}).superRefine((value, ctx) => {
  if (value.workerId && !value.workerSecret) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["workerSecret"],
      message: "workerSecretRequired",
    });
  }
});

export async function POST(request: NextRequest) {
  try {
    if (!isJudgeIpAllowed(request)) {
      return apiError("ipNotAllowed", 403);
    }

    const contentType = request.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      return apiError("unsupportedMediaType", 415);
    }

    const parsed = claimRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "invalidRequest", 400);
    }

    const workerId = parsed.data.workerId ?? null;
    const workerSecret = parsed.data.workerSecret ?? null;

    const rateLimitScope = workerId ?? `ip:${extractClientIp(request.headers) ?? "anonymous"}`;
    const rateLimitResponse = await consumeUserApiRateLimit(request, rateLimitScope, "judge:claim");
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Per-worker auth: when a workerId is provided, validate the Bearer token
    // against the worker's secretTokenHash (or fall back to shared JUDGE_AUTH_TOKEN).
    // Without a workerId, use the shared token.
    if (workerId) {
      const workerAuth = await isJudgeAuthorizedForWorker(request, workerId);
      if (!workerAuth.authorized) {
        return apiError(workerAuth.error ?? "unauthorized", 401);
      }
    } else {
      if (!isJudgeAuthorized(request)) {
        return apiError("unauthorized", 401);
      }
    }

    // Validate that the worker exists and is online before attempting an
    // atomic capacity-gated claim below.
    if (workerId) {
      const [worker] = await db
        .select({
          status: judgeWorkers.status,
          secretTokenHash: judgeWorkers.secretTokenHash,
        })
        .from(judgeWorkers)
        .where(eq(judgeWorkers.id, workerId))
        .limit(1);

      if (!worker || worker.status !== "online") {
        return apiError("workerNotFound", 403);
      }

      // Defense-in-depth: also validate the workerSecret from the request body
      // against the worker's stored secretTokenHash. Plaintext fallback is
      // gone — workers registered before the hash rollout must re-register.
      if (worker.secretTokenHash) {
        if (!workerSecret) {
          return apiError("workerSecretRequired", 400);
        }
        if (!safeTokenCompare(hashToken(workerSecret), worker.secretTokenHash)) {
          return apiError("invalidWorkerSecret", 403);
        }
      }
    }

    const claimToken = nanoid();
    // Use DB server time for claimCreatedAt to avoid clock skew between app
    // and DB servers. The stale claim detection compares judge_claimed_at
    // against NOW() in SQL, so the timestamp must be DB-consistent.
    const claimCreatedAt = (await getDbNowUncached()).getTime();

    const staleClaimTimeoutMs = getConfiguredSettings().staleClaimTimeoutMs;
    const claimSql = workerId
      ? `
        WITH worker_slot AS (
          SELECT id
          FROM judge_workers
          WHERE id = @workerId
            AND status = 'online'
            AND active_tasks < concurrency
          FOR UPDATE
        ),
        candidate AS (
          SELECT
            s.id,
            s.status AS previous_status
          FROM submissions s
          INNER JOIN problems p ON p.id = s.problem_id
          WHERE EXISTS (SELECT 1 FROM worker_slot)
            AND (s.status = 'pending'
              OR (s.status IN ('queued', 'judging')
                  AND s.judge_claimed_at < NOW() - (@staleClaimTimeoutMs || ' milliseconds')::interval))
            AND COALESCE(p.problem_type, 'auto') != 'manual'
          ORDER BY s.submitted_at ASC, s.id ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        ),
        claimed AS (
          UPDATE submissions AS s
          SET
            status = 'queued',
            judge_claim_token = @claimToken,
            judge_claimed_at = to_timestamp(@claimCreatedAt::double precision / 1000),
            judge_worker_id = @workerId
          FROM candidate
          WHERE s.id = candidate.id
          RETURNING
            s.id,
            s.user_id AS "userId",
            s.problem_id AS "problemId",
            s.assignment_id AS "assignmentId",
            candidate.previous_status AS "previousStatus",
            s.judge_claim_token AS "claimToken",
            s.language,
            s.source_code AS "sourceCode",
            s.status,
            s.compile_output AS "compileOutput",
            s.execution_time_ms AS "executionTimeMs",
            s.memory_used_kb AS "memoryUsedKb",
            s.score,
            EXTRACT(EPOCH FROM s.judged_at)::integer AS "judgedAt",
            EXTRACT(EPOCH FROM s.submitted_at)::integer AS "submittedAt"
        ),
        worker_bump AS (
          UPDATE judge_workers
          SET active_tasks = active_tasks + 1
          WHERE id = @workerId
            AND EXISTS (SELECT 1 FROM claimed)
          RETURNING id
        )
        SELECT * FROM claimed
      `
      : `
        WITH candidate AS (
          SELECT
            s.id,
            s.status AS previous_status
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
        UPDATE submissions AS s
        SET
          status = 'queued',
          judge_claim_token = @claimToken,
          judge_claimed_at = to_timestamp(@claimCreatedAt::double precision / 1000),
          judge_worker_id = @workerId
        FROM candidate
        WHERE s.id = candidate.id
        RETURNING
          s.id,
          s.user_id AS "userId",
          s.problem_id AS "problemId",
          s.assignment_id AS "assignmentId",
          candidate.previous_status AS "previousStatus",
          s.judge_claim_token AS "claimToken",
          s.language,
          s.source_code AS "sourceCode",
          s.status,
          s.compile_output AS "compileOutput",
          s.execution_time_ms AS "executionTimeMs",
          s.memory_used_kb AS "memoryUsedKb",
          s.score,
          EXTRACT(EPOCH FROM s.judged_at)::integer AS "judgedAt",
          EXTRACT(EPOCH FROM s.submitted_at)::integer AS "submittedAt"
      `;

    // Atomic claim via raw SQL (PostgreSQL). When a worker is provided, the
    // worker row is locked and capacity is consumed inside the same statement.
    const claimedRaw = await rawQueryOne<ClaimedSubmissionRow>(claimSql, {
      claimToken,
      claimCreatedAt,
      staleClaimTimeoutMs,
      workerId,
    });

    const claimed: ClaimedSubmissionRow | undefined = claimedRaw
      ? claimedSubmissionRowSchema.parse(claimedRaw)
      : undefined;

    if (!claimed) {
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

        if (worker && worker.activeTasks >= worker.concurrency) {
          return apiError("workerAtCapacity", 503);
        }
      }
      return apiSuccess(null);
    }

    if (claimed.previousStatus !== null && claimed.previousStatus !== undefined && claimed.previousStatus !== "pending") {
      logger.warn({ submissionId: claimed.id, previousStatus: claimed.previousStatus }, "[judge/claim] Reclaimed stale submission (judge_claimed_at was stale)");
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
        previousStatus: claimed.previousStatus ?? null,
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
      .select({
        id: testCases.id,
        input: testCases.input,
        expectedOutput: testCases.expectedOutput,
        isVisible: testCases.isVisible,
        sortOrder: testCases.sortOrder,
      })
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
