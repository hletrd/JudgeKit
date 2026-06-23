import { NextRequest } from "next/server";
import crypto from "crypto";
import { safeTokenCompare } from "@/lib/security/timing";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db, execTransaction } from "@/lib/db";
import { rawQueryOne } from "@/lib/db/queries";
import { problems, testCases, languageConfigs, judgeWorkers, submissions, assignments } from "@/lib/db/schema";
import { eq, asc, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { recordAuditEvent } from "@/lib/audit/events";
import { isJudgeAuthorized, isJudgeAuthorizedForWorker, hashToken } from "@/lib/judge/auth";
import { buildClaimSql } from "@/lib/judge/claim-query";
import { isJudgeIpAllowed } from "@/lib/judge/ip-allowlist";
import { logger } from "@/lib/logger";
import { consumeUserApiRateLimit } from "@/lib/security/api-rate-limit";
import { extractClientIp } from "@/lib/security/ip";
import { deserializeStoredJudgeCommand } from "@/lib/judge/languages";
import { supportsFunctionJudging } from "@/lib/judge/function-judging/registry";
import { assembleFunctionSubmission } from "@/lib/judge/function-judging/assemble";
import { parseFunctionSpec } from "@/lib/judge/function-judging/types";

import { getConfiguredSettings } from "@/lib/system-settings-config";
import { getDbNowUncached } from "@/lib/db-time";

/**
 * Coerces a value to number while rejecting NaN and Infinity. PostgreSQL raw
 * queries may return strings for numeric columns; we want to accept those but
 * reject genuinely non-numeric values (including "NaN", "Infinity", and
 * scientific notation that overflows to Infinity like "1e309").
 */
const coerceNullableNumber = z.union([
  z.null(),
  z.string().transform((s) => {
    const n = Number(s);
    return Number.isNaN(n) || !Number.isFinite(n) ? null : n;
  }),
  z.number().refine((n) => !Number.isNaN(n) && Number.isFinite(n)),
]);

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
  // PostgreSQL may return integer/bigint columns as strings in raw queries.
  executionTimeMs: coerceNullableNumber,
  memoryUsedKb: coerceNullableNumber,
  score: coerceNullableNumber,
  judgedAt: coerceNullableNumber,
  submittedAt: z.union([
    z.number().refine((n) => !Number.isNaN(n) && Number.isFinite(n)),
    z.string().transform((s) => {
      const n = Number(s);
      if (Number.isNaN(n) || !Number.isFinite(n)) {
        throw new Error(`Invalid submittedAt: ${s}`);
      }
      return n;
    }),
  ]),
});

type ClaimedSubmissionRow = z.infer<typeof claimedSubmissionRowSchema>;

