import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assignmentProblems, problems, submissions, testCases } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { getApiUser, unauthorized, forbidden, notFound, isAdmin, csrfForbidden } from "@/lib/api/auth";
import { recordAuditEvent } from "@/lib/audit/events";
import { canAccessProblem } from "@/lib/auth/permissions";
import { updateProblemWithTestCases } from "@/lib/problem-management";
import { problemMutationSchema } from "@/lib/validators/problem-management";
import { checkApiRateLimit, recordApiRateHit } from "@/lib/security/api-rate-limit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const { id } = await params;
    const problem = await db.query.problems.findFirst({ where: eq(problems.id, id) });
    if (!problem) return notFound("Problem");

    const hasAccess = await canAccessProblem(id, user.id, user.role);
    if (!hasAccess) return forbidden();

    const canManageProblem = isAdmin(user.role) || problem.authorId === user.id;

    if (!canManageProblem) {
      return NextResponse.json({ data: problem });
    }

    const managedProblem = await db.query.problems.findFirst({
      where: eq(problems.id, id),
      with: {
        testCases: true,
      },
    });

    return NextResponse.json({ data: managedProblem ?? problem });
  } catch (error) {
    console.error("GET /api/v1/problems/[id] error:", error);
    return NextResponse.json({ error: "internalServerError" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrfError = csrfForbidden(request);
    if (csrfError) return csrfError;

    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const { id } = await params;
    const problem = await db.query.problems.findFirst({ where: eq(problems.id, id) });
    if (!problem) return notFound("Problem");

    const isAuthor = problem.authorId === user.id;
    if (!isAuthor && !isAdmin(user.role)) return forbidden();

    const body = await request.json();
    const existingTestCases = await db.query.testCases.findMany({
      where: eq(testCases.problemId, id),
    });
    const hasExistingSubmissions = Boolean(
      await db.query.submissions.findFirst({
        where: eq(submissions.problemId, id),
        columns: { id: true },
      })
    );

    if (body.testCases !== undefined && hasExistingSubmissions) {
      return NextResponse.json({ error: "testCasesLocked" }, { status: 409 });
    }

    const parsedInput = problemMutationSchema.safeParse({
      title: body.title ?? problem.title,
      description: body.description ?? problem.description ?? "",
      timeLimitMs: body.timeLimitMs ?? problem.timeLimitMs ?? 2000,
      memoryLimitMb: body.memoryLimitMb ?? problem.memoryLimitMb ?? 256,
      visibility: body.visibility ?? problem.visibility ?? "private",
      testCases:
        body.testCases ??
        existingTestCases
          .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
          .map((testCase) => ({
            input: testCase.input,
            expectedOutput: testCase.expectedOutput,
            isVisible: testCase.isVisible ?? false,
          })),
    });

    if (!parsedInput.success) {
      return NextResponse.json(
        { error: parsedInput.error.issues[0]?.message ?? "updateError" },
        { status: 400 }
      );
    }

    updateProblemWithTestCases(id, parsedInput.data);

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
          testCaseCount: updated.testCases.length,
        },
        request,
      });
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PATCH /api/v1/problems/[id] error:", error);
    return NextResponse.json({ error: "updateError" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrfError = csrfForbidden(request);
    if (csrfError) return csrfError;

    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const { id } = await params;
    const problem = await db.query.problems.findFirst({ where: eq(problems.id, id) });
    if (!problem) return notFound("Problem");

    const isAuthor = problem.authorId === user.id;
    if (!isAuthor && !isAdmin(user.role)) return forbidden();

    const [submissionCountRow, assignmentLinkCountRow] = await Promise.all([
      db
        .select({ total: sql<number>`count(${submissions.id})` })
        .from(submissions)
        .where(eq(submissions.problemId, id))
        .then((rows) => rows[0] ?? { total: 0 }),
      db
        .select({ total: sql<number>`count(${assignmentProblems.id})` })
        .from(assignmentProblems)
        .where(eq(assignmentProblems.problemId, id))
        .then((rows) => rows[0] ?? { total: 0 }),
    ]);

    const submissionCount = Number(submissionCountRow.total ?? 0);
    const assignmentLinkCount = Number(assignmentLinkCountRow.total ?? 0);

    if (submissionCount > 0 || assignmentLinkCount > 0) {
      return NextResponse.json(
        {
          error: "problemDeleteBlocked",
          details: {
            submissionCount,
            assignmentLinkCount,
          },
        },
        { status: 409 }
      );
    }

    await db.delete(problems).where(eq(problems.id, id));

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
      request,
    });

    return NextResponse.json({ data: { id } });
  } catch (error) {
    console.error("DELETE /api/v1/problems/[id] error:", error);
    return NextResponse.json({ error: "problemDeleteFailed" }, { status: 500 });
  }
}
