import { db } from "@/lib/db";
import { assignments, submissions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { canAccessSubmission } from "@/lib/auth/permissions";
import { canViewAssignmentSubmissions } from "@/lib/assignments/submissions";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { getResolvedSystemTimeZone } from "@/lib/system-settings";
import { redirect, notFound } from "next/navigation";
import { SubmissionDetailClient } from "./submission-detail-client";

export default async function SubmissionDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ from?: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const submissionId = resolvedParams.id;
  const fromParam = resolvedSearchParams?.from;
  const backHref = fromParam === "admin"
    ? "/dashboard/admin/submissions"
    : fromParam === "problem"
      ? "/dashboard/problems"
      : "/dashboard/submissions";

  const timeZone = await getResolvedSystemTimeZone();

  const submission = await db.query.submissions.findFirst({
    where: eq(submissions.id, submissionId),
    with: {
      user: {
        columns: { name: true },
      },
      problem: {
        columns: { id: true, title: true, showCompileOutput: true, showDetailedResults: true, showRuntimeErrors: true },
      },
      results: {
        with: {
          testCase: {
            columns: { sortOrder: true, expectedOutput: true, isVisible: true },
          },
        },
      },
    },
  });

  if (!submission) {
    notFound();
  }

  // Access control
  const hasAccess = await canAccessSubmission(
    { userId: submission.userId, assignmentId: submission.assignmentId },
    session.user.id,
    session.user.role
  );

  if (!hasAccess) {
    redirect("/dashboard/submissions");
  }

  const caps = await resolveCapabilities(session.user.role);
  const canReviewAssignment =
    submission.assignmentId !== null &&
    await canViewAssignmentSubmissions(
      submission.assignmentId,
      session.user.id,
      session.user.role
    );
  const isPrivileged = caps.has("submissions.view_all") || canReviewAssignment;

  // Check if scores should be hidden from candidates
  let hideScore = false;
  if (!isPrivileged && submission.assignmentId) {
    const assignmentRow = await db.query.assignments.findFirst({
      where: eq(assignments.id, submission.assignmentId),
      columns: { hideScoresFromCandidates: true },
    });
    hideScore = assignmentRow?.hideScoresFromCandidates ?? false;
  }

  const showDetailedResults = isPrivileged
    ? true
    : (submission.problem?.showDetailedResults ?? true);
  const showRuntimeErrors = isPrivileged
    ? true
    : (submission.problem?.showRuntimeErrors ?? true);

  const filteredResults = submission.results.map((result) => {
    let executionTimeMs = result.executionTimeMs ?? null;
    let memoryUsedKb = result.memoryUsedKb ?? null;
    let actualOutput = result.actualOutput ?? null;

    if (!showDetailedResults) {
      executionTimeMs = null;
      memoryUsedKb = null;
      actualOutput = null;
    } else if (!showRuntimeErrors && result.status === "runtime_error") {
      actualOutput = null;
    }

    const isVisible = result.testCase?.isVisible ?? false;
    const expectedOutput =
      showDetailedResults && isVisible && result.status === "wrong_answer"
        ? (result.testCase?.expectedOutput ?? null)
        : null;

    return {
      id: result.id,
      status: result.status,
      executionTimeMs,
      memoryUsedKb,
      actualOutput,
      testCase: result.testCase
        ? {
            sortOrder: result.testCase.sortOrder ?? null,
            isVisible,
            expectedOutput,
          }
        : null,
    };
  });

  return (
    <SubmissionDetailClient
      initialSubmission={{
        id: submission.id,
        assignmentId: submission.assignmentId ?? null,
        language: submission.language,
        status: submission.status ?? "pending",
        sourceCode: submission.sourceCode,
        compileOutput: submission.compileOutput ?? null,
        executionTimeMs: submission.executionTimeMs ?? null,
        memoryUsedKb: submission.memoryUsedKb ?? null,
        score: hideScore ? null : (submission.score ?? null),
        submittedAt: submission.submittedAt ? submission.submittedAt.valueOf() : null,
        user: submission.user
          ? {
              name: submission.user.name,
            }
          : null,
        problem: submission.problem
          ? {
              id: submission.problem.id,
              title: submission.problem.title,
            }
          : null,
        results: filteredResults,
      }}
      backHref={backHref}
      timeZone={timeZone}
      showCompileOutput={
        isPrivileged ? true : (submission.problem?.showCompileOutput ?? true)
      }
      showDetailedResults={showDetailedResults}
      showRuntimeErrors={showRuntimeErrors}
      userRole={session.user.role}
      userId={session.user.id}
      capabilities={[...caps]}
    />
  );
}
