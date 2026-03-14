import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { db, sqlite } from "@/lib/db";
import { problems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { canAccessProblem } from "@/lib/auth/permissions";
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

export default async function ProblemRankingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;

  const problem = await db.query.problems.findFirst({
    where: eq(problems.id, id),
    columns: { id: true, title: true },
  });

  if (!problem) notFound();

  const hasAccess = await canAccessProblem(
    problem.id,
    session.user.id,
    session.user.role
  );
  if (!hasAccess) redirect("/dashboard/problems");

  const t = await getTranslations("rankings");

  // For each user, get their best accepted submission (lowest exec time, then memory, then code length)
  const rankingRows = sqlite
    .prepare(
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
      WHERE s.problem_id = ? AND s.status = 'accepted'
    )
    SELECT
      u.username,
      u.name,
      r.language,
      r.execution_time_ms as executionTimeMs,
      r.memory_used_kb as memoryUsedKb,
      r.code_length as codeLength,
      r.submitted_at as submittedAt
    FROM ranked r
    INNER JOIN users u ON u.id = r.user_id
    WHERE r.rn = 1
    ORDER BY r.execution_time_ms ASC, r.memory_used_kb ASC, r.code_length ASC
  `
    )
    .all(id) as Array<{
    username: string;
    name: string;
    language: string;
    executionTimeMs: number | null;
    memoryUsedKb: number | null;
    codeLength: number;
    submittedAt: number;
  }>;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/dashboard/problems/${id}`}
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
                  <TableRow key={row.username}>
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
                      <Badge variant="outline">{row.language}</Badge>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