async function releaseClaimedSubmission(
  submissionId: string,
  claimToken: string,
  workerId: string | null,
) {
  await execTransaction(async (tx) => {
    const [current] = await tx
      .select({ judgeClaimToken: submissions.judgeClaimToken })
      .from(submissions)
      .where(eq(submissions.id, submissionId))
      .limit(1);

    if (current?.judgeClaimToken !== claimToken) {
      return;
    }

    await tx.update(submissions)
      .set({
        status: "pending",
        judgeWorkerId: null,
        judgeClaimToken: null,
        judgeClaimedAt: null,
      })
      .where(eq(submissions.id, submissionId));

    if (workerId) {
      await tx.update(judgeWorkers)
        .set({ activeTasks: sql`GREATEST(${judgeWorkers.activeTasks} - 1, 0)` })
        .where(eq(judgeWorkers.id, workerId));
    }
  });
}

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
  let claimedForCleanup: ClaimedSubmissionRow | undefined;
  let claimTokenForCleanup: string | undefined;
  let workerIdForCleanup: string | null = null;

  try {
    if (!isJudgeIpAllowed(request)) {
      return apiError("ipNotAllowed", 403);
    }

    const contentType = request.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      return apiError("unsupportedMediaType", 415);
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return apiError("invalidJson", 400);
    }
    const parsed = claimRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "invalidRequest", 400);
    }

    const workerId = parsed.data.workerId ?? null;
    const workerSecret = parsed.data.workerSecret ?? null;
    workerIdForCleanup = workerId;

    const clientIp = extractClientIp(request.headers);
    let rateLimitScope: string;
    if (workerId) {
      rateLimitScope = workerId;
    } else if (clientIp) {
      rateLimitScope = `ip:${clientIp}`;
    } else {
      // Fall back to a hash of the Authorization header so different tokens
      // get different rate-limit buckets. Prevents one token-holder from
      // exhausting the limit for all unidentifiable workers.
      const authHeader = request.headers.get("authorization") ?? "";
      const authHash = authHeader.length > 7
        ? crypto.createHash("sha256").update(authHeader).digest("hex").slice(0, 16)
        : "none";
      rateLimitScope = `auth:${authHash}`;
    }
    const rateLimitResponse = await consumeUserApiRateLimit(request, rateLimitScope, "judge:claim");
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Per-worker auth: when a workerId is provided, validate the Bearer token
    // against the worker's secretTokenHash. Without a workerId, use the shared
    // token only for the bootstrap/no-worker registration-compatible path.
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
    claimTokenForCleanup = claimToken;
    // Use DB server time for claimCreatedAt to avoid clock skew between app
    // and DB servers. The stale claim detection compares judge_claimed_at
    // against NOW() in SQL, so the timestamp must be DB-consistent.
    const claimCreatedAt = (await getDbNowUncached()).getTime();

    const staleClaimTimeoutMs = getConfiguredSettings().staleClaimTimeoutMs;
    const claimSql = buildClaimSql(Boolean(workerId));

    // Atomic claim via raw SQL (PostgreSQL). When a worker is provided, the
    // worker row is locked and capacity is consumed inside the same statement.
    const claimedRaw = await rawQueryOne<ClaimedSubmissionRow>(claimSql, {
      claimToken,
      claimCreatedAt,
      staleClaimTimeoutMs,
      workerId,
    });

    let claimed: ClaimedSubmissionRow | undefined;
    if (claimedRaw) {
      try {
        claimed = claimedSubmissionRowSchema.parse(claimedRaw);
        claimedForCleanup = claimed;
      } catch (parseErr) {
        logger.error({ err: parseErr, claimedRaw }, "[judge/claim] Claimed row schema mismatch");
        if (
          claimedRaw &&
          typeof claimedRaw === "object" &&
          typeof (claimedRaw as { id?: unknown }).id === "string"
        ) {
          await releaseClaimedSubmission(
            (claimedRaw as { id: string }).id,
            claimToken,
            workerId,
          ).catch((cleanupError: unknown) => {
            logger.error(
              { err: cleanupError, submissionId: (claimedRaw as { id: string }).id },
              "POST /api/v1/judge/claim parse-error cleanup failed",
            );
          });
        }
        return apiError("invalidJudgeClaim", 422);
      }
    }

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

    const problemPromise = db.query.problems.findFirst({
      where: eq(problems.id, claimed.problemId),
      columns: {
        timeLimitMs: true,
        memoryLimitMb: true,
        comparisonMode: true,
        floatAbsoluteError: true,
        floatRelativeError: true,
        problemType: true,
        functionSpec: true,
      },
    });

    const casesPromise = db
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

    const langConfigPromise = db
      .select({
        dockerImage: languageConfigs.dockerImage,
        compileCommand: languageConfigs.compileCommand,
        runCommand: languageConfigs.runCommand,
        timeLimitMultiplier: languageConfigs.timeLimitMultiplier,
      })
      .from(languageConfigs)
      .where(eq(languageConfigs.language, claimed.language))
      .limit(1);

    const assignmentPromise = claimed.assignmentId
      ? db
          .select({ scoringModel: assignments.scoringModel })
          .from(assignments)
          .where(eq(assignments.id, claimed.assignmentId))
          .limit(1)
      : Promise.resolve([]);

    const [problem, cases, [langConfig], [assignment]] = await Promise.all([
      problemPromise,
      casesPromise,
      langConfigPromise,
      assignmentPromise,
    ]);

    if (!problem) {
      // Reset the submission to pending so it doesn't get stuck in a
      // claim-failure loop. The claim fields are cleared so another worker
      // can pick it up if the problem reappears, or an admin can investigate.
      await releaseClaimedSubmission(claimed.id, claimToken, workerId);

      return apiError("problemNotFound", 422);
    }

    // Apply per-language time-limit multiplier so e.g. Python gets 3x the
    // C++ TL on the same problem. Default multiplier 1.0 leaves the problem
    // limit untouched. Round up so the displayed value matches what the
    // judge actually enforces.
    const baseTimeLimitMs = problem.timeLimitMs ?? 2000;
    const rawMultiplier = langConfig?.timeLimitMultiplier ?? 1.0;
    // Guard against NaN/Infinity from corrupted DB values. A non-finite
    // multiplier would serialize to null over JSON and crash the worker.
    const multiplier = Number.isFinite(rawMultiplier) ? Math.max(0.1, Math.min(rawMultiplier, 50)) : 1.0;
    const adjustedTimeLimitMs = Math.max(1, Math.ceil(baseTimeLimitMs * multiplier));

    // IOI partial scoring requires running EVERY test case so the server's
    // `passed / results.length` score uses the true denominator. ICPC (AC-only)
    // and practice (no assignment) keep the fail-fast early break — the worker
    // defaults run_all_test_cases to false when this flag is absent.
    const runAllTestCases = assignment?.scoringModel === "ioi";

    // Function-signature problems: assemble the student's source into a full
    // stdin/stdout harness (prelude + student code + generated main) so the
    // unchanged worker judges it like any auto problem. Only the source SENT
    // to the worker is wrapped — the persisted submission row keeps the
    // student's original source untouched. Every other case (auto, manual,
    // missing spec, unsupported language) passes the source through verbatim.
    let workerSourceCode = claimed.sourceCode;
    if (
      problem.problemType === "function" &&
      problem.functionSpec &&
      supportsFunctionJudging(claimed.language)
    ) {
      try {
        const spec = parseFunctionSpec(problem.functionSpec);
        workerSourceCode = assembleFunctionSubmission(
          spec,
          claimed.language,
          claimed.sourceCode,
        ).source;
      } catch (assembleErr) {
        // A malformed stored spec must not crash the hot path or block the
        // queue. Fall back to the verbatim source; the submission will simply
        // fail to compile as the student wrote it, which is surfaced normally.
        logger.error(
          { err: assembleErr, submissionId: claimed.id, problemId: claimed.problemId },
          "[judge/claim] Function assembly failed; sending verbatim source",
        );
      }
    }

    return apiSuccess({
      ...claimed,
      sourceCode: workerSourceCode,
      timeLimitMs: adjustedTimeLimitMs,
      memoryLimitMb: problem.memoryLimitMb,
      comparisonMode: problem.comparisonMode ?? "exact",
      floatAbsoluteError: problem.floatAbsoluteError ?? null,
      floatRelativeError: problem.floatRelativeError ?? null,
      testCases: cases,
      runAllTestCases,
      // Language config overrides from DB (used by worker when present)
      dockerImage: langConfig?.dockerImage?.trim() || null,
      compileCommand: deserializeStoredJudgeCommand(langConfig?.compileCommand),
      runCommand: deserializeStoredJudgeCommand(langConfig?.runCommand),
    });
  } catch (error) {
    if (claimedForCleanup && claimTokenForCleanup) {
      await releaseClaimedSubmission(
        claimedForCleanup.id,
        claimTokenForCleanup,
        workerIdForCleanup,
      ).catch((cleanupError: unknown) => {
        logger.error(
          { err: cleanupError, submissionId: claimedForCleanup?.id },
          "POST /api/v1/judge/claim cleanup failed",
        );
      });
    }
    logger.error({ err: error }, "POST /api/v1/judge/claim error");
    return apiError("internalServerError", 500);
  }
}
