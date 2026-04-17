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
import { submissions, users, problems } from "@/lib/db/schema";
import { and, asc, count, desc, eq, gte, like, lte, or } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PaginationControls } from "@/components/pagination-controls";
import { Input } from "@/components/ui/input";
import { formatDateTimeInTimeZone } from "@/lib/datetime";
import { getResolvedSystemTimeZone } from "@/lib/system-settings";
import { formatSubmissionIdPrefix } from "@/lib/submissions/format";
import { buildStatusLabels } from "@/lib/judge/status-labels";
import { SubmissionListAutoRefresh } from "@/components/submission-list-auto-refresh";
import { getLanguageDisplayLabel } from "@/lib/judge/languages";
import { EmptyState } from "@/components/empty-state";
import { formatScore } from "@/lib/formatting";
import { InboxIcon } from "lucide-react";
import { FilterSelect } from "@/components/filter-select";
import { AdminSubmissionsBulkRejudge } from "./admin-submissions-bulk-rejudge";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.submissions");
  return { title: t("title") };
}

const PAGE_SIZE = 50;
const STATUS_FILTER_VALUES = [
  "all",
  "pending",
  "queued",
  "judging",
  "accepted",
  "wrong_answer",
  "time_limit",
  "memory_limit",
  "runtime_error",
  "compile_error",
] as const;

type StatusFilter = (typeof STATUS_FILTER_VALUES)[number];

function normalizeLanguageFilter(value?: string) {
  return typeof value === "string" ? value.trim().slice(0, 50) : "";
}

function normalizeDateFilter(value?: string) {
  if (typeof value !== "string" || !value) return "";
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? "" : value;
}

