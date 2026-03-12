"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CodeViewer } from "@/components/code/code-viewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmissionStatusBadge } from "@/components/submission-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api/client";
import { toast } from "sonner";
import { formatDateTimeInTimeZone } from "@/lib/datetime";
import { ACTIVE_SUBMISSION_STATUSES } from "@/lib/submissions/status";
import { formatSubmissionIdPrefix } from "@/lib/submissions/id";
import { useTranslations, useLocale } from "next-intl";
import { useSubmissionPolling, normalizeSubmission } from "@/hooks/use-submission-polling";
import type { SubmissionDetailView } from "@/hooks/use-submission-polling";
import { SubmissionResultPanel } from "./_components/submission-result-panel";
import { CommentSection } from "./_components/comment-section";

type SubmissionDetailClientProps = {
  showDetailedResults: boolean;
  initialSubmission: SubmissionDetailView;
  backHref: string;
  timeZone: string;
  userRole: string;
};

export function SubmissionDetailClient(props: SubmissionDetailClientProps) {
  const t = useTranslations("submissions");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const { submission, setSubmission, error: pollingError } = useSubmissionPolling(props.initialSubmission);
  const [rejudging, setRejudging] = useState(false);

  const canComment = props.userRole === "instructor" || props.userRole === "admin" || props.userRole === "super_admin";
  const canRejudge = props.userRole === "instructor" || props.userRole === "admin" || props.userRole === "super_admin";
  const isLive = ACTIVE_SUBMISSION_STATUSES.has(submission.status);
  const problemHref =
    submission.problem === null
      ? null
      : submission.assignmentId
        ? `/dashboard/problems/${submission.problem.id}?assignmentId=${submission.assignmentId}`
        : `/dashboard/problems/${submission.problem.id}`;

  async function handleRejudge() {
    if (rejudging) return;
    setRejudging(true);
    try {
      const response = await apiFetch(`/api/v1/submissions/${submission.id}/rejudge`, {
        method: "POST",
      });
      if (response.ok) {
        const payload = (await response.json()) as { data?: Record<string, unknown> };
        if (payload.data) {
          setSubmission(normalizeSubmission(payload.data));
        }
        toast.success(t("rejudgeSuccess"));
      } else {
        toast.error(t("rejudgeFailed"));
      }
    } catch {
      toast.error(t("rejudgeFailed"));
    } finally {
      setRejudging(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start gap-4">
        <div className="space-y-3">
          <div>
            <Link href={props.backHref} className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-4" />
              {tCommon("back")}
            </Link>
            <h2 className="mb-2 text-2xl font-bold">{t("submissionId", { id: formatSubmissionIdPrefix(submission.id) })}</h2>
            <div className="flex flex-wrap gap-2" role="status" aria-live="polite">
              <Badge variant="outline">
                {t("user")}: {submission.user?.name ?? "-"}
              </Badge>
              {problemHref ? (
                <Link href={problemHref} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md">
                  <Badge variant="outline" className="cursor-pointer transition-opacity hover:opacity-80">
                    {t("table.problem")}: {submission.problem?.title ?? "-"}
                  </Badge>
                </Link>
              ) : (
                <Badge variant="outline">
                  {t("table.problem")}: {submission.problem?.title ?? "-"}
                </Badge>
              )}
              <Badge variant="outline">
                {t("table.language")}: {submission.language}
              </Badge>
              <SubmissionStatusBadge
                label={t(`status.${submission.status}` as Parameters<typeof t>[0]) ?? submission.status}
                showLivePulse
                status={submission.status}
              />
            </div>
          </div>

          {isLive && (
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>{t("liveUpdatesActive")}</p>
              {pollingError && (
                <p aria-live="polite" className="text-amber-600 dark:text-amber-400">
                  {t("liveUpdatesDelayed")}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-3">
          <div className="text-right text-sm text-muted-foreground">
            <p>
              {t("submitted")}: {submission.submittedAt ? formatDateTimeInTimeZone(submission.submittedAt, locale, props.timeZone) : "-"}
            </p>
            <p>
              {t("score")}: {submission.score !== null ? submission.score : "-"}
            </p>
            <p>
              {t("time")}: {submission.executionTimeMs !== null ? t("timeValue", { value: submission.executionTimeMs }) : "-"}
            </p>
            <p>
              {t("memory")}: {submission.memoryUsedKb !== null ? t("memoryValue", { value: submission.memoryUsedKb }) : "-"}
            </p>
          </div>
          {canRejudge && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleRejudge()}
              disabled={rejudging}
            >
              {t("rejudge")}
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("sourceCode")}</CardTitle>
        </CardHeader>
        <CardContent>
          <CodeViewer
            ariaLabel={t("sourceCode")}
            language={submission.language}
            minHeight={260}
            value={submission.sourceCode}
          />
        </CardContent>
      </Card>

      <SubmissionResultPanel
        showDetailedResults={props.showDetailedResults}
        compileOutput={submission.compileOutput}
        results={submission.results}
      />

      <CommentSection
        submissionId={submission.id}
        canComment={canComment}
      />
    </div>
  );
}
