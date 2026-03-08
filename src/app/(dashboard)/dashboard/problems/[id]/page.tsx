import { getTranslations } from "next-intl/server";
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
import { ProblemDescription } from "@/components/problem-description";
import { getTrustedLegacySeededDescription } from "@/lib/problems/legacy-seeded";
import { ProblemSubmissionForm } from "./problem-submission-form";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ProblemDeleteButton } from "./problem-delete-button";

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
    redirect("/dashboard/problems");
  }

  const canEdit =
    problem.authorId === session.user.id ||
    session.user.role === "admin" ||
    session.user.role === "super_admin";

  let assignmentContext:
    | {
        id: string;
        title: string;
      }
    | null = null;
  let assignmentChoices: Array<{
    assignmentId: string;
    title: string;
    groupId: string;
    groupName: string;
  }> = [];

  if (normalizedAssignmentId) {
    const assignmentValidation = await validateAssignmentSubmission(
      normalizedAssignmentId,
      problem.id,
      session.user.id,
      session.user.role
    );

    if (!assignmentValidation.ok) {
      redirect("/dashboard/groups");
    }

    const assignment = await db.query.assignments.findFirst({
      where: (assignments, { eq }) => eq(assignments.id, normalizedAssignmentId),
      columns: { id: true, title: true },
    });

    assignmentContext = assignment
      ? {
          id: assignment.id,
          title: assignment.title,
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-6">
        <div>
          <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-3xl font-bold">{problem.title}</h2>
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                <Link href={`/dashboard/problems/${problem.id}/edit`}>
                  <Button variant="outline">{tCommon("edit")}</Button>
                </Link>
                <ProblemDeleteButton problemId={problem.id} problemTitle={problem.title} />
              </div>
            )}
          </div>
          <div className="mb-4 flex gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">{t("badges.timeLimit", { value: problem.timeLimitMs ?? 2000 })}</Badge>
            <Badge variant="outline">{t("badges.memoryLimit", { value: problem.memoryLimitMb ?? 256 })}</Badge>
            <Badge variant="secondary">{t("badges.author", { name: problem.author?.name || tCommon("system") })}</Badge>
            {assignmentContext && <Badge>{assignmentContext.title}</Badge>}
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t("descriptionTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {canEdit && <p className="mb-4 text-sm text-muted-foreground">{t("deleteHelpText")}</p>}
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

      <div>
        <Card className="sticky top-6">
          <CardHeader>
            <CardTitle>{t("submitSolution")}</CardTitle>
          </CardHeader>
          <CardContent>
            {assignmentChoices.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("assignmentSelectionSubmitHint")}
              </p>
            ) : (
              <ProblemSubmissionForm
                userId={session.user.id}
                problemId={problem.id}
                languages={enabledLanguages}
                assignmentId={assignmentContext?.id ?? null}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
