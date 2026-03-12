"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CodeViewer } from "@/components/code/code-viewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SubmissionStatusBadge } from "@/components/submission-status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api/client";
import { toast } from "sonner";
import { formatDateTimeInTimeZone, formatRelativeTimeFromNow } from "@/lib/datetime";
import { ACTIVE_SUBMISSION_STATUSES } from "@/lib/submissions/status";
import { formatSubmissionIdPrefix } from "@/lib/submissions/id";
import { useTranslations, useLocale } from "next-intl";

type SubmissionResultView = {
  id: string;
  status: string;
  executionTimeMs: number | null;
  memoryUsedKb: number | null;
  testCase: {
    sortOrder: number | null;
  } | null;
};

type SubmissionDetailView = {
  id: string;
  assignmentId: string | null;
  language: string;
  status: string;
  sourceCode: string;
  compileOutput: string | null;
  executionTimeMs: number | null;
  memoryUsedKb: number | null;
  score: number | null;
  submittedAt: number | null;
  user: {
    name: string | null;
  } | null;
  problem: {
    id: string;
    title: string;
  } | null;
  results: SubmissionResultView[];
};

type CommentView = {
  id: string;
  content: string;
  createdAt: string | number | null;
  author: {
    name: string | null;
    role: string;
  } | null;
};

type SubmissionDetailClientProps = {
  showDetailedResults: boolean;
  initialSubmission: SubmissionDetailView;
  backHref: string;
  timeZone: string;
  userRole: string;
};

function normalizeSubmission(data: Record<string, unknown>): SubmissionDetailView {
  const results = Array.isArray(data.results)
    ? data.results.map((result) => {
        const record = result as Record<string, unknown>;
        const testCase = record.testCase as Record<string, unknown> | null;

        return {
          id: String(record.id),
          status: String(record.status),
          executionTimeMs:
            typeof record.executionTimeMs === "number" ? record.executionTimeMs : null,
          memoryUsedKb: typeof record.memoryUsedKb === "number" ? record.memoryUsedKb : null,
          testCase: testCase
            ? {
                sortOrder:
                  typeof testCase.sortOrder === "number" ? testCase.sortOrder : null,
              }
            : null,
        };
      })
    : [];

  const user = data.user as Record<string, unknown> | null;
  const problem = data.problem as Record<string, unknown> | null;
  const submittedAtValue = data.submittedAt;
  const submittedAt =
    typeof submittedAtValue === "number"
      ? submittedAtValue
      : typeof submittedAtValue === "string"
        ? Date.parse(submittedAtValue)
        : null;

  return {
    id: String(data.id),
    assignmentId: typeof data.assignmentId === "string" ? data.assignmentId : null,
    language: String(data.language),
    status: String(data.status),
    sourceCode: String(data.sourceCode),
    compileOutput: typeof data.compileOutput === "string" ? data.compileOutput : null,
    executionTimeMs: typeof data.executionTimeMs === "number" ? data.executionTimeMs : null,
    memoryUsedKb: typeof data.memoryUsedKb === "number" ? data.memoryUsedKb : null,
    score: typeof data.score === "number" ? data.score : null,
    submittedAt,
    user: user
      ? {
          name: typeof user.name === "string" ? user.name : null,
        }
      : null,
    problem:
      problem && typeof problem.id === "string" && typeof problem.title === "string"
        ? {
            id: problem.id,
            title: problem.title,
          }
        : null,
    results,
  };
}


