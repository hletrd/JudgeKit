import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { getDbNow } from "@/lib/db-time";
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
import { escapeLikePattern } from "@/lib/db/like";
import { problems, submissions, users } from "@/lib/db/schema";
import { and, asc, count, desc, eq, gte, or, sql } from "drizzle-orm";
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
import { formatScore } from "@/lib/formatting";
import { buildLocalePath, NO_INDEX_METADATA } from "@/lib/seo";
import { getResolvedSystemSettings } from "@/lib/system-settings";
import { normalizePage, normalizePageSize, setPaginationParams } from "@/lib/pagination";
import { FilterSelect } from "@/components/filter-select";

const PAGE_PATH = "/submissions";

type StatusFilter = "all" | "accepted" | "wrong_answer" | "time_limit" | "memory_limit" | "runtime_error" | "compile_error";
type PeriodFilter = "all" | "today" | "week" | "month";
type ScopeFilter = "all" | "mine";

const STATUS_FILTER_VALUES: readonly StatusFilter[] = ["all", "accepted", "wrong_answer", "time_limit", "memory_limit", "runtime_error", "compile_error"];
const PERIOD_FILTER_VALUES: readonly PeriodFilter[] = ["all", "today", "week", "month"];
const SCOPE_FILTER_VALUES: readonly ScopeFilter[] = ["all", "mine"];

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


