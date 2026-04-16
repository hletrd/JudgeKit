import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SubmissionStatusBadge } from "@/components/submission-status-badge";
import { db } from "@/lib/db";
import { problems, submissions, users } from "@/lib/db/schema";
import { and, count, desc, eq, gte, like, or } from "drizzle-orm";
import { auth } from "@/lib/auth";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/pagination-controls";
import { formatDateTimeInTimeZone } from "@/lib/datetime";
import { getResolvedSystemTimeZone } from "@/lib/system-settings";
import { formatSubmissionIdPrefix } from "@/lib/submissions/format";
import { buildStatusLabels } from "@/lib/judge/status-labels";
import { SubmissionListAutoRefresh } from "@/components/submission-list-auto-refresh";
import { getLanguageDisplayLabel } from "@/lib/judge/languages";
import { buildLocalePath, NO_INDEX_METADATA } from "@/lib/seo";
import { getResolvedSystemSettings } from "@/lib/system-settings";
import { LogInIcon } from "lucide-react";
import { normalizePage, normalizePageSize, setPaginationParams } from "@/lib/pagination";

const PAGE_PATH = "/submissions";

type StatusFilter = "all" | "accepted" | "wrong_answer" | "time_limit" | "memory_limit" | "runtime_error" | "compile_error";
type PeriodFilter = "all" | "today" | "week" | "month";

const STATUS_FILTER_VALUES: readonly StatusFilter[] = ["all", "accepted", "wrong_answer", "time_limit", "memory_limit", "runtime_error", "compile_error"];
const PERIOD_FILTER_VALUES: readonly PeriodFilter[] = ["all", "today", "week", "month"];

type SubmissionRow = {
  id: string;
  language: string;
  status: string | null;
  submittedAt: Date | null;
  score: number | null;
  compileOutput: string | null;
  executionTimeMs: number | null;
  memoryUsedKb: number | null;
  problem: {
    id: string | null;
    title: string | null;
  } | null;
  user: {
    id: string | null;
    name: string | null;
  } | null;
};

