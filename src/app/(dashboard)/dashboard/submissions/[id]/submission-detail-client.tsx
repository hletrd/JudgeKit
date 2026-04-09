"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
import { formatSubmissionIdPrefix } from "@/lib/submissions/format";
import { useTranslations, useLocale } from "next-intl";
import { useSubmissionPolling, normalizeSubmission } from "@/hooks/use-submission-polling";
import type { SubmissionDetailView } from "@/hooks/use-submission-polling";
import { SubmissionResultPanel } from "./_components/submission-result-panel";
import { getLanguageDisplayLabel } from "@/lib/judge/languages";
import { CommentSection } from "./_components/comment-section";

type SubmissionDetailClientProps = {
  showCompileOutput: boolean;
  showDetailedResults: boolean;
  showRuntimeErrors: boolean;
  initialSubmission: SubmissionDetailView;
  backHref: string;
  timeZone: string;
  userRole: string;
  userId: string;
  capabilities: string[];
};

export function SubmissionDetailClient(props: SubmissionDetailClientProps) {
  const t = useTranslations("submissions");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();

  const { submission, setSubmission, error: pollingError } = useSubmissionPolling(props.initialSubmission);
  const [rejudging, setRejudging] = useState(false);

  // Notify chat widget of submission results with problem context (skip for assignments/contests)
  useEffect(() => {
    if (submission && !submission.assignmentId && !["pending", "queued", "judging"].includes(submission.status)) {
      const hasError = submission.status !== "accepted";
      window.dispatchEvent(new CustomEvent("oj:submission-result", {
        detail: {
          hasError,
          status: submission.status,
          problemId: submission.problem?.id,
          assignmentId: submission.assignmentId,
          submissionId: submission.id,
        }
      }));
    }
  }, [submission]);

  const canComment = props.capabilities.includes("submissions.comment");
  const canRejudge = props.capabilities.includes("submissions.rejudge");
  const isLive = ACTIVE_SUBMISSION_STATUSES.has(submission.status);
  const problemHref =
    submission.problem === null
      ? null
      : submission.assignmentId
        ? `/dashboard/problems/${submission.problem.id}?assignmentId=${submission.assignmentId}`
        : `/dashboard/problems/${submission.problem.id}`;

  function handleResubmit() {
    if (!problemHref) return;
    const key = `oj:submission-draft:${props.userId}:${submission.problem!.id}`;
    const payload = {
      version: 1,
      updatedAt: Date.now(),
      latestLanguage: submission.language,
      drafts: {
        [submission.language]: submission.sourceCode,
      },
    };
    localStorage.setItem(key, JSON.stringify(payload));
    router.push(problemHref);
  }

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
          const updated = normalizeSubmission(payload.data);
          // Preserve sourceCode since rejudge response excludes it
          setSubmission((prev) => ({ ...updated, sourceCode: updated.sourceCode || prev.sourceCode }));
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
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div className="space-y-3">
          <div>
            <Link href={props.backHref} className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-4" />
              {tCommon("back")}
            </Link>
            <h2 className="mb-2 text-2xl font-bold">{t("submissionId", { id: formatSubmissionIdPrefix(submission.id) })}</h2>
            <div className="flex flex-wrap items-center gap-2" role="status" aria-live="polite">
              <Badge variant="outline">
                {t("user")}: {submission.user?.name ?? "-"}
              </Badge>
              {problemHref ? (
                <Link href={problemHref} className="inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md">
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
                {t("table.language")}: {getLanguageDisplayLabel(submission.language)}
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
                <div aria-live="polite" className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                  <p>{t("liveUpdatesDelayed")}</p>
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => {
                      apiFetch(`/api/v1/submissions/${submission.id}`)
                        .then((res) => res.json())
                        .then((payload: { data?: Record<string, unknown> }) => {
                          if (payload.data) {
                            const updated = normalizeSubmission(payload.data);
                            setSubmission((prev) => ({ ...updated, sourceCode: updated.sourceCode || prev.sourceCode }));
                          }
                        })
                        .catch(() => {
                          toast.error(tCommon("error"));
                        });
                    }}
                  >
                    {tCommon("retry")}
                  </Button>
                </div>
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
              {t("score")}: {submission.score !== null ? Math.round(submission.score * 100) / 100 : "-"}
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
          {problemHref && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleResubmit}
            >
              {t("resubmit")}
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
        showCompileOutput={props.showCompileOutput}
        showDetailedResults={props.showDetailedResults}
        showRuntimeErrors={props.showRuntimeErrors}
        compileOutput={submission.compileOutput}
        results={submission.results}
      />

      {!submission.assignmentId && (
        <CommentSection
          submissionId={submission.id}
          canComment={canComment}
        />
      )}
    </div>
  );
}
