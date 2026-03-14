import { getTranslations } from "next-intl/server";
import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/db";
import { enrollments, problemGroupAccess, problems, submissions, users } from "@/lib/db/schema";
import { desc, eq, and, like, or, sql, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PaginationControls } from "@/components/pagination-controls";

type ProblemProgress = "solved" | "attempted" | "untried";
type ProblemFilter = "all" | "solved" | "unsolved" | "attempted";
type VisibilityFilter = "all" | "public" | "private" | "hidden";

const FILTER_VALUES: readonly ProblemFilter[] = ["all", "solved", "unsolved", "attempted"];
const VISIBILITY_FILTER_VALUES: readonly VisibilityFilter[] = ["all", "public", "private", "hidden"];

const PAGE_SIZE = 50;
const PAGE_PATH = "/dashboard/problems";

function getProblemProgress(statuses: Array<string | null>): ProblemProgress {
  if (statuses.some((status) => status === "accepted")) {
    return "solved";
  }

  if (statuses.length > 0) {
    return "attempted";
  }

  return "untried";
}

function normalizePage(value?: string) {
  const parsed = Number(value ?? "1");
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.floor(parsed);
}

function normalizeVisibilityFilter(value?: string): VisibilityFilter {
  if (VISIBILITY_FILTER_VALUES.includes(value as VisibilityFilter)) {
    return value as VisibilityFilter;
  }
  return "all";
}

function normalizeSearch(value?: string) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 200);
}

