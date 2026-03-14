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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("rankings");
  return { title: t("title") };
}

export default async function RankingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const t = await getTranslations("rankings");

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
  `
    )
    .all() as Array<{
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
                        <Badge variant={index < 3 ? "default" : "secondary"}>
                          {index + 1}
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
    </div>
  );
}
