import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { rawQueryOne, rawQueryAll } from "@/lib/db/queries";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { getRecruitingAccessContext } from "@/lib/recruiting/access";
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
import { JsonLd } from "@/components/seo/json-ld";
import { buildAbsoluteUrl, buildLocalePath, buildPublicMetadata } from "@/lib/seo";
import { getResolvedSystemSettings } from "@/lib/system-settings";
import { getLocale as getLocaleServer } from "next-intl/server";
import { normalizePage, normalizePageSize, setPaginationParams } from "@/lib/pagination";
import { calculateTier } from "@/lib/ratings";
import { TierBadge } from "@/components/tier-badge";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const PAGE_PATH = "/rankings";

type PeriodFilter = "all" | "week" | "month";
const PERIOD_FILTER_VALUES: readonly PeriodFilter[] = ["all", "week", "month"];

function getPeriodClause(period: PeriodFilter): string {
  switch (period) {
    case "week":
      return "AND s.submitted_at >= NOW() - INTERVAL '7 days'";
    case "month":
      return "AND s.submitted_at >= DATE_TRUNC('month', NOW())";
    default:
      return "";
  }
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string; pageSize?: string }>;
} = {}): Promise<Metadata> {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const pageSize = normalizePageSize(resolvedSearchParams?.pageSize);
  const requestedPage = normalizePage(resolvedSearchParams?.page);

  const [tCommon, t, locale, countRow] = await Promise.all([
    getTranslations("common"),
    getTranslations("rankings"),
    getLocaleServer(),
    rawQueryOne<{ total: number }>(`
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
    `),
  ]);
  const settings = await getResolvedSystemSettings({
    siteTitle: tCommon("appName"),
    siteDescription: tCommon("appDescription"),
  });
  const totalCount = countRow?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);

  const pageLabel = currentPage > 1 ? tCommon("paginationPage", { page: currentPage }) : null;
  const title = currentPage > 1 ? `${t("title")} · ${pageLabel}` : t("title");
  const description = currentPage > 1 ? `${t("description")} ${pageLabel}.` : t("description");

  return buildPublicMetadata({
    title,
    description,
    path: (() => {
      const params = new URLSearchParams();
      setPaginationParams(params, currentPage, pageSize);
      const qs = params.toString();
      return qs ? `${PAGE_PATH}?${qs}` : PAGE_PATH;
    })(),
    siteTitle: settings.siteTitle,
    locale,
  });
}