function escapeLike(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function buildPageHref(
  page: number,
  progressFilter: ProblemFilter,
  visibilityFilter: VisibilityFilter,
  search: string
) {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (progressFilter !== "all") params.set("progress", progressFilter);
  if (visibilityFilter !== "all") params.set("visibility", visibilityFilter);
  if (search) params.set("search", search);
  const qs = params.toString();
  return qs ? `${PAGE_PATH}?${qs}` : PAGE_PATH;
}

/**
 * Build the SQL access filter for non-admin users.
 * Mirrors the pattern from the API route: public OR authored OR group-enrolled.
 */
function buildAccessFilter(userId: string) {
  return or(
    eq(problems.visibility, "public"),
    eq(problems.authorId, userId),
    sql`exists (
      select 1
      from ${problemGroupAccess}
      inner join ${enrollments}
        on ${problemGroupAccess.groupId} = ${enrollments.groupId}
      where ${problemGroupAccess.problemId} = ${problems.id}
        and ${enrollments.userId} = ${userId}
    )`
  );
}

/**
 * Combine all where-clause fragments, dropping any undefined values.
 */
function combineFilters(...filters: (ReturnType<typeof eq> | undefined)[]) {
  const defined = filters.filter(Boolean) as Exclude<(typeof filters)[number], undefined>[];
  if (defined.length === 0) return undefined;
  if (defined.length === 1) return defined[0];
  return and(...defined);
}

export default async function ProblemsPage({
  searchParams,
}: {
  searchParams?: Promise<{ progress?: string; page?: string; search?: string; visibility?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const rawFilter = resolvedSearchParams?.progress;
  const currentFilter = FILTER_VALUES.includes(rawFilter as ProblemFilter)
    ? (rawFilter as ProblemFilter)
    : "all";
  const currentPage = normalizePage(resolvedSearchParams?.page);
  const searchQuery = normalizeSearch(resolvedSearchParams?.search);
  const currentVisibility = normalizeVisibilityFilter(resolvedSearchParams?.visibility);

  const t = await getTranslations("problems");
  const tCommon = await getTranslations("common");
  const visibilityLabels = {
    public: t("visibilityOptions.public"),
    private: t("visibilityOptions.private"),
    hidden: t("visibilityOptions.hidden"),
  };
  const canManageProblems =
    session.user.role === "admin" ||
    session.user.role === "super_admin" ||
    session.user.role === "instructor";

  // Build title search filter
  const searchFilter =
    searchQuery
      ? like(problems.title, `%${escapeLike(searchQuery)}%`)
      : undefined;

  // Build visibility filter (only for managers; students always see accessible problems regardless)
  const visibilityDbFilter =
    canManageProblems && currentVisibility !== "all"
      ? eq(problems.visibility, currentVisibility)
      : undefined;

  // For non-admins, push access control to the DB using an EXISTS subquery
  const accessFilter = canManageProblems
    ? undefined
    : buildAccessFilter(session.user.id);

  const baseWhereClause = combineFilters(searchFilter, visibilityDbFilter, accessFilter);

  // ─── Two paths: DB-level pagination when no progress filter, lightweight ID
  // fetch + in-memory progress filter otherwise. ───

  let filteredProblems: Array<{
    id: string;
    title: string;
    timeLimitMs: number | null;
    memoryLimitMb: number | null;
    visibility: string | null;
    authorId: string | null;
    createdAt: Date | null;
    author: { name: string | null } | null;
    progress: ProblemProgress;
  }>;
  let totalCount: number;
  let clampedPage: number;

  if (currentFilter === "all") {
    // ── Path A: No progress filter → full DB-level pagination ──

    // Count query
    const [countRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(problems)
      .where(baseWhereClause);
    totalCount = Number(countRow?.count ?? 0);

    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    clampedPage = Math.min(currentPage, totalPages);
    const offset = (clampedPage - 1) * PAGE_SIZE;

    // Paginated problem rows
    const pageProblems = await db
      .select({
        id: problems.id,
        title: problems.title,
        timeLimitMs: problems.timeLimitMs,
        memoryLimitMb: problems.memoryLimitMb,
        visibility: problems.visibility,
        authorId: problems.authorId,
        createdAt: problems.createdAt,
        author: {
          name: users.name,
        },
      })
      .from(problems)
      .leftJoin(users, eq(problems.authorId, users.id))
      .where(baseWhereClause)
      .orderBy(desc(problems.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset);

    // Fetch submission statuses only for problems on this page
    const pageIds = pageProblems.map((p) => p.id);
    const problemStatuses = new Map<string, Array<string | null>>();
    if (pageIds.length > 0) {
      const subRows = await db
        .select({
          problemId: submissions.problemId,
          status: submissions.status,
        })
        .from(submissions)
        .where(
          and(
            eq(submissions.userId, session.user.id),
            inArray(submissions.problemId, pageIds)
          )
        );
      for (const row of subRows) {
        const arr = problemStatuses.get(row.problemId) ?? [];
        arr.push(row.status);
        problemStatuses.set(row.problemId, arr);
      }
    }

    filteredProblems = pageProblems.map((p) => ({
      ...p,
      progress: getProblemProgress(problemStatuses.get(p.id) ?? []),
    }));
  } else {
    // ── Path B: Progress filter active → fetch lightweight IDs, filter in
    // memory, then load full rows only for the current page ──

    // Step 1: Get all accessible problem IDs matching search/visibility filters
    const idRows = await db
      .select({ id: problems.id })
      .from(problems)
      .where(baseWhereClause)
      .orderBy(desc(problems.createdAt));
    const allIds = idRows.map((r) => r.id);

    // Step 2: Fetch submission statuses for these problems for the current user
    const problemStatuses = new Map<string, Array<string | null>>();
    if (allIds.length > 0) {
      const subRows = await db
        .select({
          problemId: submissions.problemId,
          status: submissions.status,
        })
        .from(submissions)
        .where(
          and(
            eq(submissions.userId, session.user.id),
            inArray(submissions.problemId, allIds)
          )
        );
      for (const row of subRows) {
        const arr = problemStatuses.get(row.problemId) ?? [];
        arr.push(row.status);
        problemStatuses.set(row.problemId, arr);
      }
    }

    // Step 3: Compute progress per problem and filter
    const matchingIds: string[] = [];
    for (const id of allIds) {
      const progress = getProblemProgress(problemStatuses.get(id) ?? []);
      if (currentFilter === "solved" && progress === "solved") matchingIds.push(id);
      else if (currentFilter === "attempted" && progress === "attempted") matchingIds.push(id);
      else if (currentFilter === "unsolved" && progress !== "solved") matchingIds.push(id);
    }

    // Step 4: Paginate the filtered IDs
    totalCount = matchingIds.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    clampedPage = Math.min(currentPage, totalPages);
    const offset = (clampedPage - 1) * PAGE_SIZE;
    const pageIds = matchingIds.slice(offset, offset + PAGE_SIZE);

    // Step 5: Fetch full problem rows only for the current page
    if (pageIds.length > 0) {
      const pageProblems = await db
        .select({
          id: problems.id,
          title: problems.title,
          timeLimitMs: problems.timeLimitMs,
          memoryLimitMb: problems.memoryLimitMb,
          visibility: problems.visibility,
          authorId: problems.authorId,
          createdAt: problems.createdAt,
          author: {
            name: users.name,
          },
        })
        .from(problems)
        .leftJoin(users, eq(problems.authorId, users.id))
        .where(inArray(problems.id, pageIds));

      // Re-order to match the original sorted order (by pageIds order)
      const rowMap = new Map(pageProblems.map((p) => [p.id, p]));
      filteredProblems = pageIds
        .map((id) => {
          const p = rowMap.get(id);
          if (!p) return null;
          return {
            ...p,
            progress: getProblemProgress(problemStatuses.get(id) ?? []),
          };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);
    } else {
      filteredProblems = [];
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const offset = (clampedPage - 1) * PAGE_SIZE;
  const rangeStart = totalCount === 0 ? 0 : offset + 1;
  const rangeEnd = offset + filteredProblems.length;
  const hasNextPage = clampedPage < totalPages;

  const progressLabels = {
    solved: t("progress.solved"),
    attempted: t("progress.attempted"),
    untried: t("progress.untried"),
  };
  const filterLabels = {
    all: t("filters.all"),
    solved: t("filters.solved"),
    unsolved: t("filters.unsolved"),
    attempted: t("filters.attempted"),
  };
  const visibilityFilterLabels: Record<VisibilityFilter, string> = {
    all: t("visibilityFilter.all"),
    public: t("visibilityOptions.public"),
    private: t("visibilityOptions.private"),
    hidden: t("visibilityOptions.hidden"),
  };

  function renderProgress(problemProgress: ProblemProgress) {
    if (problemProgress === "solved") {
      return (
        <span className="inline-flex items-center gap-2 text-emerald-600">
          <CheckCircle2 className="size-4" />
          {progressLabels.solved}
        </span>
      );
    }

    if (problemProgress === "attempted") {
      return (
        <span className="inline-flex items-center gap-2 text-amber-600">
          <XCircle className="size-4" />
          {progressLabels.attempted}
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-2 text-muted-foreground">
        <CircleDashed className="size-4" />
        {progressLabels.untried}
      </span>
    );
  }

  function getFilterHref(filter: ProblemFilter) {
    return buildPageHref(1, filter, currentVisibility, searchQuery);
  }

  return (
    <div className="space-y-4">
      <div className="mb-4 flex justify-between items-center">
        <h2 className="text-2xl font-bold">{t("title")}</h2>
        {canManageProblems && (
          <Link href="/dashboard/problems/create">
            <Button>{t("create")}</Button>
          </Link>
        )}
      </div>

      {/* Search & Filter card */}
      <Card>
        <CardHeader>
          <CardTitle>{t("filtersTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3 md:flex-row md:items-end" method="get">
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium" htmlFor="problem-search">
                {t("searchLabel")}
              </label>
              <Input
                id="problem-search"
                name="search"
                type="search"
                defaultValue={searchQuery}
                placeholder={t("searchPlaceholder")}
              />
            </div>

            {canManageProblems && (
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="problem-visibility">
                  {t("filterByVisibility")}
                </label>
                <select
                  id="problem-visibility"
                  name="visibility"
                  defaultValue={currentVisibility}
                  className="flex h-8 min-w-40 rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {VISIBILITY_FILTER_VALUES.map((v) => (
                    <option key={v} value={v}>
                      {visibilityFilterLabels[v]}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Preserve progress filter when submitting the form */}
            {currentFilter !== "all" && (
              <input type="hidden" name="progress" value={currentFilter} />
            )}

            <div className="flex gap-2">
              <Button type="submit">{t("applyFilters")}</Button>
              <Link href={PAGE_PATH}>
                <Button type="button" variant="outline">{t("resetFilters")}</Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("available")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap gap-2">
            {FILTER_VALUES.map((filter) => (
              <Link key={filter} href={getFilterHref(filter)}>
                <Button variant={currentFilter === filter ? "default" : "outline"} size="sm">
                  {filterLabels[filter]}
                </Button>
              </Link>
            ))}
          </div>

          {totalCount > 0 && (
            <p className="mb-4 text-sm text-muted-foreground">
              {t("pagination.showingRange", { start: rangeStart, end: rangeEnd, total: totalCount })}
            </p>
          )}

          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">{t("table.number")}</TableHead>
                <TableHead>{t("table.title")}</TableHead>
                <TableHead>{t("table.progress")}</TableHead>
                <TableHead>{t("table.author")}</TableHead>
                <TableHead>{t("table.timeLimit")}</TableHead>
                <TableHead>{t("table.memoryLimit")}</TableHead>
                <TableHead>{t("table.visibility")}</TableHead>
                <TableHead>{t("table.action")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProblems.map((problem, index) => (
                <TableRow key={problem.id}>
                  <TableCell className="text-muted-foreground">{offset + index + 1}</TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/dashboard/problems/${problem.id}`} className="text-primary hover:underline">
                      {problem.title}
                    </Link>
                  </TableCell>
                  <TableCell>{renderProgress(problem.progress)}</TableCell>
                  <TableCell>{problem.author?.name || tCommon("system")}</TableCell>
                  <TableCell>{t("timeLimitValue", { value: problem.timeLimitMs ?? 2000 })}</TableCell>
                  <TableCell>{t("memoryLimitValue", { value: problem.memoryLimitMb ?? 256 })}</TableCell>
                  <TableCell>
                    <Badge variant={problem.visibility === "public" ? "default" : "secondary"}>
                      {visibilityLabels[problem.visibility as keyof typeof visibilityLabels] ?? problem.visibility}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/dashboard/problems/${problem.id}`}>
                        <Button variant="outline" size="sm">{t("solve")}</Button>
                      </Link>
                      {(problem.authorId === session.user.id ||
                        session.user.role === "admin" ||
                        session.user.role === "super_admin") && (
                        <Link href={`/dashboard/problems/${problem.id}/edit`}>
                          <Button size="sm">{tCommon("edit")}</Button>
                        </Link>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredProblems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    {t("noProblems")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination controls */}
      <PaginationControls
        currentPage={clampedPage}
        hasNextPage={hasNextPage}
        prevHref={clampedPage > 1 ? buildPageHref(clampedPage - 1, currentFilter, currentVisibility, searchQuery) : undefined}
        nextHref={hasNextPage ? buildPageHref(clampedPage + 1, currentFilter, currentVisibility, searchQuery) : undefined}
        rangeText={
          totalCount > 0
            ? t("pagination.page", { current: clampedPage, total: totalPages })
            : undefined
        }
      />
    </div>
  );
}