export default async function AdminSubmissionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string; search?: string; sort?: string; dir?: string; status?: string; language?: string; dateFrom?: string; dateTo?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const caps = await resolveCapabilities(session.user.role);
  if (!caps.has("submissions.view_all")) redirect("/dashboard");
  const canBulkRejudge = caps.has("submissions.rejudge");

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const currentPage = Math.max(1, Number(resolvedSearchParams?.page ?? "1") || 1);
  const searchQuery = (resolvedSearchParams?.search ?? "").trim().slice(0, 200);
  const statusFilter = STATUS_FILTER_VALUES.includes((resolvedSearchParams?.status ?? "all") as StatusFilter)
    ? ((resolvedSearchParams?.status ?? "all") as StatusFilter)
    : "all";
  const languageFilter = normalizeLanguageFilter(resolvedSearchParams?.language);
  const dateFrom = normalizeDateFilter(resolvedSearchParams?.dateFrom);
  const dateTo = normalizeDateFilter(resolvedSearchParams?.dateTo);
  const sortColumn = resolvedSearchParams?.sort ?? "submittedAt";
  const sortDir = resolvedSearchParams?.dir === "asc" ? "asc" : "desc";
  const validSortColumns = new Set(["submittedAt", "score", "status", "language"]);
  const effectiveSort = validSortColumns.has(sortColumn) ? sortColumn : "submittedAt";
  const t = await getTranslations("admin.submissions");
  const tCommon = await getTranslations("common");
  const tSubmissions = await getTranslations("submissions");
  const locale = await getLocale();
  const timeZone = await getResolvedSystemTimeZone();
  const statusLabels = buildStatusLabels(tSubmissions);

  function escapeLike(value: string) {
    return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
  }

  const searchWhereClause = searchQuery
    ? or(
        like(users.name, `%${escapeLike(searchQuery)}%`),
        like(problems.title, `%${escapeLike(searchQuery)}%`)
      )
    : undefined;
  const whereClause = and(
    statusFilter !== "all" ? eq(submissions.status, statusFilter) : undefined,
    languageFilter ? eq(submissions.language, languageFilter) : undefined,
    dateFrom ? gte(submissions.submittedAt, new Date(dateFrom)) : undefined,
    dateTo
      ? (() => {
          const endOfDay = new Date(dateTo);
          endOfDay.setHours(23, 59, 59, 999);
          return lte(submissions.submittedAt, endOfDay);
        })()
      : undefined,
    searchWhereClause
  );

  const availableLanguages = await db
    .select({ language: submissions.language })
    .from(submissions)
    .groupBy(submissions.language)
    .orderBy(asc(submissions.language));

  const [countRow] = await db
    .select({ count: count() })
    .from(submissions)
    .leftJoin(users, eq(submissions.userId, users.id))
    .leftJoin(problems, eq(submissions.problemId, problems.id))
    .where(whereClause);
  const totalCount = Number(countRow?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const clampedPage = Math.min(currentPage, totalPages);
  const clampedOffset = (clampedPage - 1) * PAGE_SIZE;

  const visibleSubmissions = await db
    .select({
      id: submissions.id,
      language: submissions.language,
      status: submissions.status,
      submittedAt: submissions.submittedAt,
      score: submissions.score,
      compileOutput: submissions.compileOutput,
      executionTimeMs: submissions.executionTimeMs,
      memoryUsedKb: submissions.memoryUsedKb,
      user: {
        id: users.id,
        name: users.name,
      },
      problem: {
        id: problems.id,
        title: problems.title,
      },
    })
    .from(submissions)
    .leftJoin(users, eq(submissions.userId, users.id))
    .leftJoin(problems, eq(submissions.problemId, problems.id))
    .where(whereClause)
    .orderBy(
      ...(effectiveSort === "score"
        ? [sortDir === "asc" ? asc(submissions.score) : desc(submissions.score)]
        : effectiveSort === "status"
          ? [sortDir === "asc" ? asc(submissions.status) : desc(submissions.status)]
          : effectiveSort === "language"
            ? [sortDir === "asc" ? asc(submissions.language) : desc(submissions.language)]
            : [sortDir === "asc" ? asc(submissions.submittedAt) : desc(submissions.submittedAt)]
      )
    )
    .limit(PAGE_SIZE)
    .offset(clampedOffset);

  const rangeStart = visibleSubmissions.length === 0 ? 0 : clampedOffset + 1;
  const rangeEnd = clampedOffset + visibleSubmissions.length;
  const hasActiveSubmissions = visibleSubmissions.some(
    (sub) => sub.status === "pending" || sub.status === "queued" || sub.status === "judging"
  );

  const buildPageHref = (page: number) => {
    const params = new URLSearchParams();
    if (page > 1) params.set("page", String(page));
    if (searchQuery) params.set("search", searchQuery);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (languageFilter) params.set("language", languageFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (effectiveSort !== "submittedAt") params.set("sort", effectiveSort);
    if (sortDir === "asc") params.set("dir", "asc");
    const qs = params.toString();
    return qs ? `/dashboard/admin/submissions?${qs}` : "/dashboard/admin/submissions";
  };

  const buildExportHref = () => {
    const params = new URLSearchParams();
    if (searchQuery) params.set("search", searchQuery);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (languageFilter) params.set("language", languageFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    const qs = params.toString();
    return qs ? `/api/v1/admin/submissions/export?${qs}` : "/api/v1/admin/submissions/export";
  };

  function getSortHref(column: string) {
    const params = new URLSearchParams();
    if (searchQuery) params.set("search", searchQuery);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (languageFilter) params.set("language", languageFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (column === effectiveSort) {
      params.set("dir", sortDir === "desc" ? "asc" : "desc");
    } else {
      params.set("sort", column);
      params.set("dir", "desc");
    }
    const qs = params.toString();
    return qs ? `/dashboard/admin/submissions?${qs}` : "/dashboard/admin/submissions";
  }

  function renderSortableHeader(column: string, label: string) {
    const isActive = column === effectiveSort;
    return (
      <TableHead>
        <Link href={getSortHref(column)} className="inline-flex items-center gap-1 hover:text-foreground">
          {label}
          {isActive && (
            <span className="text-xs">{sortDir === "asc" ? "↑" : "↓"}</span>
          )}
        </Link>
      </TableHead>
    );
  }

  return (
    <div className="space-y-4">
      <SubmissionListAutoRefresh hasActiveSubmissions={hasActiveSubmissions} />
      <h2 className="text-2xl font-bold mb-4">{t("title")}</h2>
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
              <label className="block text-sm font-medium" htmlFor="submissions-status">
                {tSubmissions("statusLabel")}
              </label>
              <FilterSelect
                name="status"
                defaultValue={statusFilter}
                placeholder={tSubmissions("statusFilter.all")}
                options={STATUS_FILTER_VALUES.map((value) => ({
                  value,
                  label:
                    value === "all"
                      ? tSubmissions("statusFilter.all")
                      : statusLabels[value as keyof typeof statusLabels] ?? value,
                }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium" htmlFor="submissions-language">
                {tSubmissions("languageFilterLabel")}
              </label>
              <FilterSelect
                name="language"
                defaultValue={languageFilter || "all"}
                placeholder={tSubmissions("allLanguages")}
                options={[
                  { value: "all", label: tSubmissions("allLanguages") },
                  ...availableLanguages
                    .map((entry) => entry.language)
                    .filter((language): language is string => Boolean(language))
                    .map((language) => ({
                      value: language,
                      label: getLanguageDisplayLabel(language),
                    })),
                ]}
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium" htmlFor="submissions-date-from">
                {t("dateFromLabel")}
              </label>
              <Input
                id="submissions-date-from"
                name="dateFrom"
                type="date"
                defaultValue={dateFrom}
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium" htmlFor="submissions-date-to">
                {t("dateToLabel")}
              </label>
              <Input
                id="submissions-date-to"
                name="dateTo"
                type="date"
                defaultValue={dateTo}
              />
            </div>
            <div className="flex gap-2 items-end">
              <Button type="submit">{tCommon("search")}</Button>
              <Link href="/dashboard/admin/submissions">
                <Button type="button" variant="outline">{t("resetSearch")}</Button>
              </Link>
              <Link href={buildExportHref()} prefetch={false}>
                <Button type="button" variant="outline">{t("exportCsv")}</Button>
              </Link>
              {canBulkRejudge ? (
                <AdminSubmissionsBulkRejudge submissionIds={visibleSubmissions.map((submission) => submission.id)} />
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("recent")}</CardTitle>
        </CardHeader>
        <CardContent>
          {visibleSubmissions.length > 0 && (
            <p className="mb-4 text-sm text-muted-foreground">
              {tSubmissions("pagination.showingRange", { start: rangeStart, end: rangeEnd })}
            </p>
          )}

          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.id")}</TableHead>
                <TableHead>{t("table.user")}</TableHead>
                <TableHead>{t("table.problem")}</TableHead>
                {renderSortableHeader("language", t("table.language"))}
                {renderSortableHeader("status", t("table.status"))}
                {renderSortableHeader("score", t("table.score"))}
                {renderSortableHeader("submittedAt", t("table.submittedAt"))}
                <TableHead>{tCommon("action")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleSubmissions.map((sub) => (
                <TableRow key={sub.id}>
                  <TableCell className="font-mono text-xs">
                    <Link href={`/dashboard/submissions/${sub.id}?from=admin`} className="text-primary hover:underline">
                      {formatSubmissionIdPrefix(sub.id)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {sub.user ? (
                      <Link href={`/dashboard/admin/users/${sub.user.id}`} className="text-primary hover:underline">
                        {sub.user.name}
                      </Link>
                    ) : (
                      tCommon("unknown")
                    )}
                  </TableCell>
                  <TableCell>
                    {sub.problem ? (
                      <Link href={`/dashboard/problems/${sub.problem.id}`} className="text-primary hover:underline">
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
                  <TableCell>{formatScore(sub.score)}</TableCell>
                  <TableCell>
                    {sub.submittedAt
                      ? formatDateTimeInTimeZone(sub.submittedAt, locale, timeZone)
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <Link href={`/dashboard/submissions/${sub.id}?from=admin`}>
                      <Button variant="outline" size="sm">{tCommon("view")}</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {visibleSubmissions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8}>
                    <EmptyState icon={InboxIcon} title={t("noSubmissions")} />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      <PaginationControls
        currentPage={clampedPage}
        totalPages={totalPages}
        buildHref={buildPageHref}
      />
    </div>
  );
}
