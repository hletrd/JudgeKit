"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SubmissionStatusBadge } from "@/components/submission-status-badge";
import { formatDateTimeInTimeZone } from "@/lib/datetime";
import { formatScore } from "@/lib/formatting";
import { getLanguageDisplayLabel } from "@/lib/judge/languages";
import { buildStatusLabels } from "@/lib/judge/status-labels";
import { buildLocalePath } from "@/lib/locale-paths";
import { formatSubmissionIdPrefix } from "@/lib/submissions/format";
import type { ProblemSubmissionHistoryRow } from "@/lib/submissions/problem-history";

type ProblemSubmissionHistoryProps = {
  rows: ProblemSubmissionHistoryRow[];
  /** The submission this page shows; its row is marked instead of linked. */
  currentId: string;
  timeZone: string;
};

export function ProblemSubmissionHistory({ rows, currentId, timeZone }: ProblemSubmissionHistoryProps) {
  const t = useTranslations("submissions");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const statusLabels = buildStatusLabels(t);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("forProblem")}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noOtherSubmissions")}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.id")}</TableHead>
                  <TableHead>{t("table.language")}</TableHead>
                  <TableHead>{t("table.status")}</TableHead>
                  <TableHead>{t("table.score")}</TableHead>
                  <TableHead>{t("table.submittedAt")}</TableHead>
                  <TableHead>{t("table.action")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const isCurrent = row.id === currentId;
                  const href = buildLocalePath(`/submissions/${row.id}`, locale);

                  return (
                    <TableRow
                      key={row.id}
                      aria-current={isCurrent ? "page" : undefined}
                      className={isCurrent ? "bg-muted/50" : undefined}
                    >
                      <TableCell className="font-mono text-xs">
                        {isCurrent ? (
                          <span className="inline-flex items-center gap-2">
                            {formatSubmissionIdPrefix(row.id)}
                            <Badge variant="secondary" className="font-sans">{t("currentSubmission")}</Badge>
                          </span>
                        ) : (
                          <Link href={href} className="text-primary hover:underline">
                            {formatSubmissionIdPrefix(row.id)}
                          </Link>
                        )}
                      </TableCell>
                      <TableCell>{getLanguageDisplayLabel(row.language)}</TableCell>
                      <TableCell>
                        <SubmissionStatusBadge
                          label={statusLabels[row.status as keyof typeof statusLabels] ?? row.status}
                          status={row.status}
                          executionTimeMs={row.executionTimeMs}
                          memoryUsedKb={row.memoryUsedKb}
                          score={row.score}
                          failedTestCaseIndex={row.failedTestCaseIndex}
                          runtimeErrorType={row.runtimeErrorType}
                          locale={locale}
                        />
                      </TableCell>
                      <TableCell>{formatScore(row.score, locale)}</TableCell>
                      <TableCell>
                        {row.submittedAt !== null
                          ? formatDateTimeInTimeZone(row.submittedAt, locale, timeZone)
                          : "-"}
                      </TableCell>
                      <TableCell>
                        {isCurrent ? null : (
                          <Link href={href}>
                            <Button variant="outline" size="sm">{tCommon("view")}</Button>
                          </Link>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