export function SubmissionDetailClient(props: SubmissionDetailClientProps) {
  const t = useTranslations("submissions");
  const tCommon = useTranslations("common");
  const tComments = useTranslations("comments");
  const locale = useLocale();

  const [submission, setSubmission] = useState(props.initialSubmission);
  const [pollingError, setPollingError] = useState(false);
  const [comments, setComments] = useState<CommentView[]>([]);
  const [commentContent, setCommentContent] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
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
  const sortedResults = useMemo(
    () =>
      [...submission.results].sort(
        (left, right) => (left.testCase?.sortOrder ?? 0) - (right.testCase?.sortOrder ?? 0)
      ),
    [submission.results]
  );

  useEffect(() => {
    if (!isLive) {
      setPollingError(false);
      return undefined;
    }

    let isCancelled = false;
    let timeoutId: number | null = null;
    let delayMs = 3000;

    function clearScheduledRefresh() {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
    }

    function scheduleRefresh() {
      clearScheduledRefresh();

      if (isCancelled || document.visibilityState === "hidden") {
        return;
      }

      timeoutId = window.setTimeout(() => {
        void refreshSubmission();
      }, delayMs);
    }

    async function refreshSubmission() {
      if (document.visibilityState === "hidden") {
        clearScheduledRefresh();
        return;
      }

      try {
        const response = await apiFetch(`/api/v1/submissions/${submission.id}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("submissionRefreshFailed");
        }

        const payload = (await response.json()) as { data?: Record<string, unknown> };

        if (!payload.data) {
          throw new Error("submissionPayloadMissing");
        }

        if (isCancelled) {
          return;
        }

        const nextSubmission = normalizeSubmission(payload.data);
        setSubmission(nextSubmission);
        setPollingError(false);
        delayMs = 3000;

        if (ACTIVE_SUBMISSION_STATUSES.has(nextSubmission.status)) {
          scheduleRefresh();
        }
      } catch {
        if (isCancelled) {
          return;
        }

        setPollingError(true);
        delayMs = Math.min(delayMs * 2, 30000);
        scheduleRefresh();
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        clearScheduledRefresh();
        return;
      }

      if (!isCancelled) {
        void refreshSubmission();
      }
    }

    void refreshSubmission();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isCancelled = true;
      clearScheduledRefresh();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isLive, submission.id]);

  const fetchComments = useCallback(async () => {
    try {
      const response = await apiFetch(`/api/v1/submissions/${submission.id}/comments`);
      if (response.ok) {
        const payload = (await response.json()) as { data?: CommentView[] };
        if (payload.data) {
          setComments(payload.data);
        }
      }
    } catch {
      toast.error(tComments("loadError"));
    }
  }, [submission.id]);

  useEffect(() => {
    void fetchComments();
  }, [fetchComments]);

  async function handleCommentSubmit() {
    if (!commentContent.trim() || commentSubmitting) return;

    setCommentSubmitting(true);
    try {
      const response = await apiFetch(`/api/v1/submissions/${submission.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: commentContent.trim() }),
      });

      if (response.ok) {
        setCommentContent("");
        void fetchComments();
      }
    } catch {
      toast.error(tComments("submitError"));
    } finally {
      setCommentSubmitting(false);
    }
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

      {props.showDetailedResults ? (
        <>
          {submission.compileOutput && (
            <Card>
              <CardHeader>
                <CardTitle>{t("compileOutput")}</CardTitle>
              </CardHeader>
              <CardContent>
                <CodeViewer
                  ariaLabel={t("compileOutput")}
                  language="plaintext"
                  minHeight={140}
                  tone="danger"
                  value={submission.compileOutput}
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{t("testCaseResults")}</CardTitle>
              <CardDescription>{t("testCaseResultsDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("testCaseTable.testCase")}</TableHead>
                    <TableHead>{t("testCaseTable.status")}</TableHead>
                    <TableHead>{t("testCaseTable.time")}</TableHead>
                    <TableHead>{t("testCaseTable.memory")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedResults.map((result, index) => (
                    <TableRow key={result.id}>
                      <TableCell>#{index + 1}</TableCell>
                      <TableCell>
                        <SubmissionStatusBadge
                          label={t(`status.${result.status}` as Parameters<typeof t>[0]) ?? result.status}
                          status={result.status}
                        />
                      </TableCell>
                      <TableCell>{result.executionTimeMs !== null ? result.executionTimeMs : "-"}</TableCell>
                      <TableCell>{result.memoryUsedKb !== null ? result.memoryUsedKb : "-"}</TableCell>
                    </TableRow>
                  ))}

                  {sortedResults.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        {t("noResults")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-6">
            <p className="text-center text-muted-foreground">{t("detailedResultsHidden")}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{tComments("title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {comments.length === 0 && (
            <p className="text-sm text-muted-foreground">{tComments("noComments")}</p>
          )}

          {comments.map((comment) => (
            <div key={comment.id} className="rounded-md border p-3 space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">
                  {tComments("by", { author: comment.author?.name ?? "-" })}
                </span>
                {comment.author?.role && (
                  <Badge variant="secondary" className="text-xs">
                    {tCommon(`roles.${comment.author.role}` as Parameters<typeof tCommon>[0]) ?? comment.author.role}
                  </Badge>
                )}
                <span className="text-muted-foreground text-xs">
                  {comment.createdAt != null ? formatRelativeTimeFromNow(comment.createdAt) : ""}
                </span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
            </div>
          ))}

          {canComment && (
            <div className="space-y-2 pt-2">
              <Textarea
                placeholder={tComments("placeholder")}
                value={commentContent}
                onChange={(e) => setCommentContent(e.target.value)}
                maxLength={2000}
                rows={3}
              />
              <Button
                onClick={() => void handleCommentSubmit()}
                disabled={commentSubmitting || !commentContent.trim()}
                size="sm"
              >
                {tComments("submit")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
