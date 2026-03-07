import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { submissions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getResolvedSystemTimeZone } from "@/lib/system-settings";
import { redirect, notFound } from "next/navigation";
import { SubmissionDetailClient } from "./submission-detail-client";

export default async function SubmissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const resolvedParams = await params;
  const submissionId = resolvedParams.id;

  const t = await getTranslations("submissions");
  const locale = await getLocale();
  const timeZone = await getResolvedSystemTimeZone();
  const statusLabels = {
    pending: t("status.pending"),
    queued: t("status.queued"),
    judging: t("status.judging"),
    accepted: t("status.accepted"),
    wrong_answer: t("status.wrong_answer"),
    time_limit: t("status.time_limit"),
    memory_limit: t("status.memory_limit"),
    runtime_error: t("status.runtime_error"),
    compile_error: t("status.compile_error"),
  };
  
  const submission = await db.query.submissions.findFirst({
    where: eq(submissions.id, submissionId),
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

  if (!submission) {
    notFound();
  }

  // Access control
  if (submission.userId !== session.user.id && session.user.role !== "admin" && session.user.role !== "super_admin") {
    redirect("/dashboard/submissions");
  }

  return (
    <SubmissionDetailClient
      initialSubmission={{
        id: submission.id,
        language: submission.language,
        status: submission.status ?? "pending",
        sourceCode: submission.sourceCode,
        compileOutput: submission.compileOutput ?? null,
        executionTimeMs: submission.executionTimeMs ?? null,
        memoryUsedKb: submission.memoryUsedKb ?? null,
        score: submission.score ?? null,
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
        results: submission.results.map((result) => ({
          id: result.id,
          status: result.status,
          executionTimeMs: result.executionTimeMs ?? null,
          memoryUsedKb: result.memoryUsedKb ?? null,
          testCase: result.testCase
            ? {
                sortOrder: result.testCase.sortOrder ?? null,
              }
            : null,
        })),
      }}
      headingLabel={t("submissionId", { id: submission.id.substring(0, 8) })}
      statusLabels={statusLabels}
      submittedLabel={t("submitted")}
      scoreLabel={t("score")}
      timeLabel={t("time")}
      memoryLabel={t("memory")}
      userLabel={t("user")}
      sourceCodeLabel={t("sourceCode")}
      compileOutputLabel={t("compileOutput")}
      testCaseResultsLabel={t("testCaseResults")}
      testCaseResultsDescription={t("testCaseResultsDesc")}
      noResultsLabel={t("noResults")}
      liveUpdatesLabel={t("liveUpdatesActive")}
      locale={locale}
      timeZone={timeZone}
      timeValueLabel={t("timeValue", { value: "{value}" })}
      memoryValueLabel={t("memoryValue", { value: "{value}" })}
      tableProblemLabel={t("table.problem")}
      tableLanguageLabel={t("table.language")}
      testCaseTableLabels={{
        testCase: t("testCaseTable.testCase"),
        status: t("testCaseTable.status"),
        time: t("testCaseTable.time"),
        memory: t("testCaseTable.memory"),
      }}
    />
  );
}
