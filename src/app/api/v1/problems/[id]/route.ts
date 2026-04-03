import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db, sqlite } from "@/lib/db";
import { assignmentProblems, problems, submissions, testCases, problemTags, tags } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { forbidden, notFound, isAdmin, createApiHandler } from "@/lib/api/handler";
import { recordAuditEvent } from "@/lib/audit/events";
import { canAccessProblem } from "@/lib/auth/permissions";
import { updateProblemWithTestCases } from "@/lib/problem-management";
import { problemMutationSchema } from "@/lib/validators/problem-management";

const problemPatchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  sequenceNumber: z.number().int().min(1).nullable().optional(),
  timeLimitMs: z.number().int().min(100).max(30000).optional(),
  memoryLimitMb: z.number().int().min(16).max(1024).optional(),
  visibility: z.enum(["public", "private", "hidden"]).optional(),
  showCompileOutput: z.boolean().optional(),
  showDetailedResults: z.boolean().optional(),
  showRuntimeErrors: z.boolean().optional(),
  allowAiAssistant: z.boolean().optional(),
  comparisonMode: z.enum(["exact", "float"]).optional(),
  floatAbsoluteError: z.number().min(0).max(1).nullable().optional(),
  floatRelativeError: z.number().min(0).max(1).nullable().optional(),
  testCases: z.array(z.object({
    id: z.string().optional(),
    input: z.string(),
    expectedOutput: z.string(),
    sortOrder: z.number().int().optional(),
  })).optional(),
  tags: z.array(z.string().min(1).max(50)).max(20).optional(),
  allowLockedTestCases: z.boolean().optional(),
}).strict();

export const GET = createApiHandler({
  handler: async (req: NextRequest, { user, params }) => {
    const { id } = params;
    const problem = await db.query.problems.findFirst({ where: eq(problems.id, id) });
    if (!problem) return notFound("Problem");

    const hasAccess = await canAccessProblem(id, user.id, user.role);
    if (!hasAccess) return forbidden();

    const canManageProblem = isAdmin(user.role) || problem.authorId === user.id;

    if (!canManageProblem) {
      return apiSuccess(problem);
    }

    // Only fetch test cases for managers (single additional query instead of re-fetching problem)
    const problemTestCases = await db.query.testCases.findMany({
      where: eq(testCases.problemId, id),
    });

    return apiSuccess({ ...problem, testCases: problemTestCases });
  },
});

