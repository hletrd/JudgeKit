import { getTranslations, getLocale } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { auth } from "@/lib/auth";
import { getRecruitingInvitationByToken } from "@/lib/assignments/recruiting-invitations";
import { getDbNow } from "@/lib/db-time";
import { db } from "@/lib/db";
import {
  assignmentProblems,
  assignments,
  problems,
  submissions,
} from "@/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { formatDateTimeInTimeZone } from "@/lib/datetime";
import { formatScore } from "@/lib/formatting";
import { SubmissionStatusBadge } from "@/components/submission-status-badge";
import { NO_INDEX_METADATA } from "@/lib/seo";
import { mapSubmissionPercentageToAssignmentPoints } from "@/lib/assignments/scoring";
import Link from "next/link";

/**
 * Candidate results page (H-4).
 *
 * Visible after the assignment deadline passes and the recruiter set
 * `showResultsToCandidate = true`. Renders the candidate's best submission
 * per problem with the verdict, score, runtime, and a link to inspect the
 * code they themselves submitted. The page intentionally does NOT show the
 * recruiter's view (other candidates' submissions, internal anti-cheat
 * details, IP addresses) — those remain inside /dashboard/contests/[id].
 */

export async function generateMetadata() {
  const t = await getTranslations("recruit");
  return { title: t("resultsTitle"), ...NO_INDEX_METADATA };
}

