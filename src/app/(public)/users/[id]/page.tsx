import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { problems, submissions } from "@/lib/db/schema";
import { eq, and, count, sql } from "drizzle-orm";
import { rawQueryAll, rawQueryOne } from "@/lib/db/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { calculateTier } from "@/lib/ratings";
import { TierBadge } from "@/components/tier-badge";
import { buildLocalePath, NO_INDEX_METADATA } from "@/lib/seo";
import Link from "next/link";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const t = await getTranslations("userProfile");
  const { id } = await params;

  const user = await db.query.users.findFirst({
    where: eq(db._.fullSchema.users.id, id),
    columns: { name: true },
  });

  if (!user) {
    return { title: t("notFound"), ...NO_INDEX_METADATA };
  }

  return {
    title: `${user.name} — ${t("title")}`,
    ...NO_INDEX_METADATA,
  };
}

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const locale = await getLocale();
  const t = await getTranslations("userProfile");
  const tRankings = await getTranslations("rankings");
  const tProblems = await getTranslations("problems");

  const user = await db.query.users.findFirst({
    where: eq(sql`id`, id),
    columns: { id: true, name: true, username: true },
  });

  if (!user) {
    notFound();
  }

  // Get user stats
  const stats = await rawQueryOne<{
    solvedCount: number;
    submissionCount: number;
    acceptedCount: number;
  }>(
    `
    SELECT
      COUNT(DISTINCT CASE WHEN s.status = 'accepted' THEN s.problem_id END)::int as "solvedCount",
      COUNT(*)::int as "submissionCount",
      COUNT(CASE WHEN s.status = 'accepted' THEN 1 END)::int as "acceptedCount"
    FROM submissions s
    WHERE s.user_id = @id
    `,
    { id }
  );

  const solvedCount = stats?.solvedCount ?? 0;
  const submissionCount = stats?.submissionCount ?? 0;
  const acceptedCount = stats?.acceptedCount ?? 0;
  const accuracy = submissionCount > 0 ? ((acceptedCount / submissionCount) * 100).toFixed(1) : "0.0";

  const tier = calculateTier(solvedCount);

  // Get solved problems
  const solvedProblems = await rawQueryAll<{
    problemId: string;
    title: string;
    sequenceNumber: number | null;
    difficulty: number | null;
    solvedAt: Date;
  }>(
    `
    WITH first_accepts AS (
      SELECT
        problem_id,
        MIN(submitted_at) as solved_at
      FROM submissions
      WHERE user_id = @id AND status = 'accepted'
      GROUP BY problem_id
    )
    SELECT
      p.id as "problemId",
      p.title,
      p.sequence_number as "sequenceNumber",
      p.difficulty,
      fa.solved_at as "solvedAt"
    FROM first_accepts fa
    INNER JOIN problems p ON p.id = fa.problem_id
    WHERE p.visibility = 'public'
    ORDER BY p.sequence_number ASC, fa.solved_at ASC
    `,
    { id }
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{user.name}</h1>
          <p className="text-sm text-muted-foreground">@{user.username}</p>
        </div>
        {tier && <TierBadge tier={tier} label={tRankings(`tiers.${tier}`)} />}
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold">{solvedCount}</div>
            <div className="text-sm text-muted-foreground">{t("solvedCount")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold">{submissionCount}</div>
            <div className="text-sm text-muted-foreground">{t("submissionCount")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold">{accuracy}%</div>
            <div className="text-sm text-muted-foreground">{t("accuracy")}</div>
          </CardContent>
        </Card>
      </div>

      {/* Solved problems */}
      <Card>
        <CardHeader>
          <CardTitle>{t("solvedProblems")}</CardTitle>
        </CardHeader>
        <CardContent>
          {solvedProblems.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noSolvedProblems")}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">{tProblems("table.number")}</TableHead>
                    <TableHead>{tProblems("table.title")}</TableHead>
                    <TableHead>{tProblems("table.difficulty")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {solvedProblems.map((problem) => (
                    <TableRow key={problem.problemId}>
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        {problem.sequenceNumber ?? "-"}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={buildLocalePath(`/practice/problems/${problem.problemId}`, locale)}
                          className="text-sm font-medium text-foreground hover:text-primary hover:underline"
                        >
                          {problem.title}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {problem.difficulty != null
                          ? problem.difficulty.toFixed(2).replace(/\.?0+$/, "")
                          : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
