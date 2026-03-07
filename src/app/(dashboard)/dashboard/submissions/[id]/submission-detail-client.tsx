"use client";

import { useEffect, useMemo, useState } from "react";
import { CodeViewer } from "@/components/code/code-viewer";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTimeInTimeZone } from "@/lib/datetime";
import { ACTIVE_SUBMISSION_STATUSES, getSubmissionStatusVariant } from "@/lib/submissions/status";

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

type SubmissionDetailClientProps = {
  initialSubmission: SubmissionDetailView;
  headingLabel: string;
  statusLabels: Record<string, string>;
  submittedLabel: string;
  scoreLabel: string;
  timeLabel: string;
  memoryLabel: string;
  userLabel: string;
  sourceCodeLabel: string;
  compileOutputLabel: string;
  testCaseResultsLabel: string;
  testCaseResultsDescription: string;
  noResultsLabel: string;
  liveUpdatesLabel: string;
  locale: string;
  timeZone: string;
  timeValueLabel: string;
  memoryValueLabel: string;
  tableProblemLabel: string;
  tableLanguageLabel: string;
  testCaseTableLabels: {
    testCase: string;
    status: string;
    time: string;
    memory: string;
  };
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
  const [submission, setSubmission] = useState(props.initialSubmission);
  const isLive = ACTIVE_SUBMISSION_STATUSES.has(submission.status);
  const sortedResults = useMemo(
    () =>
      [...submission.results].sort(
        (left, right) => (left.testCase?.sortOrder ?? 0) - (right.testCase?.sortOrder ?? 0)
      ),
    [submission.results]
  );

  useEffect(() => {
    if (!isLive) {
      return undefined;
    }

    let isCancelled = false;

    async function refreshSubmission() {
      try {
        const response = await fetch(`/api/v1/submissions/${submission.id}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { data?: Record<string, unknown> };

        if (!isCancelled && payload.data) {
          setSubmission(normalizeSubmission(payload.data));
        }
      } catch {
        return;
      }
    }

    void refreshSubmission();
    const intervalId = window.setInterval(() => {
      void refreshSubmission();
    }, 3000);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [isLive, submission.id]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start gap-4">
        <div className="space-y-3">
          <div>
            <h2 className="mb-2 text-2xl font-bold">{props.headingLabel}</h2>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                {props.userLabel}: {submission.user?.name ?? "-"}
              </Badge>
              <Badge variant="outline">
                {props.tableProblemLabel}: {submission.problem?.title ?? "-"}
              </Badge>
              <Badge variant="outline">
                {props.tableLanguageLabel}: {submission.language}
              </Badge>
              <Badge variant={getSubmissionStatusVariant(submission.status)}>
                {ACTIVE_SUBMISSION_STATUSES.has(submission.status) && (
                  <span className="mr-1 inline-flex size-2 rounded-full bg-current animate-pulse" />
                )}
                {props.statusLabels[submission.status] ?? submission.status}
              </Badge>
            </div>
          </div>

          {isLive && <p className="text-sm text-muted-foreground">{props.liveUpdatesLabel}</p>}
        </div>

        <div className="text-right text-sm text-muted-foreground">
          <p>
            {props.submittedLabel}: {submission.submittedAt ? formatDateTimeInTimeZone(submission.submittedAt, props.locale, props.timeZone) : "-"}
          </p>
          <p>
            {props.scoreLabel}: {submission.score !== null ? submission.score : "-"}
          </p>
          <p>
            {props.timeLabel}: {submission.executionTimeMs !== null ? props.timeValueLabel.replace("{value}", String(submission.executionTimeMs)) : "-"}
          </p>
          <p>
            {props.memoryLabel}: {submission.memoryUsedKb !== null ? props.memoryValueLabel.replace("{value}", String(submission.memoryUsedKb)) : "-"}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{props.sourceCodeLabel}</CardTitle>
        </CardHeader>
        <CardContent>
          <CodeViewer
            ariaLabel={props.sourceCodeLabel}
            language={submission.language}
            minHeight={260}
            value={submission.sourceCode}
          />
        </CardContent>
      </Card>

      {submission.compileOutput && (
        <Card>
          <CardHeader>
            <CardTitle>{props.compileOutputLabel}</CardTitle>
          </CardHeader>
          <CardContent>
            <CodeViewer
              ariaLabel={props.compileOutputLabel}
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
          <CardTitle>{props.testCaseResultsLabel}</CardTitle>
          <CardDescription>{props.testCaseResultsDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{props.testCaseTableLabels.testCase}</TableHead>
                <TableHead>{props.testCaseTableLabels.status}</TableHead>
                <TableHead>{props.testCaseTableLabels.time}</TableHead>
                <TableHead>{props.testCaseTableLabels.memory}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedResults.map((result, index) => (
                <TableRow key={result.id}>
                  <TableCell>#{index + 1}</TableCell>
                  <TableCell>
                    <Badge variant={getSubmissionStatusVariant(result.status)}>
                      {props.statusLabels[result.status] ?? result.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{result.executionTimeMs !== null ? result.executionTimeMs : "-"}</TableCell>
                  <TableCell>{result.memoryUsedKb !== null ? result.memoryUsedKb : "-"}</TableCell>
                </TableRow>
              ))}

              {sortedResults.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    {props.noResultsLabel}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
