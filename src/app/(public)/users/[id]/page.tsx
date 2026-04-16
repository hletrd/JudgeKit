import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { eq, sql } from "drizzle-orm";
import { rawQueryAll, rawQueryOne } from "@/lib/db/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { calculateTier } from "@/lib/ratings";
import { TierBadge } from "@/components/tier-badge";
import { buildLocalePath, NO_INDEX_METADATA } from "@/lib/seo";
import { getProblemTierInfo } from "@/lib/problem-tiers";
import { getLanguageDisplayLabel } from "@/lib/judge/languages";
import { UserStatsDashboard } from "@/components/user/user-stats-dashboard";
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

  const solvedProblemMetaRows = await rawQueryAll<{
    problemId: string;
    difficulty: number | null;
    tagName: string | null;
  }>(
    `
    WITH solved_problem_ids AS (
      SELECT DISTINCT s.problem_id
      FROM submissions s
      INNER JOIN problems p ON p.id = s.problem_id
      WHERE s.user_id = @id
        AND s.status = 'accepted'
        AND p.visibility = 'public'
    )
    SELECT
      p.id as "problemId",
      p.difficulty,
      t.name as "tagName"
    FROM solved_problem_ids sp
    INNER JOIN problems p ON p.id = sp.problem_id
    LEFT JOIN problem_tags pt ON pt.problem_id = p.id
    LEFT JOIN tags t ON t.id = pt.tag_id
    `,
    { id }
  );

  const languageUsageRows = await rawQueryAll<{
    language: string;
    count: number;
  }>(
    `
    SELECT
      s.language,
      COUNT(*)::int as count
    FROM submissions s
    WHERE s.user_id = @id
    GROUP BY s.language
    ORDER BY count DESC, s.language ASC
    LIMIT 8
    `,
    { id }
  );

  const activityRows = await rawQueryAll<{
    day: string;
    count: number;
  }>(
    `
    SELECT
      TO_CHAR(DATE(s.submitted_at), 'YYYY-MM-DD') as day,
      COUNT(*)::int as count
    FROM submissions s
    WHERE s.user_id = @id
      AND s.status = 'accepted'
      AND s.submitted_at >= NOW() - INTERVAL '90 days'
    GROUP BY DATE(s.submitted_at)
    ORDER BY DATE(s.submitted_at) ASC
    `,
    { id }
  );

  const difficultyCounts = new Map<string, { tier: NonNullable<ReturnType<typeof getProblemTierInfo>>["tier"]; label: string; count: number }>();
  const seenSolvedProblems = new Set<string>();
  const categoryCounts = new Map<string, number>();

  for (const row of solvedProblemMetaRows) {
    if (!seenSolvedProblems.has(row.problemId)) {
      seenSolvedProblems.add(row.problemId);
      const tierInfo = getProblemTierInfo(row.difficulty);
      if (tierInfo) {
        const existing = difficultyCounts.get(tierInfo.label);
        difficultyCounts.set(tierInfo.label, {
          tier: tierInfo.tier,
          label: tierInfo.label,
          count: (existing?.count ?? 0) + 1,
        });
      }
    }

    if (row.tagName) {
      categoryCounts.set(row.tagName, (categoryCounts.get(row.tagName) ?? 0) + 1);
    }
  }

  const activityMap = new Map(activityRows.map((row) => [row.day, row.count]));
  const activityDays = Array.from({ length: 90 }, (_, index) => {
    const day = new Date();
    day.setDate(day.getDate() - (89 - index));
    const key = day.toISOString().slice(0, 10);
    return {
      date: key,
      count: activityMap.get(key) ?? 0,
    };
  });

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

      <UserStatsDashboard
        title={t("activityHeatmap")}
        difficultyTitle={t("difficultyBreakdown")}
        categoryTitle={t("categoryBreakdown")}
        languageTitle={t("languageBreakdown")}
        activityTitle={t("activityHeatmap")}
        emptyLabel={t("noStats")}
        tierStats={Array.from(difficultyCounts.values()).sort((left, right) => right.count - left.count)}
        categoryStats={Array.from(categoryCounts.entries())
          .map(([label, count]) => ({ label, count }))
          .sort((left, right) => right.count - left.count)
          .slice(0, 12)}
        languageStats={languageUsageRows.map((row) => ({
          label: getLanguageDisplayLabel(row.language),
          count: row.count,
        }))}
        activityDays={activityDays}
      />

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