export default async function RecruitResultsPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const t = await getTranslations("recruit");
  const locale = await getLocale();

  const invitation = await getRecruitingInvitationByToken(token);
  if (!invitation || invitation.status === "revoked") {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{t("invalidToken")}</CardTitle>
          <CardDescription>{t("invalidTokenDescription")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Results are tied to the candidate's account, which is created when the
  // candidate first redeems the invitation. Without a userId there is nothing
  // to render yet, so push them to the start page instead of a blank table.
  if (!invitation.userId) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{t("resultsNotAvailable")}</CardTitle>
          <CardDescription>{t("resultsNotYetReleased")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Authenticate: the live session must match the invitation's userId. This
  // matches the existing recruit-page pattern so a forwarded link cannot
  // surface another candidate's score.
  const session = await auth();
  if (!session?.user?.id || session.user.id !== invitation.userId) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{t("resultsSignInRequired")}</CardTitle>
          <CardDescription>{t("resultsSignInRequiredDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Link className="underline" href={`/recruit/${token}`}>{t("backToStart")}</Link>
        </CardContent>
      </Card>
    );
  }

  const [assignment] = await db
    .select({
      id: assignments.id,
      title: assignments.title,
      deadline: assignments.deadline,
      lateDeadline: assignments.lateDeadline,
      showResultsToCandidate: assignments.showResultsToCandidate,
      hideScoresFromCandidates: assignments.hideScoresFromCandidates,
      organizationName: assignments.recruitingOrganizationName,
      contactEmail: assignments.recruitingContactEmail,
    })
    .from(assignments)
    .where(eq(assignments.id, invitation.assignmentId))
    .limit(1);

  if (!assignment) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{t("resultsNotAvailable")}</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  const now = await getDbNow();
  const effectiveCloseAt = assignment.lateDeadline ?? assignment.deadline ?? null;
  const closed = effectiveCloseAt !== null && effectiveCloseAt < now;
  if (!closed || !assignment.showResultsToCandidate) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{t("resultsNotYetTitle")}</CardTitle>
          <CardDescription>
            {assignment.showResultsToCandidate
              ? t("resultsNotYetDeadline")
              : t("resultsHiddenByRecruiter")}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Fetch the candidate's best submission per problem in this assignment.
  // We pick the highest score; ties resolve to the earliest submission so
  // the candidate sees the artifact that crossed the bar first.
  // Both SELECTs depend only on assignment.id (and invitation.userId for
  // the second one), so we run them in parallel to halve the cold-start
  // latency on this candidate-facing page (cycle-2 C2-AGG-4).
  const [assignmentProblemRows, submissionRows] = await Promise.all([
    db
      .select({
        problemId: assignmentProblems.problemId,
        points: assignmentProblems.points,
        problemTitle: problems.title,
        problemNumber: problems.sequenceNumber,
      })
      .from(assignmentProblems)
      .innerJoin(problems, eq(assignmentProblems.problemId, problems.id))
      .where(eq(assignmentProblems.assignmentId, assignment.id))
      .orderBy(asc(problems.sequenceNumber)),
    db
      .select({
        id: submissions.id,
        problemId: submissions.problemId,
        status: submissions.status,
        score: submissions.score,
        executionTimeMs: submissions.executionTimeMs,
        memoryUsedKb: submissions.memoryUsedKb,
        submittedAt: submissions.submittedAt,
        language: submissions.language,
      })
      .from(submissions)
      .where(
        and(
          eq(submissions.assignmentId, assignment.id),
          eq(submissions.userId, invitation.userId),
        ),
      )
      .orderBy(asc(submissions.submittedAt)),
  ]);

  // Reduce to best-by-score per problem
  const bestByProblem = new Map<string, (typeof submissionRows)[number]>();
  for (const row of submissionRows) {
    const prior = bestByProblem.get(row.problemId);
    if (!prior) {
      bestByProblem.set(row.problemId, row);
      continue;
    }
    const priorScore = prior.score ?? 0;
    const rowScore = row.score ?? 0;
    if (rowScore > priorScore) {
      bestByProblem.set(row.problemId, row);
    }
  }

  // submissions.score is a percentage (0-100); assignmentProblems.points is the
  // per-problem weight. The candidate-facing total must use weighted points,
  // not raw percentages, otherwise three 25-point problems at 80%/60%/100%
  // would render as `240 / 75` instead of the expected `60 / 75`. Use the
  // canonical scoring helper so the recruit page stays in lockstep with the
  // leaderboard / stats / assignment-status views.
  const adjustedByProblem = new Map<string, number>();
  let totalScore = 0;
  let totalPossible = 0;
  for (const ap of assignmentProblemRows) {
    const points = ap.points ?? 100;
    totalPossible += points;
    const best = bestByProblem.get(ap.problemId);
    if (best?.score !== null && best?.score !== undefined) {
      const adjusted = mapSubmissionPercentageToAssignmentPoints(best.score, points);
      adjustedByProblem.set(ap.problemId, adjusted);
      totalScore += adjusted;
    }
  }
  const showScores = !assignment.hideScoresFromCandidates;

  return (
    <Card className="w-full max-w-3xl">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{t("resultsTitle")}</CardTitle>
        <CardDescription>{assignment.title}</CardDescription>
        {assignment.organizationName && (
          <p className="text-sm text-muted-foreground">
            {t("issuedBy", { organization: assignment.organizationName })}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        {showScores && (
          <div className="rounded-lg border bg-muted/30 p-4 text-center">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("totalScore")}
            </p>
            <p className="text-3xl font-semibold">
              {formatScore(totalScore)}
              <span className="text-base font-normal text-muted-foreground"> / {formatScore(totalPossible)}</span>
            </p>
          </div>
        )}
        <div className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            {t("perProblemBreakdown")}
          </h2>
          <ul className="space-y-2">
            {assignmentProblemRows.map((ap) => {
              const best = bestByProblem.get(ap.problemId);
              return (
                <li
                  key={ap.problemId}
                  className="flex items-center justify-between rounded-md border p-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {ap.problemNumber !== null && ap.problemNumber !== undefined && (
                        <span className="text-muted-foreground">#{ap.problemNumber} · </span>
                      )}
                      {ap.problemTitle}
                    </p>
                    {best ? (
                      <p className="text-xs text-muted-foreground">
                        {best.language} ·{" "}
                        {best.executionTimeMs !== null
                          ? `${best.executionTimeMs} ms`
                          : "—"}
                        {best.submittedAt
                          ? ` · ${formatDateTimeInTimeZone(best.submittedAt, locale)}`
                          : ""}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {t("noSubmissionForProblem")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {best ? (
                      <SubmissionStatusBadge
                        status={best.status ?? "pending"}
                        label={best.status ?? "pending"}
                      />
                    ) : (
                      <Badge variant="secondary">{t("notAttempted")}</Badge>
                    )}
                    {showScores && (
                      <span className="font-mono text-sm">
                        {formatScore(adjustedByProblem.get(ap.problemId) ?? 0)} / {formatScore(ap.points ?? 100)}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        {assignment.contactEmail && (
          <p className="text-xs text-center text-muted-foreground">
            {t("contactPrompt")}{" "}
            <a className="underline" href={`mailto:${assignment.contactEmail}`}>
              {assignment.contactEmail}
            </a>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
