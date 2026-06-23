import { NextRequest } from "next/server";
import { extractClientIp } from "@/lib/security/ip";
import { db, execTransaction } from "@/lib/db";
import { antiCheatEvents, examSessions, languageConfigs, problems, submissions } from "@/lib/db/schema";
import { isJudgeLanguage } from "@/lib/judge/languages";
import { parseFunctionSpec } from "@/lib/judge/function-judging/types";
import { supportsFunctionJudging } from "@/lib/judge/function-judging/registry";
import { and, desc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/audit/events";
import { canAccessProblem } from "@/lib/auth/permissions";
import { logger } from "@/lib/logger";
import {
  getRequiredAssignmentContextsForProblem,
  validateAssignmentSubmission,
  type StaleHeartbeatProbeResult,
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

      // Decode cursor: new cursors embed {id, submittedAt} as base64 JSON;
      // old cursors are raw IDs (backward compatible).
      let cursorFilter: ReturnType<typeof lt> | ReturnType<typeof or> | undefined;
      let cursorId: string | undefined;
      if (cursor) {
        let cursorSubmittedAt: Date | undefined;
        try {
          const decoded = JSON.parse(Buffer.from(cursor, "base64").toString("utf-8"));
          if (decoded && typeof decoded === "object" && "t" in decoded && typeof decoded.t === "string") {
            cursorSubmittedAt = new Date(decoded.t);
            if ("id" in decoded && typeof decoded.id === "string") {
              cursorId = decoded.id;
            }
          }
        } catch {
          // Not a base64-encoded cursor — fall back to DB lookup for backward
          // compatibility with cursors generated before this change.
          cursorId = cursor;
          const cursorRow = await db.query.submissions.findFirst({
            where: eq(submissions.id, cursor),
            columns: { submittedAt: true },
          });
          cursorSubmittedAt = cursorRow?.submittedAt;
        }
        if (cursorSubmittedAt) {
          if (cursorId) {
            // Use a tuple-style comparison: get rows that are strictly before
            // (submittedAt, id) to handle same-timestamp submissions correctly.
            cursorFilter = or(
              lt(submissions.submittedAt, cursorSubmittedAt),
              and(
                eq(submissions.submittedAt, cursorSubmittedAt),
                lt(submissions.id, cursorId)
              )
            );
          } else {
            cursorFilter = lt(submissions.submittedAt, cursorSubmittedAt);
          }
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
        orderBy: [desc(submissions.submittedAt), desc(submissions.id)],
        limit: limit + 1,
      });

      const hasMore = results.length > limit;
      const pageResults = hasMore ? results.slice(0, limit) : results;
      // Encode the next cursor with both id and submittedAt to eliminate the
      // N+1 lookup query on the next page request.
      const lastResult = pageResults[pageResults.length - 1];
      const nextCursor = hasMore && lastResult?.submittedAt
        ? Buffer.from(JSON.stringify({ id: lastResult.id, t: lastResult.submittedAt.toISOString() }), "utf-8").toString("base64")
        : undefined;

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
      // (submittedAt, id) — same total order as cursor mode (RPF cycle-6
      // AGG6-5): same-timestamp rows otherwise shuffle across pages, so a
      // burst submitter could see an entry duplicated or missing at a page
      // boundary.
      .orderBy(desc(submissions.submittedAt), desc(submissions.id))
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
    let normalizedAssignmentId = body.assignmentId ?? null;

    if (!isJudgeLanguage(language)) {
      return apiError("languageNotSupported", 400);
    }

    if (Buffer.byteLength(sourceCode, "utf8") > getMaxSourceCodeSizeBytes()) {
      return apiError("sourceCodeTooLarge", 413);
    }

    // Fetch problem and language config in parallel
    const [[problem], [languageConfig]] = await Promise.all([
      db
        .select({ id: problems.id, title: problems.title, problemType: problems.problemType, showCompileOutput: problems.showCompileOutput, functionSpec: problems.functionSpec })
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

    // Function-judging problems are restricted to the languages the author
    // enabled in their functionSpec AND for which a harness adapter exists.
    // Without this gate a registry-supported-but-not-enabled language (e.g.
    // java on a python-only problem) would be accepted and judged, and a
    // language with no adapter would fall through to a confusing verbatim-
    // source failure (M1/M2).
    if (problem.problemType === "function") {
      let functionSpec;
      try {
        functionSpec = parseFunctionSpec(problem.functionSpec);
      } catch (error) {
        logger.error(
          { err: error, problemId },
          "[submissions] Function problem has invalid functionSpec",
        );
        return apiError("functionSpecInvalid", 409);
      }
      if (
        !functionSpec.enabledLanguages.includes(language) ||
        !supportsFunctionJudging(language)
      ) {
        return apiError("languageNotEnabledForProblem", 400);
      }
    }

    if (!normalizedAssignmentId) {
      const assignmentContexts = await getRequiredAssignmentContextsForProblem(
        problemId,
        user.id,
        user.role
      );

      if (assignmentContexts.length === 1) {
        // Single context — auto-route to it so the user does not have to
        // navigate back to the assignment page to record progress on the
        // correct assignment. validateAssignmentSubmission below still
        // enforces the assignment's submission window and exam state, so a
        // closed or not-yet-open assignment still surfaces the proper error.
        normalizedAssignmentId = assignmentContexts[0].assignmentId;
      } else if (assignmentContexts.length > 1) {
        // Ambiguous: the problem belongs to more than one assignment the
        // user can submit through. Surface the list to the UI so the user
        // can pick deliberately — auto-routing would attribute the
        // submission to the wrong context.
        return apiError("assignmentContextRequired", 409);
      }
    }

    // Verdict of the anti-cheat freshness probe, recorded as an escalate
    // flag ONLY after the submission insert succeeds (RPF cycle-5 AGG5-1):
    // a flag must always reference an ACCEPTED submission — attempts that
    // are rejected below (problem access, rate limits, queue caps, expired
    // exam session) must never fabricate escalate-tier evidence.
    let staleHeartbeatProbe: StaleHeartbeatProbeResult | null = null;

    if (normalizedAssignmentId) {
      const assignmentValidation = await validateAssignmentSubmission(
        normalizedAssignmentId,
        problemId,
        user.id,
        user.role,
        // This is the ONLY caller that probes monitor freshness — an actual
        // submission with no live monitor is the signal; page renders and
        // autosaves validate without probing (AGG4-1/AGG5-1).
        { probeStaleHeartbeat: true }
      );

      if (!assignmentValidation.ok) {
        return apiError(assignmentValidation.error, assignmentValidation.status);
      }

      staleHeartbeatProbe = assignmentValidation.staleHeartbeat ?? null;
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

    // Fetch DB server time outside the transaction for clock-skew safety.
    // The time is only used for rate-limit window calculation and the
    // submittedAt timestamp, neither of which needs transaction isolation.
    const dbNow = await getDbNowUncached();
    const oneMinuteAgo = new Date(dbNow.getTime() - 60_000);

    const txResult = await execTransaction(async (tx) => {

      // Acquire advisory lock on user ID to serialize concurrent submissions.
      // Use hashtextextended (PG 14+) for 64-bit hash space to minimize collisions.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${user.id}, 0)::bigint)`);

      const [recentRow] = await tx
        .select({ count: sql<number>`COUNT(*)` })
        .from(submissions)
        .where(
          and(
            eq(submissions.userId, user.id),
            gt(submissions.submittedAt, oneMinuteAgo),
          ),
        );

      const recentSubmissions = Number(recentRow?.count ?? 0);

      if (recentSubmissions >= maxPerMinute) {
        return { error: "submissionRateLimited" as const, status: 429, retryAfter: "60" };
      }

      // Skip judge queue checks for manual problems (no judging needed)
      if (!isManualProblem) {
        const [pendingRow] = await tx
          .select({ count: sql<number>`COUNT(*)` })
          .from(submissions)
          .where(
            and(
              eq(submissions.userId, user.id),
              inArray(submissions.status, ["pending", "judging", "queued"]),
            ),
          );
        const pendingCount = Number(pendingRow?.count ?? 0);

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

    // The submission is now ACCEPTED — record the stale-heartbeat escalate
    // flag if the freshness probe missed (RPF cycle-5 AGG5-1). The flag row
    // is self-describing evidence: it links the exact submission id and the
    // submitting IP, and uses DB time so it sorts truthfully among the
    // DB-timestamped heartbeat/event rows. Fail OPEN: a 403 here destroyed
    // honest candidates' work on flaky networks at the deadline, and an open
    // decoy tab defeats a hard block anyway — the control's value is the
    // evidence trail for human review (docs/exam-integrity-model.md).
    if (staleHeartbeatProbe && normalizedAssignmentId) {
      await db
        .insert(antiCheatEvents)
        .values({
          assignmentId: normalizedAssignmentId,
          userId: user.id,
          eventType: "submission_stale_heartbeat",
          details: JSON.stringify({
            ...staleHeartbeatProbe,
            submissionId: id,
          }),
          ipAddress: ip,
          createdAt: dbNow,
        })
        .catch((error: unknown) => {
          // Never let flag-recording failure block an honest submission.
          logger.warn(
            { err: error, assignmentId: normalizedAssignmentId, submissionId: id, userId: user.id },
            "[anti-cheat] failed to record stale-heartbeat submission flag",
          );
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
    // Users with submissions.view_all (instructors/admins) can always see
    // compile output regardless of the problem setting, matching the behavior
    // of sanitizeSubmissionForViewer in the detail endpoint.
    const postCaps = await resolveCapabilities(user.role);
    if (submission && !postCaps.has("submissions.view_all") && problem.showCompileOutput === false) {
      submission.compileOutput = null;
    }

    return apiSuccess(submission, { status: 201 });
  },
});
