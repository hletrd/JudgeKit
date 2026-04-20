import type { Metadata } from "next";
import { cache } from "react";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { getRecruitingInvitationByToken } from "@/lib/assignments/recruiting-invitations";
import { getEnabledCompilerLanguages } from "@/lib/compiler/catalog";
import { db } from "@/lib/db";
import { assignmentProblems, assignments } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { RecruitStartForm } from "./recruit-start-form";

/**
 * Cached version of getRecruitingInvitationByToken for use within a single
 * server render. Both generateMetadata and the page component need the same
 * invitation data, so React.cache() deduplicates the DB query within one
 * request, eliminating the duplicate lookup and ensuring consistency.
 */
const getCachedInvitation = cache(getRecruitingInvitationByToken);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const t = await getTranslations("recruit");
  const invitation = await getCachedInvitation(token);

  if (!invitation || invitation.status === "revoked") {
    return { title: t("invalidToken") };
  }
  if (invitation.expiresAt && invitation.expiresAt < new Date()) {
    return { title: t("expired") };
  }
  if (invitation.status === "redeemed") {
    const description = t("claimedDescription");
    return {
      title: t("claimed"),
      description,
      openGraph: { title: t("claimed"), description },
      twitter: { card: "summary", title: t("claimed"), description },
    };
  }
  const title = t("title");
  const description = t("ogDescription");

  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { card: "summary", title, description },
  };
}

export default async function RecruitPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const t = await getTranslations("recruit");
  const session = await auth();

  const invitation = await getCachedInvitation(token);

  if (!invitation) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{t("invalidToken")}</CardTitle>
          <CardDescription>{t("invalidTokenDescription")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (invitation.status === "revoked") {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{t("invalidToken")}</CardTitle>
          <CardDescription>{t("invalidTokenDescription")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (invitation.expiresAt && invitation.expiresAt < new Date()) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{t("expired")}</CardTitle>
          <CardDescription>{t("expiredDescription")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const isRedeemed = invitation.status === "redeemed" && invitation.userId;
  const accountPasswordResetRequired =
    invitation.metadata?.accountPasswordResetRequired === "true";
  const resumeWithCurrentSession = Boolean(
    isRedeemed &&
    invitation.userId &&
    session?.user?.id === invitation.userId
  );
  const candidateGreeting = resumeWithCurrentSession
    ? t("welcome", { name: invitation.candidateName })
    : t("description");

  const [assignment] = await db
    .select({
      id: assignments.id,
      title: assignments.title,
      description: assignments.description,
      examDurationMinutes: assignments.examDurationMinutes,
      deadline: assignments.deadline,
    })
    .from(assignments)
    .where(eq(assignments.id, invitation.assignmentId))
    .limit(1);

  if (!assignment) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{t("invalidToken")}</CardTitle>
          <CardDescription>{t("invalidTokenDescription")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (isRedeemed && !resumeWithCurrentSession && !accountPasswordResetRequired) {
    // Show re-entry form with password — link stays valid for returning users
    return (
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{t("title")}</CardTitle>
          <CardDescription>{candidateGreeting}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <p className="text-lg font-semibold text-center text-foreground">{assignment.title}</p>
            {assignment.description && (
              <p className="text-sm text-muted-foreground">{assignment.description}</p>
            )}
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 space-y-1 text-sm dark:border-sky-900 dark:bg-sky-950/30">
              <p className="text-sky-800 dark:text-sky-200">{t("accountPasswordLoginNotice")}</p>
            </div>
          </div>
          <RecruitStartForm
            token={token}
            assignmentId={assignment.id}
            isReentry
            resumeWithCurrentSession={false}
            requiresAccountPassword
            assessmentTitle={assignment.title}
            examDurationMinutes={assignment.examDurationMinutes}
          />
        </CardContent>
      </Card>
    );
  }

  if (assignment.deadline && assignment.deadline < new Date()) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{t("contestClosed")}</CardTitle>
          <CardDescription>{t("contestClosedDescription")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const [problemCountRow, enabledLanguagesRow] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(assignmentProblems)
      .where(eq(assignmentProblems.assignmentId, assignment.id))
      .then((rows) => rows[0]),
    getEnabledCompilerLanguages(),
  ]);
  const problemCount = Number(problemCountRow?.count ?? 0);
  const enabledLanguageCount = enabledLanguagesRow.length;
  const visibleLanguages = enabledLanguagesRow.slice(0, 6).map((language) =>
    language.standard ? `${language.displayName} (${language.standard})` : language.displayName
  );
  const hiddenLanguageCount = Math.max(enabledLanguageCount - visibleLanguages.length, 0);

  return (
    <Card className="w-full max-w-lg">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{t("title")}</CardTitle>
        <CardDescription>{candidateGreeting}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
          <div className="space-y-3">
            <p className="font-semibold text-foreground text-lg text-center">{assignment.title}</p>
            {assignment.description && (
              <p className="text-sm text-muted-foreground">{assignment.description}</p>
            )}
            {accountPasswordResetRequired && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-200">
                {t("accountPasswordResetRequiredNotice")}
              </div>
            )}
            <div className="rounded-lg bg-muted/50 p-3 space-y-1.5 text-sm">
              {problemCount > 0 && (
                <p>{t("problemCount", { count: problemCount })}</p>
              )}
            {assignment.examDurationMinutes && (
              <p>{t("durationDetail", { minutes: assignment.examDurationMinutes })}</p>
            )}
            {assignment.deadline && (
              <p>{t("deadlineInfo", { date: new Date(assignment.deadline).toLocaleString() })}</p>
            )}
            <p>{t("languageCountDetail", { count: enabledLanguageCount })}</p>
            {visibleLanguages.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {visibleLanguages.map((language) => (
                  <span
                    key={language}
                    className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    {language}
                  </span>
                ))}
                {hiddenLanguageCount > 0 && (
                  <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                    {t("languageListMore", { count: hiddenLanguageCount })}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 space-y-1 text-sm">
            <p className="font-medium text-amber-800 dark:text-amber-200">{t("importantNotes")}</p>
            <ul className="list-disc list-inside text-xs text-amber-700 dark:text-amber-300 space-y-0.5">
              <li>{t("noteTimer")}</li>
              <li>{t("noteSubmissions")}</li>
              <li>{t("noteCompletion")}</li>
            </ul>
          </div>
          <div className="rounded-lg border border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/30 p-3 space-y-1 text-sm">
            <p className="font-medium text-sky-800 dark:text-sky-200">{t("reviewNoticeTitle")}</p>
            <ul className="list-disc list-inside text-xs text-sky-700 dark:text-sky-300 space-y-0.5">
              <li>{t("reviewNoticeSubmissions")}</li>
              <li>{t("reviewNoticeSignals")}</li>
              <li>{t("reviewNoticeAi")}</li>
            </ul>
          </div>
          {resumeWithCurrentSession && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30 p-3 text-sm text-emerald-800 dark:text-emerald-200">
              {t("resumeSessionOnlyNotice")}
            </div>
          )}
        </div>
        <RecruitStartForm
          token={token}
          assignmentId={assignment.id}
          isReentry={!!isRedeemed}
          resumeWithCurrentSession={resumeWithCurrentSession}
          requiresAccountPassword
          assessmentTitle={assignment.title}
          examDurationMinutes={assignment.examDurationMinutes}
        />
      </CardContent>
    </Card>
  );
}
