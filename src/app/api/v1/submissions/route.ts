import { NextRequest } from "next/server";
import { extractClientIp } from "@/lib/security/ip";
import { db, execTransaction } from "@/lib/db";
import { examSessions, languageConfigs, problems, submissions } from "@/lib/db/schema";
import { isJudgeLanguage } from "@/lib/judge/languages";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/audit/events";
import { canAccessProblem } from "@/lib/auth/permissions";
import {
  getRequiredAssignmentContextsForProblem,
  validateAssignmentSubmission,
} from "@/lib/assignments/submissions";
import {
  getMaxSourceCodeSizeBytes,
  getSubmissionRateLimitMaxPerMinute,
  getSubmissionMaxPending,
  getSubmissionGlobalQueueLimit,
  isSubmissionStatus,
} from "@/lib/security/constants";
import { generateSubmissionId } from "@/lib/submissions/id";
import { submissionCreateSchema } from "@/lib/validators/api";
import { parsePagination, parseCursorParams } from "@/lib/api/pagination";
import { apiError, apiPaginated, apiSuccess } from "@/lib/api/responses";
import { createApiHandler } from "@/lib/api/handler";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { getDbNowUncached } from "@/lib/db-time";

export const GET = createApiHandler({
  handler: async (req: NextRequest, { user }) => {
    const searchParams = req.nextUrl.searchParams;
    const problemId = searchParams.get("problemId");
    const status = searchParams.get("status");
    const cursorParam = searchParams.get("cursor");
    const assignmentId = searchParams.get("assignmentId");
    const includeSummary = searchParams.get("includeSummary") === "1";
    const caps = await resolveCapabilities(user.role);

    if (status && !isSubmissionStatus(status)) {
      return apiError("invalidSubmissionStatus", 400);
    }

    // Design decision: students retain access to their own submission history
    // even after being removed from a group. This is intentional — students
    // should always be able to review their own past work.
    // See: docs/plan/security-v2-plan.md SEC2-M7
    const userFilter = caps.has("submissions.view_all") ? undefined : eq(submissions.userId, user.id);
    const problemFilter = problemId ? eq(submissions.problemId, problemId) : undefined;
    const statusFilter = status ? eq(submissions.status, status) : undefined;
    const assignmentFilter = assignmentId ? eq(submissions.assignmentId, assignmentId) : undefined;

    if (cursorParam !== null) {
      // Cursor-based pagination mode
      const { cursor, limit } = parseCursorParams({
        cursor: cursorParam,
        limit: searchParams.get("limit") ?? undefined,
      });

      // Resolve the submittedAt of the cursor submission to page backwards
      let cursorFilter: ReturnType<typeof lt> | undefined;
      if (cursor) {
        const cursorRow = await db.query.submissions.findFirst({
          where: eq(submissions.id, cursor),
          columns: { submittedAt: true },
        });
        if (cursorRow?.submittedAt) {
          cursorFilter = lt(submissions.submittedAt, cursorRow.submittedAt);
        }
      }

      const filters = [userFilter, problemFilter, statusFilter, assignmentFilter, cursorFilter].flatMap((f) =>
        f ? [f] : []
      );
      const whereClause =
        filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : and(...filters);

      // Fetch limit + 1 to detect if there is a next page
      const results = await db.query.submissions.findMany({
        where: whereClause,
        columns: {
          id: true,
          userId: true,
          problemId: true,
          assignmentId: true,
          language: true,
          status: true,
          executionTimeMs: true,
          memoryUsedKb: true,
          score: true,
          judgedAt: true,
          submittedAt: true,
        },
        orderBy: [desc(submissions.submittedAt)],
        limit: limit + 1,
      });

      const hasMore = results.length > limit;
      const pageResults = hasMore ? results.slice(0, limit) : results;
      const nextCursor = hasMore ? pageResults[pageResults.length - 1]?.id : undefined;

      return apiSuccess({ data: pageResults, nextCursor: nextCursor ?? null });
    }

    // Offset-based pagination mode (default, backward compatible)
    // Uses COUNT(*) OVER() window function in a single query to avoid
    // count/data inconsistency under concurrent writes.
    const { page, limit, offset } = parsePagination(searchParams);

    const filters = [userFilter, problemFilter, statusFilter, assignmentFilter].flatMap((filter) =>
      filter ? [filter] : []
    );
    const whereClause =
      filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : and(...filters);

    const results = await db
      .select({
        id: submissions.id,
        userId: submissions.userId,
        problemId: submissions.problemId,
        assignmentId: submissions.assignmentId,
        language: submissions.language,
        status: submissions.status,
        executionTimeMs: submissions.executionTimeMs,
        memoryUsedKb: submissions.memoryUsedKb,
        score: submissions.score,
        judgedAt: submissions.judgedAt,
        submittedAt: submissions.submittedAt,
        _total: sql<number>`count(*) over()`,
      })
      .from(submissions)
      .where(whereClause)
      .orderBy(desc(submissions.submittedAt))
      .limit(limit)
      .offset(offset);

    const total = results.length > 0 ? Number(results[0]._total) : 0;
    // Strip the internal _total field from the response
    const cleanResults = results.map(({ _total, ...rest }) => rest);

    if (includeSummary) {
      const grouped = await db
        .select({
          status: submissions.status,
          count: sql<number>`count(*)`,
        })
        .from(submissions)
        .where(whereClause)
        .groupBy(submissions.status);

      const summary = Object.fromEntries(
        grouped.map((row) => [row.status, Number(row.count ?? 0)])
      );

      return apiSuccess({
        submissions: cleanResults,
        page,
        limit,
        total,
        summary,
      });
    }

    return apiPaginated(cleanResults, page, limit, total);
  },
});

