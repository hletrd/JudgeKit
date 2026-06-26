import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db, execTransaction } from "@/lib/db";
import { assignmentProblems, problems, submissions, testCases, problemTags, tags } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { forbidden, notFound, createApiHandler } from "@/lib/api/handler";
import { recordAuditEvent } from "@/lib/audit/events";
import { canAccessProblem, canManageProblem } from "@/lib/auth/permissions";
import { mergeTestCasePatchIntoExisting, updateProblemWithTestCases } from "@/lib/problem-management";
import { problemMutationSchema, referenceSolutionSchema } from "@/lib/validators/problem-management";
import { functionSpecSchema } from "@/lib/judge/function-judging/types";
import { resolveCapabilities } from "@/lib/capabilities/cache";

const problemPatchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  sequenceNumber: z.number().int().min(0).nullable().optional(),
  problemType: z.enum(["auto", "manual", "function"]).optional(),
  functionSpec: functionSpecSchema.nullable().optional(),
  referenceSolution: referenceSolutionSchema.nullable().optional(),
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
  difficulty: z.number().min(0).max(10).nullable().optional(),
  defaultLanguage: z.string().max(50).nullable().optional(),
  testCases: z.array(z.object({
    id: z.string().optional(),
    input: z.string().optional(),
    expectedOutput: z.string().optional(),
    isVisible: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  })).optional(),
  tags: z.array(z.string().min(1).max(50)).max(20).optional(),
  allowLockedTestCases: z.boolean().optional(),
}).strict();

export const GET = createApiHandler({
  handler: async (req: NextRequest, { user, params }) => {
    const { id } = params;

    // Minimal fetch for access check — avoid loading full row before authorization
    const problemStub = await db.query.problems.findFirst({
      where: eq(problems.id, id),
      columns: { id: true, authorId: true, visibility: true },
    });
    if (!problemStub) return notFound("Problem");

    const hasAccess = await canAccessProblem(id, user.id, user.role);
    if (!hasAccess) return forbidden();

    // Strict group-scoped management gate (mirrors PATCH/DELETE). The local
    // capability/author check alone is insufficient: a problems.edit holder
    // outside the problem's teaching group must not read referenceSolution or
    // hidden test cases. The imported canManageProblem also enforces that
    // teaching-group scope (and groups.view_all), so route the hidden-data
    // decision through it rather than the looser local boolean.
    const canManage = await canManageProblem(id, user.id, user.role);

    // Full fetch only after access is confirmed
    const problem = await db.query.problems.findFirst({ where: eq(problems.id, id) });
    if (!problem) return notFound("Problem");

    if (!canManage) {
      // SECURITY: referenceSolution is author-only and must never reach a
      // student-facing read. functionSpec stays — it drives the student's
      // stub + language list.
      const { referenceSolution: _referenceSolution, ...studentVisible } = problem;
      void _referenceSolution;
      return apiSuccess(studentVisible);
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
  schema: problemPatchSchema,
  handler: async (req: NextRequest, { user, params, body }) => {
    const { id } = params;
    const problem = await db.query.problems.findFirst({ where: eq(problems.id, id) });
    if (!problem) return notFound("Problem");
    const caps = await resolveCapabilities(user.role);

    const isAuthor = problem.authorId === user.id;
    const canEditProblem = caps.has("problems.edit");
    const canBypassLockedTestCases = caps.has("problems.delete");
    if (!isAuthor && !canEditProblem) return forbidden();
    // Group-scope the write: a non-admin holder may only mutate a problem they
    // authored or that is linked to a group they teach (mirrors canAccessProblem
    // on the read path). Without this, any problems.edit holder could rewrite
    // another group's private/exam problem — including its hidden test cases.
    if (!(await canManageProblem(id, user.id, user.role))) return forbidden();
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

    if (body.testCases !== undefined && hasExistingSubmissions && !(allowLockedTestCases && canBypassLockedTestCases)) {
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

    // Function-judging fields are only meaningful for function problems; null
    // them out otherwise so a stale spec/reference can never be persisted.
    const effectiveProblemType = body.problemType ?? problem.problemType ?? "auto";
    const isFunctionProblem = effectiveProblemType === "function";
    const parsedInput = problemMutationSchema.safeParse({
      title: body.title ?? problem.title,
      description: body.description ?? problem.description ?? "",
      sequenceNumber: body.sequenceNumber !== undefined ? body.sequenceNumber : problem.sequenceNumber ?? null,
      problemType: body.problemType ?? problem.problemType ?? "auto",
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
      difficulty: body.difficulty !== undefined ? body.difficulty : problem.difficulty ?? null,
      defaultLanguage: body.defaultLanguage !== undefined ? body.defaultLanguage : problem.defaultLanguage ?? null,
      functionSpec: isFunctionProblem
        ? (body.functionSpec !== undefined ? body.functionSpec : problem.functionSpec ?? null)
        : null,
      referenceSolution: isFunctionProblem
        ? (body.referenceSolution !== undefined ? body.referenceSolution : problem.referenceSolution ?? null)
        : null,
      testCases: (() => {
          const sortedExisting = [...existingTestCases].sort(
            (left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0)
          );
          if (!body.testCases) {
            return sortedExisting.map((testCase) => ({
              input: testCase.input,
              expectedOutput: testCase.expectedOutput,
              isVisible: testCase.isVisible ?? false,
            }));
          }
          return mergeTestCasePatchIntoExisting(sortedExisting, body.testCases);
        })(),
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
          testCaseOverrideUsed: allowLockedTestCases && canBypassLockedTestCases,
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
    const caps = await resolveCapabilities(user.role);

    const isAuthor = problem.authorId === user.id;
    const canDeleteProblem = caps.has("problems.delete");
    if (!isAuthor && !canDeleteProblem) return forbidden();
    // Group-scope the delete: a non-admin holder may only delete a problem they
    // authored or that is linked to a group they teach (mirrors the PATCH gate).
    if (!(await canManageProblem(id, user.id, user.role))) return forbidden();

    const force = req.nextUrl.searchParams.get("force") === "true";

    let blocked = false;
    await execTransaction(async (tx) => {
      const submissionCountRows = await tx
        .select({ total: sql<number>`count(${submissions.id})` })
        .from(submissions)
        .where(eq(submissions.problemId, id));
      const submissionCountRow = submissionCountRows[0] ?? { total: 0 };

      const assignmentLinkCountRows = await tx
        .select({ total: sql<number>`count(${assignmentProblems.id})` })
        .from(assignmentProblems)
        .where(eq(assignmentProblems.problemId, id));
      const assignmentLinkCountRow = assignmentLinkCountRows[0] ?? { total: 0 };

      const submissionCount = Number(submissionCountRow.total ?? 0);
      const assignmentLinkCount = Number(assignmentLinkCountRow.total ?? 0);

      if ((submissionCount > 0 || assignmentLinkCount > 0) && !(force && canDeleteProblem)) {
        blocked = true;
        return;
      }

      await tx.delete(problems).where(eq(problems.id, id));
    });

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
