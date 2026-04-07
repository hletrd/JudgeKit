import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { problems, languageConfigs } from "@/lib/db/schema";
import { getJudgeLanguageDefinition } from "@/lib/judge/languages";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { canAccessProblem } from "@/lib/auth/permissions";
import {
  getStudentAssignmentContextsForProblem,
  validateAssignmentSubmission,
} from "@/lib/assignments/submissions";
import { formatRelativeTimeFromNow } from "@/lib/datetime";
import { ProblemDescription } from "@/components/problem-description";
import { getTrustedLegacySeededDescription } from "@/lib/problems/legacy-seeded";
import { getResolvedSystemSettings } from "@/lib/system-settings";
import { CountdownTimer } from "@/components/exam/countdown-timer";
import { ProblemSubmissionForm } from "./problem-submission-form";
import { ProblemLectureWrapper } from "./problem-lecture-wrapper";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ProblemDeleteButton } from "./problem-delete-button";
import { ProblemExportButton } from "./problem-export-button";
import { ArrowLeft, Trophy } from "lucide-react";
import { getRecruitingAccessContext } from "@/lib/recruiting/access";

function formatDifficultyValue(value: number) {
  return value.toFixed(2).replace(/\.?0+$/, "");
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const problem = await db.query.problems.findFirst({
    where: eq(problems.id, id),
    columns: { title: true },
  });
  return { title: problem?.title ?? "Problem" };
}

