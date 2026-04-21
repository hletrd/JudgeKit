import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { submissions } from "@/lib/db/schema";
import { and, desc, eq, ne } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getResolvedSystemTimeZone } from "@/lib/system-settings";
import { redirect, notFound } from "next/navigation";
import { SubmissionDetailClient } from "@/app/(dashboard)/dashboard/submissions/[id]/submission-detail-client";
import { buildLocalePath, NO_INDEX_METADATA } from "@/lib/seo";
import { SubmissionStatusBadge } from "@/components/submission-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { formatSubmissionIdPrefix } from "@/lib/submissions/format";
import { getLanguageDisplayLabel } from "@/lib/judge/languages";
import { buildStatusLabels } from "@/lib/judge/status-labels";
import { formatDateTimeInTimeZone } from "@/lib/datetime";

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
  const backHref = buildLocalePath(
    fromParam === "problem" ? "/practice" : "/submissions",
    locale,
  );

  const timeZone = await getResolvedSystemTimeZone();
  const t = await getTranslations("submissions");
  const tCommon = await getTranslations("common");
  const statusLabels = buildStatusLabels(t);

  const submission = await db.query.submissions.findFirst({
    where: eq(submissions.id, submissionId),
    with: {
      user: {
        columns: { name: true },
      },
      problem: {
        columns: { id: true, title: true, timeLimitMs: true, showCompileOutput: true, showDetailedResults: true, showRuntimeErrors: true },
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

  // Fetch the viewer's own other submissions for the same problem
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

  const showDetailedResults = isOwner && (submission.problem?.showDetailedResults ?? true);
  const showRuntimeErrors = isOwner && (submission.problem?.showRuntimeErrors ?? true);
  const showCompileOutput = isOwner && (submission.problem?.showCompileOutput ?? true);

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
      <SubmissionDetailClient
        initialSubmission={{
          id: submission.id,
          assignmentId: submission.assignmentId ?? null,
          language: submission.language,
          status: submission.status ?? "pending",
          sourceCode: isOwner ? submission.sourceCode : "",
          compileOutput: isOwner ? (submission.compileOutput ?? null) : null,
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
          results: isOwner ? filteredResults : [],
        }}
        backHref={backHref}
        timeZone={timeZone}
        showCompileOutput={showCompileOutput}
        showDetailedResults={showDetailedResults}
        showRuntimeErrors={showRuntimeErrors}
        userId={session.user.id}
        capabilities={[]}
        problemTimeLimitMs={submission.problem?.timeLimitMs ?? null}
        canViewSource={isOwner}
        isOwner={isOwner}
      />

      {/* Other submissions for this problem */}
      {submission.problemId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("forProblem")}</CardTitle>
          </CardHeader>
          <CardContent>
            {otherSubmissions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noOtherSubmissions")}</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("table.id")}</TableHead>
                      <TableHead>{t("table.language")}</TableHead>
                      <TableHead>{t("table.status")}</TableHead>
                      <TableHead>{t("table.score")}</TableHead>
                      <TableHead>{t("table.submittedAt")}</TableHead>
                      <TableHead>{t("table.action")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {otherSubmissions.map((sub) => (
                      <TableRow key={sub.id}>
                        <TableCell className="font-mono text-xs">
                          <Link href={buildLocalePath(`/submissions/${sub.id}`, locale)} className="text-primary hover:underline">
                            {formatSubmissionIdPrefix(sub.id)}
                          </Link>
                        </TableCell>
                        <TableCell>{getLanguageDisplayLabel(sub.language)}</TableCell>
                        <TableCell>
                          <SubmissionStatusBadge
                            label={statusLabels[sub.status as keyof typeof statusLabels] ?? sub.status}
                            status={sub.status}
                            executionTimeMs={sub.executionTimeMs}
                            memoryUsedKb={sub.memoryUsedKb}
                            score={sub.score}
                            failedTestCaseIndex={sub.failedTestCaseIndex}
                            runtimeErrorType={sub.runtimeErrorType}
                          />
                        </TableCell>
                        <TableCell>{sub.score !== null ? Math.round(sub.score * 100) / 100 : "-"}</TableCell>
                        <TableCell>
                          {sub.submittedAt
                            ? formatDateTimeInTimeZone(sub.submittedAt, locale, timeZone)
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <Link href={buildLocalePath(`/submissions/${sub.id}`, locale)}>
                            <Button variant="outline" size="sm">{tCommon("view")}</Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
