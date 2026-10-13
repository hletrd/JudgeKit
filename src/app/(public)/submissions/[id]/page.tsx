import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { submissions } from "@/lib/db/schema";
import { and, desc, eq, ne } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getResolvedSystemTimeZone } from "@/lib/system-settings";
import { redirect, notFound } from "next/navigation";
import { SubmissionDetailClient } from "@/components/submissions/submission-detail-client";
import { buildLocalePath, NO_INDEX_METADATA } from "@/lib/seo";
import { canViewAssignmentSubmissions } from "@/lib/assignments/submissions";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { mapFunctionCompileOutputForDisplay } from "@/lib/submissions/visibility";
import { getProblemListPath } from "@/lib/navigation/problem-list";
import { RefreshOnHistoryRestore } from "@/components/refresh-on-history-restore";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("submissions");

  return {
    title: t("title"),
    description: t("mySubmissions"),
    ...NO_INDEX_METADATA,
  };
}

export default async function PublicSubmissionDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ from?: string }> }) {
  const locale = await getLocale();
  const session = await auth();
  if (!session?.user) redirect(buildLocalePath("/login", locale));

  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const submissionId = resolvedParams.id;
  const fromParam = resolvedSearchParams?.from;

  const timeZone = await getResolvedSystemTimeZone();

  const submission = await db.query.submissions.findFirst({
    where: eq(submissions.id, submissionId),
    with: {
      user: {
        columns: { name: true },
      },
      assignment: {
        columns: { examMode: true, groupId: true },
      },
      problem: {
        columns: { id: true, title: true, timeLimitMs: true, showCompileOutput: true, showDetailedResults: true, showRuntimeErrors: true, visibility: true, problemType: true, functionSpec: true },
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

  const isOwner = submission.userId === session.user.id;

  // Non-owners can only view submissions for public problems, unless they
  // have instructor/admin privileges for the assignment. This aligns the
  // detail page with the list page's guestVisibilityFilter and prevents
  // authenticated users from discovering private-problem submission metadata
  // (contest/exam submissions) by guessing submission IDs. See AGG-2 (cycle 7).
  let canViewAsInstructor = false;
  if (!isOwner) {
    canViewAsInstructor = await canViewAssignmentSubmissions(
      submission.assignmentId,
      session.user.id,
      session.user.role ?? "user"
    );
  }

  if (!isOwner && submission.problem?.visibility !== "public" && !canViewAsInstructor) {
    notFound();
  }

  const canViewDetails = isOwner || canViewAsInstructor;

  // Back-link fallback. `from=problem` points at the PROBLEM the submission
  // belongs to, not the bare practice list: after submitting, "back" must
  // return the user to where they came from (the in-app BackLink uses real
  // history when available; this href covers direct/deep links). Landing on
  // the full list here discarded the user's filtered list context entirely.
  const backHref = buildLocalePath(
    fromParam === "problem"
      ? submission.problemId
        ? `/practice/problems/${submission.problemId}${submission.assignmentId ? `?assignmentId=${submission.assignmentId}` : ""}`
        : "/practice"
      : fromParam === "admin"
        ? "/dashboard/admin/submissions"
        : "/submissions",
    locale,
  );

  // "Problem list" escape hatch next to "back": after submitting, history
  // back lands on the problem, and the list it was picked from (the contest,
  // the group assignment, or practice) is one more step away.
  const problemListHref = buildLocalePath(
    getProblemListPath(
      submission.assignmentId && submission.assignment
        ? { id: submission.assignmentId, ...submission.assignment }
        : null,
    ),
    locale,
  );

  // Capabilities surface the rejudge / comment / view_source actions on the
  // submission detail UI (`SubmissionDetailClient`). Previously hard-coded to
  // an empty list, which hid the rejudge button from instructors and admins.
  const userCapabilities = [...await resolveCapabilities(session.user.role ?? "user")];

  // Fetch the viewer's own other submissions for the same problem. The
  // submission shown here is excluded on purpose: the client merges it back in
  // with its live (polled) status, which this server render cannot know yet.
  const otherSubmissions = submission.problemId
    ? await db
        .select({
          id: submissions.id,
          language: submissions.language,
          status: submissions.status,
          score: submissions.score,
          submittedAt: submissions.submittedAt,
          executionTimeMs: submissions.executionTimeMs,
          memoryUsedKb: submissions.memoryUsedKb,
          failedTestCaseIndex: submissions.failedTestCaseIndex,
          runtimeErrorType: submissions.runtimeErrorType,
        })
        .from(submissions)
        .where(
          and(
            eq(submissions.userId, session.user.id),
            eq(submissions.problemId, submission.problemId),
            ne(submissions.id, submissionId)
          )
        )
        .orderBy(desc(submissions.submittedAt))
        .limit(20)
    : [];

  const showDetailedResults = canViewDetails && (isOwner ? (submission.problem?.showDetailedResults ?? true) : true);
  const showRuntimeErrors = canViewDetails && (isOwner ? (submission.problem?.showRuntimeErrors ?? true) : true);
  const showCompileOutput = canViewDetails && (isOwner ? (submission.problem?.showCompileOutput ?? true) : true);
  const compileOutput = showCompileOutput
    ? mapFunctionCompileOutputForDisplay({
        compileOutput: submission.compileOutput ?? null,
        language: submission.language,
        problem: submission.problem,
      })
    : null;

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
    <div className="space-y-6">
      <RefreshOnHistoryRestore />
      <SubmissionDetailClient
        initialSubmission={{
          id: submission.id,
          assignmentId: submission.assignmentId ?? null,
          language: submission.language,
          status: submission.status ?? "pending",
          sourceCode: canViewDetails ? submission.sourceCode : "",
          compileOutput,
          executionTimeMs: submission.executionTimeMs ?? null,
          memoryUsedKb: submission.memoryUsedKb ?? null,
          score: submission.score ?? null,
          failedTestCaseIndex: submission.failedTestCaseIndex ?? null,
          runtimeErrorType: submission.runtimeErrorType ?? null,
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
          results: canViewDetails ? filteredResults : [],
        }}
        backHref={backHref}
        cameFromProblem={fromParam === "problem"}
        problemListHref={problemListHref}
        timeZone={timeZone}
        showCompileOutput={showCompileOutput}
        showDetailedResults={showDetailedResults}
        showRuntimeErrors={showRuntimeErrors}
        userId={session.user.id}
        capabilities={userCapabilities}
        problemTimeLimitMs={submission.problem?.timeLimitMs ?? null}
        canViewSource={canViewDetails}
        isOwner={isOwner}
        draftScopeId={
          submission.assignment && submission.assignment.examMode !== "none" ? submission.assignmentId : null
        }
        problemSubmissions={
          submission.problemId
            ? otherSubmissions.map((sub) => ({
                ...sub,
                status: sub.status ?? "pending",
                submittedAt: sub.submittedAt ? sub.submittedAt.valueOf() : null,
              }))
            : null
        }
      />
    </div>
  );
}
