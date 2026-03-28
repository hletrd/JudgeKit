import { NextRequest } from "next/server";
import { db, sqlite } from "@/lib/db";
import { examSessions, languageConfigs, problems, submissions } from "@/lib/db/schema";
import { isJudgeLanguage } from "@/lib/judge/languages";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { isAdmin } from "@/lib/api/auth";
import { consumeApiRateLimit } from "@/lib/security/api-rate-limit";
import { recordAuditEvent } from "@/lib/audit/events";
import { canAccessProblem } from "@/lib/auth/permissions";
import {
  getStudentAssignmentContextsForProblem,
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

export const GET = createApiHandler({
  handler: async (req: NextRequest, { user }) => {
    const searchParams = req.nextUrl.searchParams;
    const problemId = searchParams.get("problemId");
    const status = searchParams.get("status");
    const cursorParam = searchParams.get("cursor");

    if (status && !isSubmissionStatus(status)) {
      return apiError("invalidSubmissionStatus", 400);
    }

    // Design decision: students retain access to their own submission history
    // even after being removed from a group. This is intentional — students
    // should always be able to review their own past work.
    // See: docs/plan/security-v2-plan.md SEC2-M7
    const userFilter = isAdmin(user.role) ? undefined : eq(submissions.userId, user.id);
    const problemFilter = problemId ? eq(submissions.problemId, problemId) : undefined;
    const statusFilter = status ? eq(submissions.status, status) : undefined;

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

      const filters = [userFilter, problemFilter, statusFilter, cursorFilter].flatMap((f) =>
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
    const { page, limit, offset } = parsePagination(searchParams);

    const filters = [userFilter, problemFilter, statusFilter].flatMap((filter) =>
      filter ? [filter] : []
    );
    const whereClause =
      filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : and(...filters);

    const [totalRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(submissions)
      .where(whereClause);

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
      limit,
      offset,
    });

    return apiPaginated(results, page, limit, Number(totalRow?.count ?? 0));
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
    const [problem, languageConfig] = await Promise.all([
      db.query.problems.findFirst({
        where: eq(problems.id, problemId),
        columns: { id: true, title: true },
      }),
      db.query.languageConfigs.findFirst({
        where: and(
          eq(languageConfigs.language, language),
          eq(languageConfigs.isEnabled, true)
        ),
        columns: { id: true },
      }),
    ]);

    if (!problem) {
      return apiError("problemNotFound", 404);
    }

    if (!languageConfig) {
      return apiError("languageNotSupported", 400);
    }

    if (!normalizedAssignmentId && user.role === "student") {
      const assignmentContexts = await getStudentAssignmentContextsForProblem(problemId, user.id);

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
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

    // Atomic rate limit check + insert in a single transaction
    // Uses targeted queries with WHERE clauses instead of full table scan
    const maxPerMinute = getSubmissionRateLimitMaxPerMinute();
    const maxPending = getSubmissionMaxPending();
    const maxGlobalQueue = getSubmissionGlobalQueueLimit();
    const oneMinuteAgo = new Date(Date.now() - 60_000);

    type RateLimitError = { error: string; status: number; retryAfter: string };
    const txResult = sqlite.transaction(() => {
      // User-scoped counts (uses submissions_user_status_submitted_idx)
      const userCounts = sqlite.prepare(`
        SELECT
          SUM(CASE WHEN submitted_at > ? THEN 1 ELSE 0 END) AS recent_count,
          SUM(CASE WHEN status IN ('pending', 'judging', 'queued') THEN 1 ELSE 0 END) AS pending_count
        FROM submissions
        WHERE user_id = ?
      `).get(oneMinuteAgo.toISOString(), user.id) as { recent_count: number; pending_count: number } | undefined;

      const recentSubmissions = Number(userCounts?.recent_count ?? 0);
      const pendingCount = Number(userCounts?.pending_count ?? 0);

      if (recentSubmissions >= maxPerMinute) {
        return { error: "submissionRateLimited", status: 429, retryAfter: "60" } satisfies RateLimitError;
      }
      if (pendingCount >= maxPending) {
        return { error: "tooManyPendingSubmissions", status: 429, retryAfter: "10" } satisfies RateLimitError;
      }

      // Global pending count (uses submissions_status_idx)
      const globalRow = sqlite.prepare(`
        SELECT COUNT(*) AS count FROM submissions WHERE status IN ('pending', 'queued')
      `).get() as { count: number } | undefined;

      if (Number(globalRow?.count ?? 0) >= maxGlobalQueue) {
        return { error: "judgeQueueFull", status: 503, retryAfter: "30" } satisfies RateLimitError;
      }

      // For windowed exams, enforce deadline at insert time
      if (normalizedAssignmentId) {
        const expiredSession = sqlite.prepare(`
          SELECT 1 FROM exam_sessions
          WHERE assignment_id = ? AND user_id = ? AND personal_deadline < datetime('now')
        `).get(normalizedAssignmentId, user.id);
        if (expiredSession) {
          return { error: "examTimeExpired", status: 403, retryAfter: "0" } satisfies RateLimitError;
        }
      }

      // Insert the submission
      db.insert(submissions).values({
        id,
        userId: user.id,
        problemId,
        language,
        sourceCode,
        assignmentId: normalizedAssignmentId,
        status: "pending",
        ipAddress: ip,
        submittedAt: new Date(),
      }).run();

      return null; // success
    })();

    if (txResult) {
      return apiError(txResult.error, txResult.status, undefined, {
        headers: { "Retry-After": txResult.retryAfter },
      });
    }

    // Fetch the inserted submission for the response
    const [submission] = db.select({
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
    }).from(submissions).where(eq(submissions.id, id)).limit(1).all();

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

    return apiSuccess(submission, { status: 201 });
  },
});