function escapeLike(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function getPeriodStart(period: PeriodFilter): Date | null {
  if (period === "all") return null;
  const now = new Date();
  switch (period) {
    case "today": {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return start;
    }
    case "week": {
      const start = new Date(now);
      start.setDate(start.getDate() - start.getDay());
      start.setHours(0, 0, 0, 0);
      return start;
    }
    case "month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return start;
    }
    default:
      return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const [tCommon, t] = await Promise.all([
    getTranslations("common"),
    getTranslations("submissions"),
  ]);
  const settings = await getResolvedSystemSettings({
    siteTitle: tCommon("appName"),
    siteDescription: tCommon("appDescription"),
  });

  return {
    title: t("title"),
    description: t("mySubmissions"),
    applicationName: settings.siteTitle,
    ...NO_INDEX_METADATA,
  };
}

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string; search?: string; status?: string; period?: string; pageSize?: string }>;
}) {
  const session = await auth();
  const t = await getTranslations("submissions");
  const tCommon = await getTranslations("common");
  const tAuth = await getTranslations("auth");
  const locale = await getLocale();
  const timeZone = await getResolvedSystemTimeZone();

  if (!session?.user) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("mySubmissions")}</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <LogInIcon className="size-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{tAuth("signInRequired")}</p>
            <Link href={buildLocalePath("/login", locale)}>
              <Button>{tAuth("signIn")}</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const pageSize = normalizePageSize(resolvedSearchParams?.pageSize);
  const currentPage = normalizePage(resolvedSearchParams?.page);
  const searchQuery = (resolvedSearchParams?.search ?? "").trim().slice(0, 200);
  const rawStatus = resolvedSearchParams?.status ?? "all";
  const currentStatus: StatusFilter = STATUS_FILTER_VALUES.includes(rawStatus as StatusFilter)
    ? (rawStatus as StatusFilter)
    : "all";
  const rawPeriod = resolvedSearchParams?.period ?? "all";
  const currentPeriod: PeriodFilter = PERIOD_FILTER_VALUES.includes(rawPeriod as PeriodFilter)
    ? (rawPeriod as PeriodFilter)
    : "all";

  const statusLabels = buildStatusLabels(t);

  const searchFilter = searchQuery
    ? or(
        like(problems.title, `%${escapeLike(searchQuery)}%`),
        like(users.name, `%${escapeLike(searchQuery)}%`)
      )
    : undefined;

  const statusDbFilter = currentStatus !== "all"
    ? eq(submissions.status, currentStatus)
    : undefined;

  const periodStart = getPeriodStart(currentPeriod);
  const periodFilter = periodStart
    ? gte(submissions.submittedAt, periodStart)
    : undefined;

  const userFilter = eq(submissions.userId, session.user.id);
  const filters = [userFilter, searchFilter, statusDbFilter, periodFilter].filter(Boolean);
  const whereClause = filters.length > 0 ? and(...filters) : undefined;

  const [countRow] = await db
    .select({ count: count() })
    .from(submissions)
    .leftJoin(problems, eq(submissions.problemId, problems.id))
    .leftJoin(users, eq(submissions.userId, users.id))
    .where(whereClause);
  const totalCount = Number(countRow?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const clampedPage = Math.min(currentPage, totalPages);
  const clampedOffset = (clampedPage - 1) * pageSize;

  const visibleSubmissions: SubmissionRow[] = await db
    .select({
      id: submissions.id,
      language: submissions.language,
      status: submissions.status,
      submittedAt: submissions.submittedAt,
      score: submissions.score,
      compileOutput: submissions.compileOutput,
      executionTimeMs: submissions.executionTimeMs,
      memoryUsedKb: submissions.memoryUsedKb,
      problem: {
        id: problems.id,
        title: problems.title,
      },
      user: {
        id: users.id,
        name: users.name,
      },
    })
    .from(submissions)
    .leftJoin(problems, eq(submissions.problemId, problems.id))
    .leftJoin(users, eq(submissions.userId, users.id))
    .where(whereClause)
    .orderBy(desc(submissions.submittedAt))
    .limit(pageSize)
    .offset(clampedOffset);
  const rangeStart = visibleSubmissions.length === 0 ? 0 : clampedOffset + 1;
  const rangeEnd = clampedOffset + visibleSubmissions.length;
  const hasActiveSubmissions = visibleSubmissions.some(
    (sub) => sub.status === "pending" || sub.status === "queued" || sub.status === "judging"
  );

  function buildPageHref(page: number, overridePageSize = pageSize) {
    const params = new URLSearchParams();
    if (searchQuery) params.set("search", searchQuery);
    if (currentStatus !== "all") params.set("status", currentStatus);
    if (currentPeriod !== "all") params.set("period", currentPeriod);
    setPaginationParams(params, page, overridePageSize);
    const qs = params.toString();
    return qs ? `${PAGE_PATH}?${qs}` : PAGE_PATH;
  }

  const statusFilterLabels: Record<StatusFilter, string> = {
    all: t("statusFilter.all"),
    accepted: t("statusFilter.accepted"),
    wrong_answer: t("statusFilter.wrong_answer"),
    time_limit: t("statusFilter.time_limit"),
    memory_limit: t("statusFilter.memory_limit"),
    runtime_error: t("statusFilter.runtime_error"),
    compile_error: t("statusFilter.compile_error"),
  };

  const periodFilterLabels: Record<PeriodFilter, string> = {
    all: t("periodFilter.all"),
    today: t("periodFilter.today"),
    week: t("periodFilter.week"),
    month: t("periodFilter.month"),
  };

  return (
    <div className="space-y-4">
      <SubmissionListAutoRefresh hasActiveSubmissions={hasActiveSubmissions} />
      <h1 className="text-3xl font-semibold tracking-tight">
        {t("title")}
      </h1>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTER_VALUES.map((filter) => {
          const params = new URLSearchParams();
          if (searchQuery) params.set("search", searchQuery);
          if (filter !== "all") params.set("status", filter);
          if (currentPeriod !== "all") params.set("period", currentPeriod);
          setPaginationParams(params, 1, pageSize);
          const qs = params.toString();
          return (
            <Link key={filter} href={qs ? `${PAGE_PATH}?${qs}` : PAGE_PATH}>
              <Button variant={currentStatus === filter ? "default" : "outline"} size="sm">
                {statusFilterLabels[filter]}
              </Button>
            </Link>
          );
        })}
      </div>

      {/* Period filter tabs */}
      <div className="flex flex-wrap gap-2">
        {PERIOD_FILTER_VALUES.map((filter) => {
          const params = new URLSearchParams();
          if (searchQuery) params.set("search", searchQuery);
          if (currentStatus !== "all") params.set("status", currentStatus);
          if (filter !== "all") params.set("period", filter);
          setPaginationParams(params, 1, pageSize);
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
        <CardContent>
          <form className="flex flex-col gap-4 md:flex-row md:items-end" method="get">
            <div className="flex-1 space-y-1.5">
              <label className="block text-sm font-medium" htmlFor="submissions-search">
                {t("searchLabel")}
              </label>
              <Input
                id="submissions-search"
                name="search"
                type="search"
                defaultValue={searchQuery}
                placeholder={t("searchPlaceholder")}
              />
            </div>
            {/* Preserve status and period filters */}
            {currentStatus !== "all" && (
              <input type="hidden" name="status" value={currentStatus} />
            )}
            {currentPeriod !== "all" && (
              <input type="hidden" name="period" value={currentPeriod} />
            )}
            <input type="hidden" name="pageSize" value={String(pageSize)} />
            <div className="flex gap-2 items-end">
              <Button type="submit">{tCommon("search")}</Button>
              <Link href={buildLocalePath(PAGE_PATH, locale)}>
                <Button type="button" variant="outline">{t("resetSearch")}</Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("mySubmissions")}</CardTitle>
        </CardHeader>
        <CardContent>
          {visibleSubmissions.length > 0 && (
            <p className="mb-4 text-sm text-muted-foreground">
              {t("pagination.showingRange", { start: rangeStart, end: rangeEnd })}
            </p>
          )}

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.id")}</TableHead>
                <TableHead>{t("table.problem")}</TableHead>
                <TableHead>{t("table.language")}</TableHead>
                <TableHead>{t("table.status")}</TableHead>
                <TableHead>{t("table.score")}</TableHead>
                <TableHead>{t("table.submittedAt")}</TableHead>
                <TableHead>{t("table.action")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleSubmissions.map((sub) => (
                <TableRow key={sub.id}>
                  <TableCell className="font-mono text-xs">
                    <Link href={buildLocalePath(`/submissions/${sub.id}`, locale)} className="text-primary hover:underline">
                      {formatSubmissionIdPrefix(sub.id)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {sub.problem ? (
                      <Link href={buildLocalePath(`/practice/problems/${sub.problem.id}`, locale)} className="text-primary hover:underline">
                        {sub.problem.title}
                      </Link>
                    ) : (
                      tCommon("unknown")
                    )}
                  </TableCell>
                  <TableCell>{getLanguageDisplayLabel(sub.language)}</TableCell>
                  <TableCell>
                    <SubmissionStatusBadge
                      label={statusLabels[sub.status as keyof typeof statusLabels] ?? sub.status}
                      status={sub.status}
                      compileOutput={sub.compileOutput}
                      executionTimeMs={sub.executionTimeMs}
                      memoryUsedKb={sub.memoryUsedKb}
                      score={sub.score}
                    />
                  </TableCell>
                  <TableCell>{sub.score !== null ? Math.round(sub.score * 100) / 100 : "-"}</TableCell>
                  <TableCell>
                    {sub.submittedAt
                      ? formatDateTimeInTimeZone(sub.submittedAt, locale, timeZone)
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <Link href={buildLocalePath(`/submissions/${sub.id}`, locale)}>
                      <Button variant="outline" size="sm">{tCommon("view")}</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {visibleSubmissions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    {t("noSubmissions")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
          {/* Mobile cards */}
          <ul className="md:hidden divide-y" role="list">
            {visibleSubmissions.map((sub) => (
              <li key={sub.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link href={buildLocalePath(`/submissions/${sub.id}`, locale)} className="font-mono text-xs text-primary hover:underline">
                      {formatSubmissionIdPrefix(sub.id)}
                    </Link>
                    <SubmissionStatusBadge
                      label={statusLabels[sub.status as keyof typeof statusLabels] ?? sub.status}
                      status={sub.status}
                      compileOutput={sub.compileOutput}
                      executionTimeMs={sub.executionTimeMs}
                      memoryUsedKb={sub.memoryUsedKb}
                      score={sub.score}
                    />
                  </div>
                  <div className="mt-1 text-sm">
                    {sub.problem ? (
                      <Link href={buildLocalePath(`/practice/problems/${sub.problem.id}`, locale)} className="font-medium hover:underline">
                        {sub.problem.title}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">{tCommon("unknown")}</span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{getLanguageDisplayLabel(sub.language)}</span>
                    {sub.score !== null && <span>{Math.round(sub.score * 100) / 100}pt</span>}
                    {sub.submittedAt && <span>{formatDateTimeInTimeZone(sub.submittedAt, locale, timeZone)}</span>}
                  </div>
                </div>
                <Link href={buildLocalePath(`/submissions/${sub.id}`, locale)} className="shrink-0">
                  <Button variant="outline" size="sm">{tCommon("view")}</Button>
                </Link>
              </li>
            ))}
            {visibleSubmissions.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">{t("noSubmissions")}</li>
            )}
          </ul>
        </CardContent>
      </Card>

      <PaginationControls
        currentPage={clampedPage}
        totalPages={totalPages}
        pageSize={pageSize}
        buildHref={(page, nextPageSize) => buildLocalePath(buildPageHref(page, nextPageSize), locale)}
      />
    </div>
  );
}