function getPeriodStart(period: PeriodFilter, now: Date): Date | null {
  if (period === "all") return null;
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
  searchParams?: Promise<{ page?: string; search?: string; status?: string; period?: string; pageSize?: string; scope?: string; language?: string }>;
}) {
  const session = await auth();
  const t = await getTranslations("submissions");
  const tCommon = await getTranslations("common");
  const locale = await getLocale();
  const timeZone = await getResolvedSystemTimeZone();

  // Guests see the public submission feed (verdicts only, restricted to
  // submissions whose problem is `visibility = 'public'`). The list view
  // never renders source code; the per-id detail page is its own gate.
  const isGuest = !session?.user;

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
  const rawScope = resolvedSearchParams?.scope ?? "all";
  const currentScope: ScopeFilter = SCOPE_FILTER_VALUES.includes(rawScope as ScopeFilter)
    ? (rawScope as ScopeFilter)
    : "all";
  const rawLanguage = (resolvedSearchParams?.language ?? "").trim();

  const availableLanguageRows = await db
    .selectDistinct({ language: submissions.language })
    .from(submissions)
    .orderBy(asc(submissions.language));
  const availableLanguages = availableLanguageRows
    .map((row) => row.language)
    .filter((language): language is string => Boolean(language));
  const currentLanguage = rawLanguage && availableLanguages.includes(rawLanguage) ? rawLanguage : "all";

  const statusLabels = buildStatusLabels(t);

  const searchFilter = searchQuery
    ? or(
        sql`${problems.title} LIKE ${`%${escapeLikePattern(searchQuery)}%`} ESCAPE '\\'`,
        sql`${users.name} LIKE ${`%${escapeLikePattern(searchQuery)}%`} ESCAPE '\\'`
      )
    : undefined;

  const statusDbFilter = currentStatus !== "all"
    ? eq(submissions.status, currentStatus)
    : undefined;

  const periodStart = getPeriodStart(currentPeriod, await getDbNow());
  const periodFilter = periodStart
    ? gte(submissions.submittedAt, periodStart)
    : undefined;

  // Scope=mine requires a logged-in user. For guests we force scope=all so
  // the page renders something rather than 401-ing on a copy-pasted URL.
  const effectiveScope: ScopeFilter = isGuest ? "all" : currentScope;
  const userFilter = !isGuest && effectiveScope === "mine"
    ? eq(submissions.userId, session!.user.id)
    : undefined;
  const languageFilter = currentLanguage !== "all"
    ? eq(submissions.language, currentLanguage)
    : undefined;
  // Guests must not see submissions targeting private problems — those are
  // contest / homework / exam submissions whose visibility is not public.
  const guestVisibilityFilter = isGuest
    ? eq(problems.visibility, "public")
    : undefined;
  const filters = [userFilter, searchFilter, statusDbFilter, periodFilter, languageFilter, guestVisibilityFilter].filter(Boolean);
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
    if (currentScope !== "all") params.set("scope", currentScope);
    if (currentLanguage !== "all") params.set("language", currentLanguage);
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

  const scopeFilterLabels: Record<ScopeFilter, string> = {
    all: t("scopeFilter.all"),
    mine: t("scopeFilter.mine"),
  };

  const listCardTitle = currentScope === "mine" ? t("mySubmissions") : t("allSubmissions");
  const emptyListMessage = currentScope === "mine" ? t("noSubmissions") : t("noSubmissionsAll");

  return (
    <div className="space-y-4">
      <SubmissionListAutoRefresh hasActiveSubmissions={hasActiveSubmissions} />
      <h1 className={`text-3xl font-semibold${locale !== "ko" ? " tracking-tight" : ""}`}>
        {tCommon("submissions")}
      </h1>

      {/* Scope filter tabs */}
      <div className="flex flex-wrap gap-2">
        {SCOPE_FILTER_VALUES.map((filter) => {
          const params = new URLSearchParams();
          if (searchQuery) params.set("search", searchQuery);
          if (currentStatus !== "all") params.set("status", currentStatus);
          if (currentPeriod !== "all") params.set("period", currentPeriod);
          if (currentLanguage !== "all") params.set("language", currentLanguage);
          if (filter !== "all") params.set("scope", filter);
          setPaginationParams(params, 1, pageSize);
          const qs = params.toString();
          return (
            <Link key={filter} href={qs ? `${PAGE_PATH}?${qs}` : PAGE_PATH}>
              <Button variant={currentScope === filter ? "default" : "outline"} size="sm">
                {scopeFilterLabels[filter]}
              </Button>
            </Link>
          );
        })}
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTER_VALUES.map((filter) => {
          const params = new URLSearchParams();
          if (searchQuery) params.set("search", searchQuery);
          if (filter !== "all") params.set("status", filter);
          if (currentPeriod !== "all") params.set("period", currentPeriod);
          if (currentLanguage !== "all") params.set("language", currentLanguage);
          if (currentScope !== "all") params.set("scope", currentScope);
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
          if (currentLanguage !== "all") params.set("language", currentLanguage);
          if (currentScope !== "all") params.set("scope", currentScope);
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
            <div className="space-y-1.5">
              <label className="block text-sm font-medium">
                {t("languageFilterLabel")}
              </label>
              <FilterSelect
                name="language"
                defaultValue={currentLanguage}
                placeholder={t("allLanguages")}
                options={[
                  { value: "all", label: t("allLanguages") },
                  ...availableLanguages.map((language) => ({
                    value: language,
                    label: getLanguageDisplayLabel(language),
                  })),
                ]}
              />
            </div>
            {/* Preserve status, period, and scope filters */}
            {currentStatus !== "all" && (
              <input type="hidden" name="status" value={currentStatus} />
            )}
            {currentPeriod !== "all" && (
              <input type="hidden" name="period" value={currentPeriod} />
            )}
            {currentScope !== "all" && (
              <input type="hidden" name="scope" value={currentScope} />
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
          <CardTitle>{listCardTitle}</CardTitle>
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
                <TableHead>{t("table.student")}</TableHead>
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
                  <TableCell>{sub.user?.name ?? tCommon("unknown")}</TableCell>
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
                      locale={locale}
                    />
                  </TableCell>
                  <TableCell>{formatScore(sub.score, locale)}</TableCell>
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
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    {emptyListMessage}
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
                      locale={locale}
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
                    <span>{sub.user?.name ?? tCommon("unknown")}</span>
                    <span>·</span>
                    <span>{getLanguageDisplayLabel(sub.language)}</span>
                    {sub.score !== null && <span>{formatScore(sub.score, locale)}pt</span>}
                    {sub.submittedAt && <span>{formatDateTimeInTimeZone(sub.submittedAt, locale, timeZone)}</span>}
                  </div>
                </div>
                <Link href={buildLocalePath(`/submissions/${sub.id}`, locale)} className="shrink-0">
                  <Button variant="outline" size="sm">{tCommon("view")}</Button>
                </Link>
              </li>
            ))}
            {visibleSubmissions.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">{emptyListMessage}</li>
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
