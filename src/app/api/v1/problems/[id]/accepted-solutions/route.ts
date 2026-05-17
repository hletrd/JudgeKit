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
    const whereClause = and(
      eq(submissions.problemId, id),
      eq(submissions.status, "accepted"),
      sql`${submissions.assignmentId} IS NULL`,
      language ? eq(submissions.language, language) : undefined,
    );

    const [countRow] = await db
      .select({ total: count() })
      .from(submissions)
      .where(whereClause);
    const total = Number(countRow?.total ?? 0);

    const orderByClause =
      sort === "shortest"
        ? [asc(sql<number>`octet_length(${submissions.sourceCode})`), desc(submissions.submittedAt)]
        : sort === "fastest"
          ? [asc(sql<number>`coalesce(${submissions.executionTimeMs}, 2147483647)`), desc(submissions.submittedAt)]
          : [desc(submissions.submittedAt)];

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
        shareAcceptedSolutions: users.shareAcceptedSolutions,
        acceptedSolutionsAnonymous: users.acceptedSolutionsAnonymous,
      })
      .from(submissions)
      .innerJoin(users, eq(submissions.userId, users.id))
      .where(whereClause)
      .orderBy(...orderByClause)
      .limit(pageSize)
      .offset(offset);

    return apiSuccess({
      solutions: solutions
        .filter((solution) => solution.shareAcceptedSolutions)
        .map((solution) => ({
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
