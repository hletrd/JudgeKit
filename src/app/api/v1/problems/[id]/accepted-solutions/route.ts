import { NextRequest } from "next/server";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { createApiHandler } from "@/lib/api/handler";
import { apiError, apiSuccess } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { problems, submissions, users } from "@/lib/db/schema";
import { normalizePage, normalizePageSize } from "@/lib/pagination";

const DEFAULT_SORT = "newest";
const VALID_SORTS = new Set(["shortest", "fastest", "newest"]);

export const GET = createApiHandler({
  auth: true,
  rateLimit: "accepted-solutions",
  handler: async (req: NextRequest, { params }) => {
    const { id } = params;
    const problem = await db.query.problems.findFirst({
      where: eq(problems.id, id),
      columns: {
        id: true,
        visibility: true,
      },
    });

    if (!problem || problem.visibility !== "public") {
      return apiError("notFound", 404);
    }

    const rawSort = req.nextUrl.searchParams.get("sort")?.trim() ?? DEFAULT_SORT;
    const sort = VALID_SORTS.has(rawSort) ? rawSort : DEFAULT_SORT;
    const language = req.nextUrl.searchParams.get("language")?.trim() ?? "";
    const page = normalizePage(req.nextUrl.searchParams.get("page") ?? undefined);
    const pageSize = normalizePageSize(req.nextUrl.searchParams.get("pageSize") ?? undefined);
    const offset = (page - 1) * pageSize;

    // Only direct practice submissions count. Submissions tied to an
    // assignment (contest, exam, homework) must never surface here even if
    // the underlying problem later becomes public — that would leak every
    // contest participant's code to peers as soon as a problem flips
    // visibility post-contest.
    //
    // sharedWithCommunity is the author's sharing preference SNAPSHOTTED at
    // submission time. Requiring it here (in addition to the author's current
    // shareAcceptedSolutions preference below) means turning sharing on only
    // exposes submissions made from that point forward — code submitted while
    // sharing was off (including everything before the 0039 privacy backfill
    // that switched sharing off platform-wide) stays private forever.
    const whereClause = and(
      eq(submissions.problemId, id),
      eq(submissions.status, "accepted"),
      sql`${submissions.assignmentId} IS NULL`,
      eq(submissions.sharedWithCommunity, true),
      language ? eq(submissions.language, language) : undefined,
    );

    // Count must apply the same shareAcceptedSolutions filter as the rendered
    // list below, otherwise `total` overcounts authors who opted out of
    // sharing and the UI shows "X results" with fewer rendered (C3-N7).
    const [countRow] = await db
      .select({ total: count() })
      .from(submissions)
      .innerJoin(users, eq(submissions.userId, users.id))
      .where(and(whereClause, eq(users.shareAcceptedSolutions, true)));
    const total = Number(countRow?.total ?? 0);

    // Every branch ends in the unique `id` so this offset-paged public listing
    // is deterministic — equal sort keys (same code length, same exec time, or
    // same submittedAt) would otherwise reorder across pages and drop/dup a
    // solution at a page seam (RPF cycle-9 AGG9-3).
    const orderByClause =
      sort === "shortest"
        ? [asc(sql<number>`octet_length(${submissions.sourceCode})`), desc(submissions.submittedAt), desc(submissions.id)]
        : sort === "fastest"
          ? [asc(sql<number>`coalesce(${submissions.executionTimeMs}, 2147483647)`), desc(submissions.submittedAt), desc(submissions.id)]
          : [desc(submissions.submittedAt), desc(submissions.id)];

    const solutions = await db
      .select({
        submissionId: submissions.id,
        userId: submissions.userId,
        username: users.username,
        language: submissions.language,
        sourceCode: submissions.sourceCode,
        codeLength: sql<number>`octet_length(${submissions.sourceCode})`,
        executionTimeMs: submissions.executionTimeMs,
        memoryUsedKb: submissions.memoryUsedKb,
        submittedAt: submissions.submittedAt,
        acceptedSolutionsAnonymous: users.acceptedSolutionsAnonymous,
      })
      .from(submissions)
      .innerJoin(users, eq(submissions.userId, users.id))
      // Apply the same shareAcceptedSolutions filter as the count query above
      // so the list matches `total` and pagination is computed entirely in SQL
      // (C4-N3). Previously the list SELECT used the unfiltered whereClause and
      // then JS-filtered, so non-sharing authors consumed pageSize/offset slots
      // and a page rendered fewer than pageSize solutions.
      .where(and(whereClause, eq(users.shareAcceptedSolutions, true)))
      .orderBy(...orderByClause)
      .limit(pageSize)
      .offset(offset);

    return apiSuccess({
      solutions: solutions.map((solution) => ({
          submissionId: solution.submissionId,
          // Anonymous solutions must not leak the author's userId; otherwise
          // the id alone could deanonymize via the user detail endpoint.
          userId: solution.acceptedSolutionsAnonymous ? null : solution.userId,
          username: solution.acceptedSolutionsAnonymous ? "" : solution.username,
          language: solution.language,
          sourceCode: solution.sourceCode,
          codeLength: solution.codeLength,
          executionTimeMs: solution.executionTimeMs,
          memoryUsedKb: solution.memoryUsedKb,
          submittedAt: solution.submittedAt,
          isAnonymous: Boolean(solution.acceptedSolutionsAnonymous),
        })),
      total,
      page,
      pageSize,
    });
  },
});
