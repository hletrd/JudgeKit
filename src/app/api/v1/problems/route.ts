import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { problems, problemGroupAccess, enrollments } from "@/lib/db/schema";
import { eq, desc, sql, and, or, inArray } from "drizzle-orm";
import { getAssignedTeachingGroupIds } from "@/lib/assignments/management";
import { createApiHandler } from "@/lib/api/handler";
import { recordAuditEvent } from "@/lib/audit/events";
import { parsePagination } from "@/lib/api/pagination";
import { apiError, apiPaginated, apiSuccess } from "@/lib/api/responses";
import { createProblemWithTestCases } from "@/lib/problem-management";
import { problemCreateSchema, problemMutationSchema, problemVisibilityValues } from "@/lib/validators/problem-management";
import { resolveCapabilities } from "@/lib/capabilities/cache";

export const GET = createApiHandler({
  handler: async (req: NextRequest, { user }) => {
    const searchParams = req.nextUrl.searchParams;
    const { page, limit, offset } = parsePagination(searchParams);
    const visibility = searchParams.get("visibility");
    const caps = await resolveCapabilities(user.role);

    if (visibility && !problemVisibilityValues.includes(visibility as (typeof problemVisibilityValues)[number])) {
      return apiError("invalidVisibility", 400);
    }

    const visibilityFilter = visibility ? eq(problems.visibility, visibility) : undefined;

    // Org-wide admins (groups.view_all) see every problem. A problems.view_all
    // holder that is NOT an org-wide admin is scoped below to the groups they
    // teach, so an assistant/instructor cannot enumerate private problems
    // belonging to other groups.
    if (caps.has("groups.view_all")) {
      const [total] = await db
        .select({ count: sql<number>`count(*)` })
        .from(problems)
        .where(visibilityFilter);

      const results = await db
        .select({
          id: problems.id,
          sequenceNumber: problems.sequenceNumber,
          title: problems.title,
          timeLimitMs: problems.timeLimitMs,
          memoryLimitMb: problems.memoryLimitMb,
          problemType: problems.problemType,
          visibility: problems.visibility,
          showCompileOutput: problems.showCompileOutput,
          showDetailedResults: problems.showDetailedResults,
          showRuntimeErrors: problems.showRuntimeErrors,
          allowAiAssistant: problems.allowAiAssistant,
          comparisonMode: problems.comparisonMode,
          floatAbsoluteError: problems.floatAbsoluteError,
          floatRelativeError: problems.floatRelativeError,
          difficulty: problems.difficulty,
          defaultLanguage: problems.defaultLanguage,
          authorId: problems.authorId,
          createdAt: problems.createdAt,
          updatedAt: problems.updatedAt,
        })
        .from(problems)
        .where(visibilityFilter)
        // (createdAt desc, id desc) — total order so bulk-imported problems
        // with identical createdAt do not shuffle across offset pages (RPF
        // cycle-7 AGG7-2).
        .orderBy(desc(problems.createdAt), desc(problems.id))
        .limit(limit)
        .offset(offset);

      return apiPaginated(results, page, limit, Number(total?.count ?? 0));
    }

    let accessFilter;
    if (caps.has("problems.view_all")) {
      // Scoped proctor/author: public, self-authored, or linked to a group
      // they teach (group_instructors / groups.instructorId).
      const teachingGroupIds = await getAssignedTeachingGroupIds(user.id);
      const taughtProblemIds = teachingGroupIds.length > 0
        ? (
            await db
              .select({ problemId: problemGroupAccess.problemId })
              .from(problemGroupAccess)
              .where(inArray(problemGroupAccess.groupId, teachingGroupIds))
          ).map((row) => row.problemId)
        : [];
      accessFilter = or(
        eq(problems.visibility, "public"),
        eq(problems.authorId, user.id),
        taughtProblemIds.length > 0 ? inArray(problems.id, taughtProblemIds) : sql`false`
      );
    } else {
      accessFilter = or(
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
    }
    const whereClause = visibilityFilter ? and(accessFilter, visibilityFilter) : accessFilter;

    const [totalRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(problems)
      .where(whereClause);

    const paginatedProblems = await db
      .select({
          id: problems.id,
          sequenceNumber: problems.sequenceNumber,
          title: problems.title,
          timeLimitMs: problems.timeLimitMs,
          memoryLimitMb: problems.memoryLimitMb,
          problemType: problems.problemType,
          visibility: problems.visibility,
          showCompileOutput: problems.showCompileOutput,
          showDetailedResults: problems.showDetailedResults,
          showRuntimeErrors: problems.showRuntimeErrors,
          allowAiAssistant: problems.allowAiAssistant,
          comparisonMode: problems.comparisonMode,
          floatAbsoluteError: problems.floatAbsoluteError,
          floatRelativeError: problems.floatRelativeError,
          difficulty: problems.difficulty,
          defaultLanguage: problems.defaultLanguage,
          authorId: problems.authorId,
          createdAt: problems.createdAt,
          updatedAt: problems.updatedAt,
        })
      .from(problems)
      .where(whereClause)
      // (createdAt desc, id desc) — total order so bulk-imported problems with
      // identical createdAt do not shuffle across offset pages (RPF cycle-7
      // AGG7-2).
      .orderBy(desc(problems.createdAt), desc(problems.id))
      .limit(limit)
      .offset(offset);

    const total = Number(totalRow?.count ?? 0);

    return apiPaginated(paginatedProblems, page, limit, total);
  },
});

export const POST = createApiHandler({
  rateLimit: "problems:create",
  auth: { capabilities: ["problems.create"] },
  schema: problemCreateSchema,
  handler: async (req: NextRequest, { user, body }) => {
    // Function-judging fields are only meaningful for function problems; null
    // them out otherwise so a stale spec/reference can never be persisted.
    const isFunctionProblem = (body.problemType ?? "auto") === "function";
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
      comparisonMode: body.comparisonMode ?? "exact",
      floatAbsoluteError: body.floatAbsoluteError,
      floatRelativeError: body.floatRelativeError,
      difficulty: body.difficulty ?? null,
      defaultLanguage: body.defaultLanguage ?? null,
      functionSpec: isFunctionProblem ? body.functionSpec ?? null : null,
      referenceSolution: isFunctionProblem ? body.referenceSolution ?? null : null,
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