export default async function RankingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string; pageSize?: string; period?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const pageSize = normalizePageSize(resolvedSearchParams?.pageSize);
  const currentPage = normalizePage(resolvedSearchParams?.page);
  const rawPeriod = resolvedSearchParams?.period ?? "all";
  const currentPeriod: PeriodFilter = PERIOD_FILTER_VALUES.includes(rawPeriod as PeriodFilter)
    ? (rawPeriod as PeriodFilter)
    : "all";

  const t = await getTranslations("rankings");
  const locale = await getLocale();

  // Auth-aware: in recruiting mode, redirect candidates and non-admins to dashboard
  const session = await auth();
  if (session?.user) {
    const [caps, accessContext] = await Promise.all([
      resolveCapabilities(session.user.role),
      getRecruitingAccessContext(session.user.id),
    ]);
    if (
      accessContext.effectivePlatformMode === "recruiting" &&
      (accessContext.isRecruitingCandidate || (!caps.has("system.settings") && !caps.has("submissions.view_all")))
    ) {
      redirect("/dashboard");
    }
  }

  const periodClause = getPeriodClause(currentPeriod);

  // Estimate total from an unfiltered count to clamp the page offset.
  // The actual per-period total is derived from the window function below.
  const estimatedCountRow = await rawQueryOne<{ total: number }>(`
    SELECT COUNT(*)::int as total FROM users WHERE is_active = true
  `);
  const estimatedTotal = estimatedCountRow?.total ?? 0;
  const estimatedPages = Math.max(1, Math.ceil(estimatedTotal / pageSize));
  const clampedPage = Math.min(currentPage, estimatedPages);
  const clampedOffset = (clampedPage - 1) * pageSize;

  // Single query: the first_accepts CTE is computed once, and COUNT(*) OVER()
  // provides the total row count without a separate round-trip.
  const rankingRows = await rawQueryAll<{
    userId: string;
    username: string;
    name: string;
    className: string | null;
    solvedCount: number;
    lastSolveTime: Date;
    total: number;
  }>(
    `
    WITH first_accepts AS (
      SELECT
        user_id,
        problem_id,
        MIN(submitted_at) as first_accepted_at
      FROM submissions s
      WHERE s.status = 'accepted'
      ${periodClause}
      GROUP BY user_id, problem_id
    )
    SELECT
      u.id as "userId",
      u.username as username,
      u.name as name,
      u.class_name as "className",
      COUNT(fa.problem_id)::int as "solvedCount",
      MAX(fa.first_accepted_at) as "lastSolveTime",
      COUNT(*) OVER()::int as "total"
    FROM users u
    INNER JOIN first_accepts fa ON fa.user_id = u.id
    WHERE u.is_active = true
    GROUP BY u.id, u.username, u.name, u.class_name
    ORDER BY "solvedCount" DESC, "lastSolveTime" ASC
    LIMIT @limit OFFSET @offset
    `,
    { limit: pageSize, offset: clampedOffset }
  );
  const totalCount = rankingRows.length > 0 ? rankingRows[0].total : 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const rankingsJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: t("title"),
    description: t("description"),
    url: buildAbsoluteUrl((() => {
      const params = new URLSearchParams();
      setPaginationParams(params, clampedPage, pageSize);
      const qs = params.toString();
      return buildLocalePath(qs ? `${PAGE_PATH}?${qs}` : PAGE_PATH, locale);
    })()),
    inLanguage: locale,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: rankingRows.map((row, index) => ({
        "@type": "ListItem",
        position: clampedOffset + index + 1,
        name: `${row.name} (${row.username})`,
      })),
    },
  };

  const periodFilterLabels: Record<PeriodFilter, string> = {
    all: t("periodFilter.all"),
    week: t("periodFilter.week"),
    month: t("periodFilter.month"),
  };

  return (
    <div className="space-y-6">
      <JsonLd data={rankingsJsonLd} />
      <div>
        <h1 className={`text-3xl font-semibold${locale !== "ko" ? " tracking-tight" : ""}`}>{t("title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("description")}</p>
      </div>

      {/* Period filter tabs */}
      <div className="flex flex-wrap gap-2">
        {PERIOD_FILTER_VALUES.map((filter) => {
          const params = new URLSearchParams();
          if (filter !== "all") params.set("period", filter);
          const qs = params.toString();
          return (
            <Link key={filter} href={qs ? `${PAGE_PATH}?${qs}` : PAGE_PATH}>
              <Button variant={currentPeriod === filter ? "default" : "outline"} size="sm">
                {periodFilterLabels[filter]}
              </Button>
            </Link>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-0">
          {rankingRows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              {t("noRankings")}
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
                        <div className="flex items-center gap-1.5">
                          {row.username}
                          {(() => {
                            const tier = calculateTier(row.solvedCount);
                            return tier ? <TierBadge tier={tier} label={t(`tiers.${tier}`)} /> : null;
                          })()}
                        </div>
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
            {/* Mobile cards */}
            <ul className="md:hidden divide-y" role="list">
              {rankingRows.map((row, index) => (
                <li key={row.userId} className="flex items-center gap-3 px-4 py-3">
                  <Badge variant={clampedOffset + index < 3 ? "default" : "secondary"} aria-label={`Rank ${clampedOffset + index + 1}`}>
                    {clampedOffset + index + 1}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {row.name}
                      {(() => {
                        const tier = calculateTier(row.solvedCount);
                        return tier ? <TierBadge tier={tier} label={t(`tiers.${tier}`)} /> : null;
                      })()}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      @{row.username}{row.className ? ` · ${row.className}` : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-semibold" aria-label={`${row.solvedCount} solved`}>{row.solvedCount}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatRelativeTimeFromNow(new Date(row.lastSolveTime), locale)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            </>
          )}
        </CardContent>
      </Card>
      <PaginationControls
        currentPage={clampedPage}
        totalPages={totalPages}
        pageSize={pageSize}
        buildHref={(page, nextPageSize) => {
          const params = new URLSearchParams();
          setPaginationParams(params, page, nextPageSize);
          if (currentPeriod !== "all") params.set("period", currentPeriod);
          const qs = params.toString();
          return buildLocalePath(qs ? `${PAGE_PATH}?${qs}` : PAGE_PATH, locale);
        }}
      />
    </div>
  );
}
