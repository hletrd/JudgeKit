import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { sqlite } from "@/lib/db";
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
import { formatRelativeTimeFromNow } from "@/lib/datetime";
import { PaginationControls } from "@/components/pagination-controls";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("rankings");
  return { title: t("title") };
}

export default async function RankingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const PAGE_SIZE = 50;
  const currentPage = Math.max(1, Math.floor(Number(resolvedSearchParams?.page ?? "1")) || 1);

  const t = await getTranslations("rankings");

  const countRow = sqlite
    .prepare(
      `
    WITH first_accepts AS (
      SELECT
        user_id,
        problem_id,
        MIN(submitted_at) as first_accepted_at
      FROM submissions
      WHERE status = 'accepted'
      GROUP BY user_id, problem_id
    )
    SELECT COUNT(DISTINCT fa.user_id) as total
    FROM first_accepts fa
    INNER JOIN users u ON u.id = fa.user_id
    WHERE u.is_active = 1
  `
    )
    .get() as { total: number };
  const totalCount = countRow?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const clampedPage = Math.min(currentPage, totalPages);
  const clampedOffset = (clampedPage - 1) * PAGE_SIZE;

  const rankingRows = sqlite
    .prepare(
      `
    WITH first_accepts AS (
      SELECT
        user_id,
        problem_id,
        MIN(submitted_at) as first_accepted_at
      FROM submissions
      WHERE status = 'accepted'
      GROUP BY user_id, problem_id
    )
    SELECT
      u.id as userId,
      u.username as username,
      u.name as name,
      u.class_name as className,
      COUNT(fa.problem_id) as solvedCount,
      MAX(fa.first_accepted_at) as lastSolveTime
    FROM users u
    INNER JOIN first_accepts fa ON fa.user_id = u.id
    WHERE u.is_active = 1
    GROUP BY u.id
    ORDER BY solvedCount DESC, lastSolveTime ASC
    LIMIT ? OFFSET ?
  `
    )
    .all(PAGE_SIZE, clampedOffset) as Array<{
    userId: string;
    username: string;
    name: string;
    className: string | null;
    solvedCount: number;
    lastSolveTime: number;
  }>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <Card>
        <CardContent className="p-0">
          {rankingRows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              {t("noRankings")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">{t("rank")}</TableHead>
                    <TableHead>{t("username")}</TableHead>
                    <TableHead>{t("name")}</TableHead>
                    <TableHead>{t("className")}</TableHead>
                    <TableHead className="text-right">
                      {t("solvedCount")}
                    </TableHead>
                    <TableHead>{t("lastSolveTime")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rankingRows.map((row, index) => (
                    <TableRow key={row.userId}>
                      <TableCell>
                        <Badge variant={clampedOffset + index < 3 ? "default" : "secondary"}>
                          {clampedOffset + index + 1}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {row.username}
                      </TableCell>
                      <TableCell>{row.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.className ?? "-"}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {row.solvedCount}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatRelativeTimeFromNow(
                          new Date(row.lastSolveTime * 1000)
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      <PaginationControls
        currentPage={clampedPage}
        hasNextPage={clampedPage < totalPages}
        prevHref={clampedPage > 1 ? `/dashboard/rankings?page=${clampedPage - 1}` : undefined}
        nextHref={clampedPage < totalPages ? `/dashboard/rankings?page=${clampedPage + 1}` : undefined}
        rangeText={totalCount > 0 ? `${clampedOffset + 1}–${Math.min(clampedOffset + PAGE_SIZE, totalCount)} / ${totalCount}` : undefined}
      />
    </div>
  );
}
