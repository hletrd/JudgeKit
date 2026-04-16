import { notFound } from "next/navigation";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { rawQueryAll } from "@/lib/db/queries";
import { problems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import { getLanguageDisplayLabel } from "@/lib/judge/languages";
import { buildLocalePath, NO_INDEX_METADATA } from "@/lib/seo";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const t = await getTranslations("rankings");
  const { id } = await params;
  const problem = await db.query.problems.findFirst({
    where: eq(problems.id, id),
    columns: { title: true, visibility: true },
  });
  if (!problem || problem.visibility !== "public") return { ...NO_INDEX_METADATA };

  return {
    title: `${t("problemRankings")} — ${problem.title}`,
    description: t("problemRankingsDescription"),
    ...NO_INDEX_METADATA,
  };
}

export default async function PublicProblemRankingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const locale = await getLocale();
  const t = await getTranslations("rankings");

  const problem = await db.query.problems.findFirst({
    where: eq(problems.id, id),
    columns: { id: true, title: true, visibility: true },
  });

  if (!problem || problem.visibility !== "public") {
    notFound();
  }

  // Best accepted submissions per user
  const rankingRows = await rawQueryAll<{
    userId: string;
    username: string;
    name: string;
    language: string;
    executionTimeMs: number | null;
    memoryUsedKb: number | null;
    codeLength: number;
    submittedAt: Date;
  }>(
    `
    WITH ranked AS (
      SELECT
        s.user_id,
        s.language,
        s.execution_time_ms,
        s.memory_used_kb,
        LENGTH(s.source_code) as code_length,
        s.submitted_at,
        ROW_NUMBER() OVER (
          PARTITION BY s.user_id
          ORDER BY s.execution_time_ms ASC, s.memory_used_kb ASC, LENGTH(s.source_code) ASC
        ) as rn
      FROM submissions s
      WHERE s.problem_id = @id AND s.status = 'accepted'
    )
    SELECT
      u.id as "userId",
      u.username,
      u.name,
      r.language,
      r.execution_time_ms as "executionTimeMs",
      r.memory_used_kb as "memoryUsedKb",
      r.code_length as "codeLength",
      r.submitted_at as "submittedAt"
    FROM ranked r
    INNER JOIN users u ON u.id = r.user_id
    WHERE r.rn = 1
    ORDER BY r.execution_time_ms ASC, r.memory_used_kb ASC, r.code_length ASC
    `,
    { id }
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={buildLocalePath(`/practice/problems/${id}`, locale)}
          className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {problem.title}
        </Link>
        <h2 className="text-2xl font-bold">{t("problemRankings")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("problemRankingsDescription")}
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {rankingRows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              {t("noProblemRankings")}
            </p>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">{t("rank")}</TableHead>
                      <TableHead>{t("username")}</TableHead>
                      <TableHead>{t("name")}</TableHead>
                      <TableHead>{t("language")}</TableHead>
                      <TableHead className="text-right">
                        {t("executionTime")}
                      </TableHead>
                      <TableHead className="text-right">
                        {t("memoryUsed")}
                      </TableHead>
                      <TableHead className="text-right">
                        {t("codeLength")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rankingRows.map((row, index) => (
                      <TableRow key={row.userId}>
                        <TableCell>
                          <Badge variant={index < 3 ? "default" : "secondary"}>
                            {index + 1}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {row.username}
                        </TableCell>
                        <TableCell>{row.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{getLanguageDisplayLabel(row.language)}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {row.executionTimeMs ?? "-"}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {row.memoryUsedKb ?? "-"}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {row.codeLength}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {/* Mobile cards */}
              <ul className="md:hidden divide-y" role="list">
                {rankingRows.map((row, index) => (
                  <li key={row.userId} className="flex items-center gap-3 px-4 py-3">
                    <Badge variant={index < 3 ? "default" : "secondary"}>
                      {index + 1}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{row.name}</div>
                      <div className="text-sm text-muted-foreground">
                        @{row.username} · {getLanguageDisplayLabel(row.language)}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-sm">
                      <div className="font-mono">{row.executionTimeMs ?? "-"}ms</div>
                      <div className="text-xs text-muted-foreground">{row.memoryUsedKb ?? "-"}KB</div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
