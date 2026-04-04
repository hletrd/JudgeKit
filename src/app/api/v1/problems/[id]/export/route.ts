import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { apiSuccess } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { problems, testCases, problemTags, tags } from "@/lib/db/schema";
import { createApiHandler, forbidden, notFound } from "@/lib/api/handler";
import { canAccessProblem } from "@/lib/auth/permissions";

export const GET = createApiHandler({
  handler: async (_req: NextRequest, { user, params }) => {
    const { id } = params;

    const problem = await db.query.problems.findFirst({
      where: eq(problems.id, id),
      columns: {
        title: true,
        description: true,
        sequenceNumber: true,
        timeLimitMs: true,
        memoryLimitMb: true,
        visibility: true,
        showCompileOutput: true,
        showDetailedResults: true,
        showRuntimeErrors: true,
        allowAiAssistant: true,
        comparisonMode: true,
        floatAbsoluteError: true,
        floatRelativeError: true,
        difficulty: true,
      },
    });

    if (!problem) return notFound("Problem");

    const hasAccess = await canAccessProblem(id, user.id, user.role);
    if (!hasAccess) return forbidden();

    const cases = await db
      .select({
        input: testCases.input,
        expectedOutput: testCases.expectedOutput,
        isVisible: testCases.isVisible,
        sortOrder: testCases.sortOrder,
      })
      .from(testCases)
      .where(eq(testCases.problemId, id))
      .orderBy(testCases.sortOrder);

    const tagRows = await db
      .select({ name: tags.name })
      .from(problemTags)
      .innerJoin(tags, eq(problemTags.tagId, tags.id))
      .where(eq(problemTags.problemId, id));

    return apiSuccess({
      version: 1,
      problem: {
        ...problem,
        tags: tagRows.map((t) => t.name),
        testCases: cases,
      },
    });
  },
});