export const POST = createApiHandler({
  rateLimit: "submissions:create",
  schema: submissionCreateSchema,
  handler: async (req: NextRequest, { user, body }) => {
    const { problemId, language, sourceCode } = body;
    const normalizedAssignmentId = body.assignmentId ?? null;

    if (!isJudgeLanguage(language)) {
      return apiError("languageNotSupported", 400);
    }

    if (Buffer.byteLength(sourceCode, "utf8") > getMaxSourceCodeSizeBytes()) {
      return apiError("sourceCodeTooLarge", 413);
    }

    // Fetch problem and language config in parallel
    const [[problem], [languageConfig]] = await Promise.all([
      db
        .select({ id: problems.id, title: problems.title, problemType: problems.problemType, showCompileOutput: problems.showCompileOutput })
        .from(problems)
        .where(eq(problems.id, problemId))
        .limit(1),
      db
        .select({ id: languageConfigs.id })
        .from(languageConfigs)
        .where(and(
          eq(languageConfigs.language, language),
          eq(languageConfigs.isEnabled, true)
        ))
        .limit(1),
    ]);

    if (!problem) {
      return apiError("problemNotFound", 404);
    }

    if (!languageConfig) {
      return apiError("languageNotSupported", 400);
    }

    if (!normalizedAssignmentId) {
      const assignmentContexts = await getRequiredAssignmentContextsForProblem(
        problemId,
        user.id,
        user.role
      );

      if (assignmentContexts.length > 0) {
        return apiError("assignmentContextRequired", 409);
      }
    }

    if (normalizedAssignmentId) {
      const assignmentValidation = await validateAssignmentSubmission(
        normalizedAssignmentId,
        problemId,
        user.id,
        user.role
      );

      if (!assignmentValidation.ok) {
        return apiError(assignmentValidation.error, assignmentValidation.status);
      }
    }

    const hasAccess = await canAccessProblem(problemId, user.id, user.role);

    if (!hasAccess) {
      return apiError("forbidden", 403);
    }

    const id = generateSubmissionId();
    const ip = extractClientIp(req.headers);
    const isManualProblem = problem.problemType === "manual";
    const initialStatus = isManualProblem ? "submitted" : "pending";

    // Atomic rate limit check + insert in a single transaction
    // Uses SELECT FOR UPDATE to prevent concurrent submissions from bypassing limits
    const maxPerMinute = getSubmissionRateLimitMaxPerMinute();
    const maxPending = getSubmissionMaxPending();
    const maxGlobalQueue = getSubmissionGlobalQueueLimit();

    const txResult = await execTransaction(async (tx) => {
      // Use DB server time for the rate-limit window to avoid clock skew
      // between app and DB servers, consistent with other schedule checks.
      const dbNow = await getDbNowUncached();
      const oneMinuteAgo = new Date(dbNow.getTime() - 60_000);

      // Acquire advisory lock on user ID to serialize concurrent submissions
      await tx.execute(sql`SELECT pg_advisory_xact_lock(('x' || md5(${user.id}))::bit(64)::bigint)`);

      // Rate-limit checks with row-level advisory lock on user submissions
      const userCounts = await tx
        .select({
          recentCount: sql<number>`SUM(CASE WHEN ${submissions.submittedAt} > ${oneMinuteAgo} THEN 1 ELSE 0 END)`,
          pendingCount: sql<number>`SUM(CASE WHEN ${submissions.status} IN ('pending', 'judging', 'queued') THEN 1 ELSE 0 END)`,
        })
        .from(submissions)
        .where(eq(submissions.userId, user.id));

      const recentSubmissions = Number(userCounts[0]?.recentCount ?? 0);
      const pendingCount = Number(userCounts[0]?.pendingCount ?? 0);

      if (recentSubmissions >= maxPerMinute) {
        return { error: "submissionRateLimited" as const, status: 429, retryAfter: "60" };
      }

      // Skip judge queue checks for manual problems (no judging needed)
      if (!isManualProblem) {
        if (pendingCount >= maxPending) {
          return { error: "tooManyPendingSubmissions" as const, status: 429, retryAfter: "10" };
        }

        // Global pending count
        const globalRow = await tx
          .select({ count: sql<number>`COUNT(*)` })
          .from(submissions)
          .where(sql`${submissions.status} IN ('pending', 'queued')`);

        if (Number(globalRow[0]?.count ?? 0) >= maxGlobalQueue) {
          return { error: "judgeQueueFull" as const, status: 503, retryAfter: "30" };
        }
      }

      // For windowed exams, enforce deadline at insert time using DB server time
      // to avoid clock skew between the app server and DB server. Compare
      // personalDeadline against NOW() directly in SQL so the DB engine uses
      // its own clock — no round-trip timestamp parameter needed.
      if (normalizedAssignmentId) {
        const expiredSession = await tx
          .select({ one: sql<number>`1` })
          .from(examSessions)
          .where(
            and(
              eq(examSessions.assignmentId, normalizedAssignmentId),
              eq(examSessions.userId, user.id),
              sql`${examSessions.personalDeadline} < NOW()`,
            )
          )
          .limit(1);
        if (expiredSession.length > 0) {
          return { error: "examTimeExpired" as const, status: 403, retryAfter: "0" };
        }
      }

      // Insert the submission inside the same transaction
      await tx.insert(submissions).values({
        id,
        userId: user.id,
        problemId,
        language,
        sourceCode,
        assignmentId: normalizedAssignmentId,
        status: initialStatus,
        ipAddress: ip,
        submittedAt: dbNow,
      });

      return null; // success
    });

    if (txResult) {
      return apiError(txResult.error, txResult.status, undefined, {
        headers: { "Retry-After": txResult.retryAfter },
      });
    }

    // Fetch the inserted submission for the response
    const [submission] = await db.select({
      id: submissions.id,
      userId: submissions.userId,
      problemId: submissions.problemId,
      assignmentId: submissions.assignmentId,
      language: submissions.language,
      status: submissions.status,
      compileOutput: submissions.compileOutput,
      executionTimeMs: submissions.executionTimeMs,
      memoryUsedKb: submissions.memoryUsedKb,
      score: submissions.score,
      judgedAt: submissions.judgedAt,
      submittedAt: submissions.submittedAt,
    }).from(submissions).where(eq(submissions.id, id)).limit(1);

    if (submission) {
      recordAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "submission.created",
        resourceType: "submission",
        resourceId: submission.id,
        resourceLabel: submission.id,
        summary: `Created submission ${submission.id} for "${problem.title}"`,
        details: {
          assignmentId: normalizedAssignmentId,
          language,
          problemId: problem.id,
          problemTitle: problem.title,
        },
        request: req,
      });
    }

    // Strip compileOutput when the problem has showCompileOutput=false.
    // The submission owner created the code so they can see compile errors,
    // but the problem's visibility setting takes precedence — if the instructor
    // disabled compile output, even the submitter should not see it in the
    // API response. See C9-2 (cycle 9 review).
    if (submission && problem.showCompileOutput === false) {
      submission.compileOutput = null;
    }

    return apiSuccess(submission, { status: 201 });
  },
});
