import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { languageConfigs, problems, submissions } from "@/lib/db/schema";
import { isJudgeLanguage } from "@/lib/judge/languages";
import { and, desc, eq, gt, lt, sql } from "drizzle-orm";
import { getApiUser, unauthorized, isAdmin, csrfForbidden } from "@/lib/api/auth";
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
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const searchParams = request.nextUrl.searchParams;
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
  } catch (error) {
    logger.error({ err: error }, "GET /api/v1/submissions error");
    return apiError("submissionLoadFailed", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const csrfError = csrfForbidden(request);
    if (csrfError) return csrfError;

    const rateLimitResponse = consumeApiRateLimit(request, "submissions:create");
    if (rateLimitResponse) return rateLimitResponse;

    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const parsed = submissionCreateSchema.safeParse(await request.json());

    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "submissionCreateFailed", 400);
    }

    const { problemId, language, sourceCode } = parsed.data;
    const normalizedAssignmentId = parsed.data.assignmentId ?? null;

    if (!isJudgeLanguage(language)) {
      return apiError("languageNotSupported", 400);
    }

    // Submission rate limiting: per-user recent submissions
    const oneMinuteAgo = new Date(Date.now() - 60_000);
    const recentSubmissions = await db
      .select({ count: sql<number>`count(*)` })
      .from(submissions)
      .where(
        and(
          eq(submissions.userId, user.id),
          gt(submissions.submittedAt, oneMinuteAgo)
        )
      )
      .then((rows) => Number(rows[0]?.count ?? 0));

    if (recentSubmissions >= getSubmissionRateLimitMaxPerMinute()) {
      return apiError("submissionRateLimited", 429, undefined, {
        headers: { "Retry-After": "60" },
      });
    }

    // Per-user concurrency limit: max pending/judging submissions
    const pendingCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(submissions)
      .where(
        and(
          eq(submissions.userId, user.id),
          sql`${submissions.status} IN ('pending', 'judging', 'queued')`
        )
      )
      .then((rows) => Number(rows[0]?.count ?? 0));

    if (pendingCount >= getSubmissionMaxPending()) {
      return apiError("tooManyPendingSubmissions", 429, undefined, {
        headers: { "Retry-After": "10" },
      });
    }

    // Global queue depth limit
    const globalPendingCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(submissions)
      .where(sql`${submissions.status} IN ('pending', 'queued')`)
      .then((rows) => Number(rows[0]?.count ?? 0));

    if (globalPendingCount >= getSubmissionGlobalQueueLimit()) {
      return apiError("judgeQueueFull", 503, undefined, {
        headers: { "Retry-After": "30" },
      });
    }

    if (Buffer.byteLength(sourceCode, "utf8") > getMaxSourceCodeSizeBytes()) {
      return apiError("sourceCodeTooLarge", 413);
    }

    const problem = await db.query.problems.findFirst({
      where: eq(problems.id, problemId),
      columns: { id: true, title: true },
    });

    if (!problem) {
      return apiError("problemNotFound", 404);
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

    const languageConfig = await db.query.languageConfigs.findFirst({
      where: and(
        eq(languageConfigs.language, language),
        eq(languageConfigs.isEnabled, true)
      ),
      columns: {
        id: true,
      },
    });

    if (!languageConfig) {
      return apiError("languageNotSupported", 400);
    }

    const id = generateSubmissionId();
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const [submission] = await db.insert(submissions).values({
      id,
      userId: user.id,
      problemId,
      language,
      sourceCode,
      assignmentId: normalizedAssignmentId,
      status: "pending",
      ipAddress: ip,
      submittedAt: new Date(),
    }).returning({
      id: submissions.id,
      userId: submissions.userId,
      problemId: submissions.problemId,
      assignmentId: submissions.assignmentId,
      language: submissions.language,
      status: submissions.status,
      judgeClaimToken: submissions.judgeClaimToken,
      judgeClaimedAt: submissions.judgeClaimedAt,
      compileOutput: submissions.compileOutput,
      executionTimeMs: submissions.executionTimeMs,
      memoryUsedKb: submissions.memoryUsedKb,
      score: submissions.score,
      judgedAt: submissions.judgedAt,
      submittedAt: submissions.submittedAt,
    });

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
        request,
      });
    }

    return apiSuccess(submission, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "POST /api/v1/submissions error");
    return apiError("submissionCreateFailed", 500);
  }
}