export const PATCH = createApiHandler({
  rateLimit: "problems:update",
  handler: async (req: NextRequest, { user, params }) => {
    const { id } = params;
    const problem = await db.query.problems.findFirst({ where: eq(problems.id, id) });
    if (!problem) return notFound("Problem");

    const isAuthor = problem.authorId === user.id;
    if (!isAuthor && !isAdmin(user.role)) return forbidden();

    const rawBody = await req.json();
    const parsedBody = problemPatchSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return apiError(parsedBody.error.issues[0]?.message ?? "invalidInput", 400);
    }
    const body = parsedBody.data;
    const allowLockedTestCases = Boolean(body.allowLockedTestCases);
    const existingTestCases = await db.query.testCases.findMany({
      where: eq(testCases.problemId, id),
    });
    const hasExistingSubmissions = Boolean(
      await db.query.submissions.findFirst({
        where: eq(submissions.problemId, id),
        columns: { id: true },
      })
    );

    if (body.testCases !== undefined && hasExistingSubmissions && !(allowLockedTestCases && isAdmin(user.role))) {
      return apiError("testCasesLocked", 409);
    }

    // Resolve existing tags if not provided in update
    let existingTagNames: string[] = [];
    if (body.tags === undefined) {
      const existingProblemTags = await db
        .select({ name: tags.name })
        .from(problemTags)
        .innerJoin(tags, eq(problemTags.tagId, tags.id))
        .where(eq(problemTags.problemId, id));
      existingTagNames = existingProblemTags.map((t) => t.name);
    }

    const parsedInput = problemMutationSchema.safeParse({
      title: body.title ?? problem.title,
      description: body.description ?? problem.description ?? "",
      sequenceNumber: body.sequenceNumber !== undefined ? body.sequenceNumber : problem.sequenceNumber ?? null,
      timeLimitMs: body.timeLimitMs ?? problem.timeLimitMs ?? 2000,
      memoryLimitMb: body.memoryLimitMb ?? problem.memoryLimitMb ?? 256,
      visibility: body.visibility ?? problem.visibility ?? "private",
      showCompileOutput: body.showCompileOutput ?? problem.showCompileOutput,
      showDetailedResults: body.showDetailedResults ?? problem.showDetailedResults,
      showRuntimeErrors: body.showRuntimeErrors ?? problem.showRuntimeErrors,
      allowAiAssistant: body.allowAiAssistant ?? problem.allowAiAssistant,
      comparisonMode: body.comparisonMode ?? problem.comparisonMode ?? "exact",
      floatAbsoluteError: body.floatAbsoluteError !== undefined ? body.floatAbsoluteError : problem.floatAbsoluteError ?? null,
      floatRelativeError: body.floatRelativeError !== undefined ? body.floatRelativeError : problem.floatRelativeError ?? null,
      testCases:
        body.testCases ??
        existingTestCases
          .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
          .map((testCase) => ({
            input: testCase.input,
            expectedOutput: testCase.expectedOutput,
            isVisible: testCase.isVisible ?? false,
          })),
      tags: body.tags ?? existingTagNames,
    });

    if (!parsedInput.success) {
      return apiError(parsedInput.error.issues[0]?.message ?? "updateError", 400);
    }

    await updateProblemWithTestCases(id, parsedInput.data, user.id);

    const updated = await db.query.problems.findFirst({
      where: eq(problems.id, id),
      with: {
        testCases: true,
      },
    });

    if (updated) {
      recordAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "problem.updated",
        resourceType: "problem",
        resourceId: updated.id,
        resourceLabel: updated.title,
        summary: `Updated problem \"${updated.title}\"`,
        details: {
          visibility: updated.visibility,
          timeLimitMs: updated.timeLimitMs,
          memoryLimitMb: updated.memoryLimitMb,
          testCasesChanged: body.testCases !== undefined,
          testCaseOverrideUsed: allowLockedTestCases && isAdmin(user.role),
          testCaseCount: updated.testCases.length,
        },
        request: req,
      });
    }

    return apiSuccess(updated);
  },
});

export const DELETE = createApiHandler({
  rateLimit: "problems:delete",
  handler: async (req: NextRequest, { user, params }) => {
    const { id } = params;
    const problem = await db.query.problems.findFirst({ where: eq(problems.id, id) });
    if (!problem) return notFound("Problem");

    const isAuthor = problem.authorId === user.id;
    if (!isAuthor && !isAdmin(user.role)) return forbidden();

    const force = req.nextUrl.searchParams.get("force") === "true";

    let blocked = false;
    sqlite.transaction(() => {
      const submissionCountRow = db
        .select({ total: sql<number>`count(${submissions.id})` })
        .from(submissions)
        .where(eq(submissions.problemId, id))
        .get() ?? { total: 0 };

      const assignmentLinkCountRow = db
        .select({ total: sql<number>`count(${assignmentProblems.id})` })
        .from(assignmentProblems)
        .where(eq(assignmentProblems.problemId, id))
        .get() ?? { total: 0 };

      const submissionCount = Number(submissionCountRow.total ?? 0);
      const assignmentLinkCount = Number(assignmentLinkCountRow.total ?? 0);

      if ((submissionCount > 0 || assignmentLinkCount > 0) && !(force && isAdmin(user.role))) {
        blocked = true;
        return;
      }

      db.delete(problems).where(eq(problems.id, id)).run();
    })();

    if (blocked) {
      return apiError("problemDeleteBlocked", 409);
    }

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "problem.deleted",
      resourceType: "problem",
      resourceId: problem.id,
      resourceLabel: problem.title,
      summary: `Deleted problem \"${problem.title}\"`,
      details: {
        visibility: problem.visibility,
      },
      request: req,
    });

    return apiSuccess({ id });
  },
});
