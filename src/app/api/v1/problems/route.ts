import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { problems, problemGroupAccess, enrollments } from "@/lib/db/schema";
import { eq, desc, sql, and, or } from "drizzle-orm";
import { forbidden, isAdmin, isInstructor, createApiHandler } from "@/lib/api/handler";
import { recordAuditEvent } from "@/lib/audit/events";
import { parsePagination } from "@/lib/api/pagination";
import { apiError, apiPaginated, apiSuccess } from "@/lib/api/responses";
import { createProblemWithTestCases } from "@/lib/problem-management";
import { problemMutationSchema, problemVisibilityValues } from "@/lib/validators/problem-management";

export const GET = createApiHandler({
  handler: async (req: NextRequest, { user }) => {
    const searchParams = req.nextUrl.searchParams;
    const { page, limit, offset } = parsePagination(searchParams);
    const visibility = searchParams.get("visibility");

    if (visibility && !problemVisibilityValues.includes(visibility as (typeof problemVisibilityValues)[number])) {
      return apiError("invalidVisibility", 400);
    }

    const visibilityFilter = visibility ? eq(problems.visibility, visibility) : undefined;

    if (isAdmin(user.role)) {
      const [total] = await db
        .select({ count: sql<number>`count(*)` })
        .from(problems)
        .where(visibilityFilter);

      const results = await db
        .select()
        .from(problems)
        .where(visibilityFilter)
        .orderBy(desc(problems.createdAt))
        .limit(limit)
        .offset(offset);

      return apiPaginated(results, page, limit, Number(total?.count ?? 0));
    }

    const accessFilter = or(
      eq(problems.visibility, "public"),
      eq(problems.authorId, user.id),
      sql`exists (
        select 1
        from ${problemGroupAccess}
        inner join ${enrollments}
          on ${problemGroupAccess.groupId} = ${enrollments.groupId}
        where ${problemGroupAccess.problemId} = ${problems.id}
          and ${enrollments.userId} = ${user.id}
      )`
    );
    const whereClause = visibilityFilter ? and(accessFilter, visibilityFilter) : accessFilter;

    const [totalRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(problems)
      .where(whereClause);

    const paginatedProblems = await db
      .select()
      .from(problems)
      .where(whereClause)
      .orderBy(desc(problems.createdAt))
      .limit(limit)
      .offset(offset);

    const total = Number(totalRow?.count ?? 0);

    return apiPaginated(paginatedProblems, page, limit, total);
  },
});

export const POST = createApiHandler({
  rateLimit: "problems:create",
  handler: async (req: NextRequest, { user }) => {
    if (!isInstructor(user.role)) return forbidden();

    const body = await req.json();
    const parsedInput = problemMutationSchema.safeParse({
      title: body.title,
      description: body.description ?? "",
      sequenceNumber: body.sequenceNumber ?? null,
      problemType: body.problemType ?? "auto",
      timeLimitMs: body.timeLimitMs ?? 2000,
      memoryLimitMb: body.memoryLimitMb ?? 256,
      visibility: body.visibility ?? "private",
      showCompileOutput: body.showCompileOutput,
      showDetailedResults: body.showDetailedResults,
      showRuntimeErrors: body.showRuntimeErrors,
      allowAiAssistant: body.allowAiAssistant,
      comparisonMode: body.comparisonMode,
      floatAbsoluteError: body.floatAbsoluteError,
      floatRelativeError: body.floatRelativeError,
      difficulty: body.difficulty ?? null,
      defaultLanguage: body.defaultLanguage ?? null,
      testCases: body.testCases ?? [],
      tags: body.tags ?? [],
    });

    if (!parsedInput.success) {
      return apiError(parsedInput.error.issues[0]?.message ?? "createError", 400);
    }

    const id = await createProblemWithTestCases(parsedInput.data, user.id);

    // Cannot use .returning() here because the response needs the testCases
    // relation via a join that .returning() cannot provide.
    const problem = await db.query.problems.findFirst({
      where: eq(problems.id, id),
      with: {
        testCases: true,
      },
    });

    if (problem) {
      recordAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "problem.created",
        resourceType: "problem",
        resourceId: problem.id,
        resourceLabel: problem.title,
        summary: `Created problem \"${problem.title}\"`,
        details: {
          visibility: problem.visibility,
          timeLimitMs: problem.timeLimitMs,
          memoryLimitMb: problem.memoryLimitMb,
          testCaseCount: problem.testCases.length,
        },
        request: req,
      });
    }

    return apiSuccess(problem, { status: 201 });
  },
});
