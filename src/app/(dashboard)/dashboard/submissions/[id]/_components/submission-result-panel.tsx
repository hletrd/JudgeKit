"use client";

import { useMemo } from "react";
import { CodeViewer } from "@/components/code/code-viewer";
import { SubmissionStatusBadge } from "@/components/submission-status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTranslations } from "next-intl";
import type { SubmissionResultView } from "@/hooks/use-submission-polling";

type SubmissionResultPanelProps = {
  showDetailedResults: boolean;
  compileOutput: string | null;
  results: SubmissionResultView[];
};

export function SubmissionResultPanel({ showDetailedResults, compileOutput, results }: SubmissionResultPanelProps) {
  const t = useTranslations("submissions");

  const sortedResults = useMemo(
    () =>
      [...results].sort(
        (left, right) => (left.testCase?.sortOrder ?? 0) - (right.testCase?.sortOrder ?? 0)
      ),
    [results]
  );

  if (!showDetailedResults) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-center text-muted-foreground">{t("detailedResultsHidden")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {compileOutput && (
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
              value={compileOutput}
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
  );
}
