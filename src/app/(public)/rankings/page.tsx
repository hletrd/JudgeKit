import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { rawQueryOne, rawQueryAll } from "@/lib/db/queries";
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
import { buildAbsoluteUrl, buildLocalePath, buildPublicMetadata } from "@/lib/seo";
import { getResolvedSystemSettings } from "@/lib/system-settings";
import { getLocale as getLocaleServer } from "next-intl/server";

const PAGE_SIZE = 50;
const PAGE_PATH = "/rankings";

export async function generateMetadata(): Promise<Metadata> {
  const [tCommon, t, locale] = await Promise.all([
    getTranslations("common"),
    getTranslations("rankings"),
    getLocaleServer(),
  ]);
  const settings = await getResolvedSystemSettings({
    siteTitle: tCommon("appName"),
    siteDescription: tCommon("appDescription"),
  });

  return buildPublicMetadata({
    title: t("title"),
    description: t("description"),
    path: PAGE_PATH,
    siteTitle: settings.siteTitle,
    locale,
  });
}

export default async function RankingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const currentPage = Math.max(1, Math.floor(Number(resolvedSearchParams?.page ?? "1")) || 1);

  const t = await getTranslations("rankings");
  const locale = await getLocale();

  const countRow = await rawQueryOne<{ total: number }>(
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
    SELECT COUNT(DISTINCT fa.user_id)::int as total
    FROM first_accepts fa
    INNER JOIN users u ON u.id = fa.user_id
    WHERE u.is_active = true
    `
  );
  const totalCount = countRow?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const clampedPage = Math.min(currentPage, totalPages);
  const clampedOffset = (clampedPage - 1) * PAGE_SIZE;

  const rankingRows = await rawQueryAll<{
    userId: string;
    username: string;
    name: string;
    className: string | null;
    solvedCount: number;
    lastSolveTime: Date;
  }>(
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
      u.id as "userId",
      u.username as username,
      u.name as name,
      u.class_name as "className",
      COUNT(fa.problem_id)::int as "solvedCount",
      MAX(fa.first_accepted_at) as "lastSolveTime"
    FROM users u
    INNER JOIN first_accepts fa ON fa.user_id = u.id
    WHERE u.is_active = true
    GROUP BY u.id, u.username, u.name, u.class_name
    ORDER BY "solvedCount" DESC, "lastSolveTime" ASC
    LIMIT @limit OFFSET @offset
    `,
    { limit: PAGE_SIZE, offset: clampedOffset }
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("description")}</p>
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
                          new Date(row.lastSolveTime),
                          locale
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
        totalPages={totalPages}
        buildHref={(page) => page > 1 ? `${PAGE_PATH}?page=${page}` : PAGE_PATH}
      />
    </div>
  );
}