export default async function ProblemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ assignmentId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [resolvedParams, resolvedSearchParams] = await Promise.all([
    params,
    searchParams ?? Promise.resolve(undefined),
  ]);
  const problemId = resolvedParams.id;
  const normalizedAssignmentId =
    typeof resolvedSearchParams?.assignmentId === "string" && resolvedSearchParams.assignmentId.trim()
      ? resolvedSearchParams.assignmentId.trim()
      : null;

  const t = await getTranslations("problems");
  const tCommon = await getTranslations("common");
  const tRankings = await getTranslations("rankings");
  const locale = await getLocale();
  const recruitingAccess = await getRecruitingAccessContext(session.user.id);
  const effectivePlatformMode = recruitingAccess.effectivePlatformMode;
  const resolvedSettings = await getResolvedSystemSettings({
    siteTitle: tCommon("appName"),
    siteDescription: tCommon("appDescription"),
  });

  const problem = await db.query.problems.findFirst({
    where: eq(problems.id, problemId),
    with: {
      author: {
        columns: { name: true, username: true, email: true }
      }
    }
  });

  if (!problem) {
    notFound();
  }

  // Fetch languages
  const langs = await db.select().from(languageConfigs).where(eq(languageConfigs.isEnabled, true));
  const enabledLanguages = langs.flatMap((language) => {
    const definition = getJudgeLanguageDefinition(language.language);

    if (!definition) {
      return [];
    }

    return [{
      id: language.id,
      language: language.language,
      displayName: definition.displayName,
      standard: definition.standard,
    }];
  });

  const hasAccess = await canAccessProblem(problem.id, session.user.id, session.user.role);

  if (!hasAccess) {
    redirect(recruitingAccess.isRecruitingCandidate ? "/dashboard/contests" : "/dashboard/problems");
  }

  const canEdit =
    problem.authorId === session.user.id ||
    session.user.role === "admin" ||
    session.user.role === "super_admin";

  let assignmentContext:
    | {
        id: string;
        title: string;
        deadline: Date | null;
        lateDeadline: Date | null;
        examMode: string;
        personalDeadline: Date | null;
        isSubmissionBlocked?: boolean;
      }
    | null = null;
  let assignmentChoices: Array<{
    assignmentId: string;
    title: string;
    groupId: string;
    groupName: string;
  }> = [];

  if (normalizedAssignmentId) {
    const assignment = await db.query.assignments.findFirst({
      where: (assignments, { eq }) => eq(assignments.id, normalizedAssignmentId),
      columns: { id: true, title: true, deadline: true, lateDeadline: true, startsAt: true, examMode: true },
    });

    // Block access before contest start for non-admin users
    if (
      assignment?.startsAt &&
      new Date(assignment.startsAt) > new Date() &&
      session.user.role !== "admin" &&
      session.user.role !== "super_admin" &&
      session.user.role !== "instructor"
    ) {
      redirect(`/dashboard/contests/${normalizedAssignmentId}`);
    }

    const assignmentValidation = await validateAssignmentSubmission(
      normalizedAssignmentId,
      problem.id,
      session.user.id,
      session.user.role
    );

    if (!assignmentValidation.ok) {
      redirect(recruitingAccess.isRecruitingCandidate ? "/dashboard/contests" : "/dashboard/groups");
    }

    let personalDeadline: Date | null = null;
    if (assignment && assignment.examMode === "windowed") {
      const { getExamSession } = await import("@/lib/assignments/exam-sessions");
      const examSession = await getExamSession(normalizedAssignmentId, session.user.id);
      personalDeadline = examSession?.personalDeadline ?? null;
    }

    // Determine if submissions are blocked (past deadline)
    const now = new Date();
    const effectiveDeadline = personalDeadline ?? assignment?.lateDeadline ?? assignment?.deadline ?? null;
    const isSubmissionBlocked = effectiveDeadline ? new Date(effectiveDeadline) < now : false;

    assignmentContext = assignment
      ? {
          id: assignment.id,
          title: assignment.title,
          deadline: assignment.deadline ?? null,
          lateDeadline: assignment.lateDeadline ?? null,
          examMode: assignment.examMode ?? "none",
          personalDeadline,
          isSubmissionBlocked,
        }
      : null;
  } else if (session.user.role === "student") {
    const availableAssignments = await getStudentAssignmentContextsForProblem(
      problem.id,
      session.user.id
    );

    if (availableAssignments.length === 1) {
      redirect(`/dashboard/problems/${problem.id}?assignmentId=${availableAssignments[0].assignmentId}`);
    }

    assignmentChoices = availableAssignments.map((assignment) => ({
      assignmentId: assignment.assignmentId,
      title: assignment.title,
      groupId: assignment.groupId,
      groupName: assignment.groupName,
    }));
  }

  const legacyHtmlDescription = getTrustedLegacySeededDescription({
    title: problem.title,
    description: problem.description,
    authorUsername: problem.author?.username,
    authorEmail: problem.author?.email,
  });

  const problemPanel = (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link
              href={assignmentContext ? `/dashboard/contests/${assignmentContext.id}` : "/dashboard/problems"}
              className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
              {assignmentContext ? assignmentContext.title : tCommon("back")}
            </Link>
            <h2 className="text-3xl font-bold">{problem.title}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {effectivePlatformMode !== "recruiting" && (
              <Link href={`/dashboard/problems/${problem.id}/rankings`}>
                <Button variant="outline" size="sm">
                  <Trophy className="size-4 mr-1" />
                  {tRankings("viewRankings")}
                </Button>
              </Link>
            )}
            {canEdit && (
              <>
                <ProblemExportButton problemId={problem.id} />
                <Link href={`/dashboard/problems/${problem.id}/edit`}>
                  <Button variant="outline" size="sm">{tCommon("edit")}</Button>
                </Link>
                <ProblemDeleteButton problemId={problem.id} problemTitle={problem.title} />
              </>
            )}
          </div>
        </div>
        <div className="mb-4 flex flex-wrap gap-2 text-sm text-muted-foreground">
          <Badge variant="outline">{t("badges.timeLimit", { value: problem.timeLimitMs ?? 2000 })}</Badge>
          <Badge variant="outline">{t("badges.memoryLimit", { value: problem.memoryLimitMb ?? 256 })}</Badge>
          {problem.difficulty != null && (
            <Badge variant="outline">{t("badges.difficulty", { value: formatDifficultyValue(problem.difficulty) })}</Badge>
          )}
          <Badge variant="secondary">{t("badges.author", { name: problem.author?.name || tCommon("system") })}</Badge>
          {assignmentContext && <Badge>{assignmentContext.title}</Badge>}
          {assignmentContext?.deadline && (
            <Badge variant="secondary">
              {t("assignmentDeadlineNotice")}: {formatRelativeTimeFromNow(assignmentContext.deadline, locale)}
            </Badge>
          )}
          {assignmentContext?.lateDeadline && (
            <Badge variant="outline">
              {t("assignmentLateDeadlineNotice")}: {formatRelativeTimeFromNow(assignmentContext.lateDeadline, locale)}
            </Badge>
          )}
          {assignmentContext?.examMode === "windowed" && assignmentContext?.personalDeadline && (
            <CountdownTimer
              deadline={new Date(assignmentContext.personalDeadline).getTime()}
              label={t("assignmentDeadlineNotice")}
            />
          )}
          {assignmentContext?.examMode === "scheduled" && assignmentContext?.deadline && (
            <CountdownTimer
              deadline={new Date(assignmentContext.deadline).getTime()}
              label={t("assignmentDeadlineNotice")}
            />
          )}
        </div>
      </div>
      <Card>
        <CardContent className="pt-6">
          {problem.description ? (
            <ProblemDescription
              className="text-sm sm:text-base"
              description={problem.description}
              legacyHtmlDescription={legacyHtmlDescription}
            />
          ) : (
            <p>{t("noDescription")}</p>
          )}
        </CardContent>
      </Card>

      {assignmentChoices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("assignmentSelectionTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("assignmentSelectionDescription")}
            </p>
            <div className="flex flex-wrap gap-2">
              {assignmentChoices.map((assignment) => (
                <Link
                  key={assignment.assignmentId}
                  href={`/dashboard/groups/${assignment.groupId}/assignments/${assignment.assignmentId}`}
                >
                  <Button variant="outline">
                    {t("assignmentSelectionOpenAssignment", {
                      title: assignment.title,
                      group: assignment.groupName,
                    })}
                  </Button>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  const codePanel = (
    <Card className="sticky top-6">
      <CardHeader>
        <CardTitle>{t("submitSolution")}</CardTitle>
      </CardHeader>
      <CardContent>
        {assignmentContext?.isSubmissionBlocked ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-center dark:border-amber-900 dark:bg-amber-950">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
              {tCommon("contestEnded") ?? "This contest has ended. Submissions are no longer accepted."}
            </p>
          </div>
        ) : assignmentChoices.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("assignmentSelectionSubmitHint")}
          </p>
        ) : (
          <ProblemSubmissionForm
            userId={session.user.id}
            problemId={problem.id}
            languages={enabledLanguages}
            assignmentId={assignmentContext?.id ?? null}
            preferredLanguage={session.user.preferredLanguage ?? null}
            problemDefaultLanguage={problem.defaultLanguage ?? null}
            siteDefaultLanguage={resolvedSettings.defaultLanguage ?? null}
            editorTheme={session.user.editorTheme ?? null}
          />
        )}
      </CardContent>
    </Card>
  );

  const defaultView = (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div>{problemPanel}</div>
      <div>{codePanel}</div>
    </div>
  );

  return (
    <ProblemLectureWrapper
      problemId={problem.id}
      problemTitle={problem.title}
      problemPanel={problemPanel}
      codePanel={codePanel}
      defaultView={defaultView}
    />
  );
}
