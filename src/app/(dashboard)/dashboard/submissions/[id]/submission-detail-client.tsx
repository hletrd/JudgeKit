"use client";

import { useState, useEffect, useRef } from "react";
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
import { formatScore } from "@/lib/formatting";
import { ACTIVE_SUBMISSION_STATUSES } from "@/lib/submissions/status";
import { formatSubmissionIdPrefix } from "@/lib/submissions/format";
import { useTranslations, useLocale } from "next-intl";
import { useSubmissionPolling, normalizeSubmission } from "@/hooks/use-submission-polling";
import type { SubmissionDetailView } from "@/hooks/use-submission-polling";
import { SubmissionResultPanel } from "./_components/submission-result-panel";
import { getLanguageDisplayLabel } from "@/lib/judge/languages";
import { CommentSection } from "./_components/comment-section";
import { LiveSubmissionStatus } from "./_components/live-submission-status";

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
  problemTimeLimitMs?: number | null;
  canViewSource?: boolean;
  isOwner?: boolean;
};

export function SubmissionDetailClient(props: SubmissionDetailClientProps) {
  const t = useTranslations("submissions");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();

  const { submission, setSubmission, error: pollingError } = useSubmissionPolling(props.initialSubmission);
  const [rejudging, setRejudging] = useState(false);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [gradingTestCase, setGradingTestCase] = useState<string | null>(null);

  // Notify chat widget of submission results with problem context (skip for assignments/contests)
  const firedEventRef = useRef<string | null>(null);
  useEffect(() => {
    const key = `${submission.id}:${submission.status}`;
    if (firedEventRef.current === key) return;
    if (submission.assignmentId) return;
    if (["pending", "queued", "judging"].includes(submission.status)) return;
    firedEventRef.current = key;
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
  }, [submission.id, submission.status, submission.assignmentId, submission.problem?.id]);

  const canComment = props.capabilities.includes("submissions.comment");
  const canRejudge = props.capabilities.includes("submissions.rejudge");
  const canViewSource = props.canViewSource ?? true;
  const isOwner = props.isOwner ?? true;
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
    try { localStorage.setItem(key, JSON.stringify(payload)); } catch { /* quota exceeded or private browsing */ }
    router.push(problemHref);
  }

  function handleRetryRefresh() {
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
  }

  useEffect(() => {
    if (!isLive) {
      setQueuePosition(null);
      setGradingTestCase(null);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const pollQueueStatus = async () => {
      if (document.visibilityState === "hidden") {
        return;
      }

      try {
        const response = await apiFetch(`/api/v1/submissions/${submission.id}/queue-status`, {
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }

        const payload = await response.json() as { data?: { queuePosition?: number | null; gradingTestCase?: string | null } };
        if (!cancelled) {
          setQueuePosition(typeof payload.data?.queuePosition === "number" ? payload.data.queuePosition : null);
          setGradingTestCase(typeof payload.data?.gradingTestCase === "string" ? payload.data.gradingTestCase : null);
        }
      } catch {
        // Best-effort only; submission status polling still continues.
      }
    };

    const schedule = () => {
      if (cancelled) {
        return;
      }
      timer = setTimeout(async () => {
        await pollQueueStatus();
        schedule();
      }, 5000);
    };

    void pollQueueStatus();
    schedule();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void pollQueueStatus();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isLive, submission.id]);

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
            <h1 className="mb-2 text-2xl font-bold">{t("submissionId", { id: formatSubmissionIdPrefix(submission.id) })}</h1>
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
                executionTimeMs={submission.executionTimeMs}
                memoryUsedKb={submission.memoryUsedKb}
                score={submission.score}
                failedTestCaseIndex={submission.failedTestCaseIndex}
                runtimeErrorType={submission.runtimeErrorType}
                timeLimitMs={props.problemTimeLimitMs ?? null}
              />
            </div>
          </div>

          {isLive && (
            <LiveSubmissionStatus
              status={submission.status}
              queuePosition={queuePosition}
              gradingTestCase={gradingTestCase}
              pollingError={pollingError}
              liveUpdatesActiveLabel={t("liveUpdatesActive")}
              queueAheadLabel={t("queueAhead", { count: queuePosition ?? 0 })}
              judgingProgressLabel={t("judgingProgress", { progress: gradingTestCase ?? "" })}
              judgingInProgressLabel={t("judgingInProgress")}
              liveUpdatesDelayedLabel={t("liveUpdatesDelayed")}
              retryLabel={tCommon("retry")}
              onRetry={handleRetryRefresh}
            />
          )}
        </div>

        <div className="flex flex-col items-end gap-3">
          <div className="text-right text-sm text-muted-foreground">
            <p>
              {t("submitted")}: {submission.submittedAt ? formatDateTimeInTimeZone(submission.submittedAt, locale, props.timeZone) : "-"}
            </p>
            <p>
              {t("score")}: {submission.score !== null ? formatScore(submission.score, locale) : "-"}
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
          {problemHref && isOwner && (
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
          {canViewSource ? (
            <CodeViewer
              ariaLabel={t("sourceCode")}
              language={submission.language}
              minHeight={260}
              value={submission.sourceCode}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t("sourceHidden")}</p>
          )}
        </CardContent>
      </Card>

      <SubmissionResultPanel
        showCompileOutput={props.showCompileOutput}
        showDetailedResults={props.showDetailedResults}
        showRuntimeErrors={props.showRuntimeErrors}
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
