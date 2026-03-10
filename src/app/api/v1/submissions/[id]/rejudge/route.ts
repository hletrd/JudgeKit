import { NextRequest, NextResponse } from "next/server";
import { db, sqlite } from "@/lib/db";
import { submissions, submissionResults } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getApiUser, unauthorized, forbidden, notFound, isInstructor, csrfForbidden } from "@/lib/api/auth";
import { recordAuditEvent } from "@/lib/audit/events";
import { checkApiRateLimit, recordApiRateHit } from "@/lib/security/api-rate-limit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrfError = csrfForbidden(request);
    if (csrfError) return csrfError;

    const user = await getApiUser(request);
    if (!user) return unauthorized();

    if (!isInstructor(user.role)) {
      return forbidden();
    }

    const rateLimitError = checkApiRateLimit(request, "submissions.rejudge");
    if (rateLimitError) return rateLimitError;
    recordApiRateHit(request, "submissions.rejudge");

    const { id } = await params;

    const submission = await db.query.submissions.findFirst({
      where: eq(submissions.id, id),
      columns: {
        id: true,
        userId: true,
        problemId: true,
        assignmentId: true,
        status: true,
      },
    });

    if (!submission) return notFound("Submission");

    // Delete existing test case results and reset submission (atomic transaction)
    sqlite.transaction(() => {
      db.delete(submissionResults).where(eq(submissionResults.submissionId, id)).run();

      db.update(submissions)
        .set({
          status: "pending",
          score: null,
          compileOutput: null,
          executionTimeMs: null,
          memoryUsedKb: null,
          judgeClaimToken: null,
          judgeClaimedAt: null,
          judgedAt: null,
        })
        .where(eq(submissions.id, id))
        .run();
    })();

    const updated = await db.query.submissions.findFirst({
      where: eq(submissions.id, id),
      with: {
        user: {
          columns: { name: true },
        },
        problem: {
          columns: { id: true, title: true },
        },
        results: {
          with: {
            testCase: {
              columns: { sortOrder: true },
            },
          },
        },
      },
    });

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "submission.rejudged",
      resourceType: "submission",
      resourceId: id,
      resourceLabel: id,
      summary: `Rejudged submission ${id}`,
      details: {
        submissionId: id,
        problemId: submission.problemId,
        assignmentId: submission.assignmentId ?? null,
      },
      request,
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("POST /api/v1/submissions/[id]/rejudge error:", error);
    return NextResponse.json({ error: "internalServerError" }, { status: 500 });
  }
}
