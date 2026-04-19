import { getTranslations } from "next-intl/server";
import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { SubmissionStatusBadge } from "@/components/submission-status-badge";
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
import { escapeLikePattern } from "@/lib/db/like";
import { enrollments, problemGroupAccess, problems, submissions, users, tags, problemTags } from "@/lib/db/schema";
import { eq, and, or, sql, inArray, asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PaginationControls } from "@/components/pagination-controls";
import { FilterSelect } from "@/components/filter-select";
import { ProblemImportButton } from "./problem-import-button";
import { getRecruitingAccessContext } from "@/lib/recruiting/access";
import { resolveCapabilities } from "@/lib/capabilities/cache";

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


function formatDifficultyValue(value: number) {
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function buildPageHref(
  page: number,
  progressFilter: ProblemFilter,
  visibilityFilter: VisibilityFilter,
  search: string,
  tagFilter: string
) {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (progressFilter !== "all") params.set("progress", progressFilter);
  if (visibilityFilter !== "all") params.set("visibility", visibilityFilter);
  if (search) params.set("search", search);
  if (tagFilter) params.set("tag", tagFilter);
  const qs = params.toString();
  return qs ? `${PAGE_PATH}?${qs}` : PAGE_PATH;
}

/**
 * Build the SQL access filter for non-admin users.
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

function combineFilters(...filters: (ReturnType<typeof eq> | undefined)[]) {
  const defined = filters.filter(Boolean) as Exclude<(typeof filters)[number], undefined>[];
  if (defined.length === 0) return undefined;
  if (defined.length === 1) return defined[0];
  return and(...defined);
}

export default async function ProblemsPage({
  searchParams,
}: {
  searchParams?: Promise<{ progress?: string; page?: string; search?: string; visibility?: string; tag?: string }>;
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
  const currentTag = resolvedSearchParams?.tag?.trim() ?? "";

  const t = await getTranslations("problems");
  const tCommon = await getTranslations("common");
  const tSubmissions = await getTranslations("submissions");
  const recruitingAccess = await getRecruitingAccessContext(session.user.id);
  const caps = await resolveCapabilities(session.user.role);
  const visibilityLabels = {
    public: t("visibilityOptions.public"),
    private: t("visibilityOptions.private"),
    hidden: t("visibilityOptions.hidden"),
  };
  const canManageProblems =
    caps.has("problems.create") ||
    caps.has("problems.edit") ||
    caps.has("problems.view_all");
  const canViewProblemVisibility = caps.has("problems.view_all");
  const canEditProblems = caps.has("problems.edit");

  // Fetch all tags for the filter dropdown
  const allTags = recruitingAccess.isRecruitingCandidate
    ? (recruitingAccess.problemIds.length > 0
        ? await db
            .selectDistinct({ id: tags.id, name: tags.name, color: tags.color })
            .from(problemTags)
            .innerJoin(tags, eq(problemTags.tagId, tags.id))
            .where(inArray(problemTags.problemId, recruitingAccess.problemIds))
            .orderBy(asc(tags.name))
        : [])
    : await db
        .select({ id: tags.id, name: tags.name, color: tags.color })
        .from(tags)
        .orderBy(asc(tags.name));

  // Build search filter (title or author name)
  const searchFilter =
    searchQuery
      ? or(
          sql`${problems.title} LIKE ${`%${escapeLikePattern(searchQuery)}%`} ESCAPE '\\'`,
          sql`${users.name} LIKE ${`%${escapeLikePattern(searchQuery)}%`} ESCAPE '\\'`
        )
      : undefined;

  // Build visibility filter
  const visibilityDbFilter =
    canViewProblemVisibility && currentVisibility !== "all"
      ? eq(problems.visibility, currentVisibility)
      : undefined;

  // Access filter for non-admins
  const accessFilter = canManageProblems
    ? undefined
    : recruitingAccess.isRecruitingCandidate
      ? (recruitingAccess.problemIds.length > 0
          ? inArray(problems.id, recruitingAccess.problemIds)
          : sql`false`)
      : buildAccessFilter(session.user.id);

  // Tag filter: restrict to problems that have this tag
  const tagFilter = currentTag
    ? sql`exists (
        select 1 from ${problemTags}
        inner join ${tags} on ${problemTags.tagId} = ${tags.id}
        where ${problemTags.problemId} = ${problems.id}
          and ${tags.name} = ${currentTag}
      )`
    : undefined;

  const baseWhereClause = combineFilters(searchFilter, visibilityDbFilter, accessFilter, tagFilter);

  let filteredProblems: Array<{
    id: string;
    sequenceNumber: number | null;
    title: string;
    timeLimitMs: number | null;
    memoryLimitMb: number | null;
    difficulty: number | null;
    visibility: string | null;
    authorId: string | null;
    createdAt: Date | null;
    author: { name: string | null } | null;
    progress: ProblemProgress;
    latestStatus: string | null;
    problemTags: Array<{ name: string; color: string | null }>;
  }>;
  let totalCount: number;
  let clampedPage: number;

  if (currentFilter === "all") {
    // Path A: No progress filter
    const [countRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(problems)
      .leftJoin(users, eq(problems.authorId, users.id))
      .where(baseWhereClause);
    totalCount = Number(countRow?.count ?? 0);

    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    clampedPage = Math.min(currentPage, totalPages);
    const offset = (clampedPage - 1) * PAGE_SIZE;

    const pageProblems = await db
      .select({
        id: problems.id,
        sequenceNumber: problems.sequenceNumber,
        title: problems.title,
        timeLimitMs: problems.timeLimitMs,
        memoryLimitMb: problems.memoryLimitMb,
        difficulty: problems.difficulty,
        visibility: problems.visibility,
        authorId: problems.authorId,
        createdAt: problems.createdAt,
        author: { name: users.name },
      })
      .from(problems)
      .leftJoin(users, eq(problems.authorId, users.id))
      .where(baseWhereClause)
      .orderBy(asc(problems.sequenceNumber), asc(problems.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset);

    const pageIds = pageProblems.map((p) => p.id);
    const problemStatuses = new Map<string, Array<string | null>>();
    const latestStatusMap = new Map<string, { status: string | null; submittedAt: Date | null }>();
    if (pageIds.length > 0) {
      const subRows = await db
        .select({
          problemId: submissions.problemId,
          status: submissions.status,
          submittedAt: submissions.submittedAt,
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
        const existing = latestStatusMap.get(row.problemId);
        if (!existing || (row.submittedAt && (!existing.submittedAt || row.submittedAt > existing.submittedAt))) {
          latestStatusMap.set(row.problemId, { status: row.status, submittedAt: row.submittedAt });
        }
      }
    }

    // Fetch tags for page problems
    const problemTagsMap = new Map<string, Array<{ name: string; color: string | null }>>();
    if (pageIds.length > 0) {
      const tagRows = await db
        .select({
          problemId: problemTags.problemId,
          name: tags.name,
          color: tags.color,
        })
        .from(problemTags)
        .innerJoin(tags, eq(problemTags.tagId, tags.id))
        .where(inArray(problemTags.problemId, pageIds));
      for (const row of tagRows) {
        const arr = problemTagsMap.get(row.problemId) ?? [];
        arr.push({ name: row.name, color: row.color });
        problemTagsMap.set(row.problemId, arr);
      }
    }

    filteredProblems = pageProblems.map((p) => ({
      ...p,
      progress: getProblemProgress(problemStatuses.get(p.id) ?? []),
      latestStatus: latestStatusMap.get(p.id)?.status ?? null,
      problemTags: problemTagsMap.get(p.id) ?? [],
    }));
  } else {
    // Path B: Progress filter active
    const idRows = await db
      .select({ id: problems.id })
      .from(problems)
      .leftJoin(users, eq(problems.authorId, users.id))
      .where(baseWhereClause)
      .orderBy(asc(problems.sequenceNumber), asc(problems.createdAt));
    const allIds = idRows.map((r) => r.id);

    const problemStatuses = new Map<string, Array<string | null>>();
    const latestStatusMap = new Map<string, { status: string | null; submittedAt: Date | null }>();
    if (allIds.length > 0) {
      const subRows = await db
        .select({
          problemId: submissions.problemId,
          status: submissions.status,
          submittedAt: submissions.submittedAt,
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
        const existing = latestStatusMap.get(row.problemId);
        if (!existing || (row.submittedAt && (!existing.submittedAt || row.submittedAt > existing.submittedAt))) {
          latestStatusMap.set(row.problemId, { status: row.status, submittedAt: row.submittedAt });
        }
      }
    }

    const matchingIds: string[] = [];
    for (const id of allIds) {
      const progress = getProblemProgress(problemStatuses.get(id) ?? []);
      if (currentFilter === "solved" && progress === "solved") matchingIds.push(id);
      else if (currentFilter === "attempted" && progress === "attempted") matchingIds.push(id);
      else if (currentFilter === "unsolved" && progress !== "solved") matchingIds.push(id);
    }

    totalCount = matchingIds.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    clampedPage = Math.min(currentPage, totalPages);
    const offset = (clampedPage - 1) * PAGE_SIZE;
    const pageIds = matchingIds.slice(offset, offset + PAGE_SIZE);

    if (pageIds.length > 0) {
      const pageProblems = await db
        .select({
          id: problems.id,
          sequenceNumber: problems.sequenceNumber,
          title: problems.title,
          timeLimitMs: problems.timeLimitMs,
          memoryLimitMb: problems.memoryLimitMb,
          difficulty: problems.difficulty,
          visibility: problems.visibility,
          authorId: problems.authorId,
          createdAt: problems.createdAt,
          author: { name: users.name },
        })
        .from(problems)
        .leftJoin(users, eq(problems.authorId, users.id))
        .where(inArray(problems.id, pageIds));

      // Fetch tags for page problems
      const problemTagsMap = new Map<string, Array<{ name: string; color: string | null }>>();
      const tagRows = await db
        .select({
          problemId: problemTags.problemId,
          name: tags.name,
          color: tags.color,
        })
        .from(problemTags)
        .innerJoin(tags, eq(problemTags.tagId, tags.id))
        .where(inArray(problemTags.problemId, pageIds));
      for (const row of tagRows) {
        const arr = problemTagsMap.get(row.problemId) ?? [];
        arr.push({ name: row.name, color: row.color });
        problemTagsMap.set(row.problemId, arr);
      }

      const rowMap = new Map(pageProblems.map((p) => [p.id, p]));
      filteredProblems = pageIds
        .map((id) => {
          const p = rowMap.get(id);
          if (!p) return null;
          return {
            ...p,
            progress: getProblemProgress(problemStatuses.get(id) ?? []),
            latestStatus: latestStatusMap.get(id)?.status ?? null,
            problemTags: problemTagsMap.get(id) ?? [],
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

  // Quick stats: count solved/attempted/untried across all visible problems
  const solvedCount = filteredProblems.filter((p) => p.progress === "solved").length;
  const attemptedCount = filteredProblems.filter((p) => p.progress === "attempted").length;
  const untriedCount = filteredProblems.filter((p) => p.progress === "untried").length;

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

  function renderProgress(problemProgress: ProblemProgress, latestStatus: string | null) {
    if (problemProgress === "solved") {
      return (
        <span className="inline-flex items-center gap-2 text-emerald-600">
          <CheckCircle2 className="size-4" />
          {progressLabels.solved}
        </span>
      );
    }

    if (problemProgress === "attempted" && latestStatus) {
      const statusLabel = tSubmissions(`status.${latestStatus}` as Parameters<typeof tSubmissions>[0]) ?? latestStatus;
      return (
        <SubmissionStatusBadge
          label={statusLabel}
          status={latestStatus}
        />
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
    return buildPageHref(1, filter, currentVisibility, searchQuery, currentTag);
  }

  return (
    <div>
      <div className="mb-4 flex justify-between items-center">
        <h2 className="text-2xl font-bold">{t("title")}</h2>
        {canManageProblems && (
          <div className="flex gap-2">
            <ProblemImportButton />
            <Link href="/dashboard/problems/create">
              <Button>{t("create")}</Button>
            </Link>
          </div>
        )}
      </div>

      {/* Quick stats summary */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-emerald-50/50 p-3 dark:bg-emerald-950/20">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="size-3.5 text-emerald-600" />
            {progressLabels.solved}
          </div>
          <div className="text-lg font-semibold">{solvedCount}</div>
        </div>
        <div className="rounded-lg border bg-amber-50/50 p-3 dark:bg-amber-950/20">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <XCircle className="size-3.5 text-amber-600" />
            {progressLabels.attempted}
          </div>
          <div className="text-lg font-semibold">{attemptedCount}</div>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CircleDashed className="size-3.5" />
            {progressLabels.untried}
          </div>
          <div className="text-lg font-semibold">{untriedCount}</div>
        </div>
      </div>

      {/* Search & Filter card - matching admin users style */}
      <Card>
        <CardContent>
          <form className="flex flex-col gap-4 md:flex-row md:items-end" method="get">
            <div className="flex-1 space-y-1.5">
              <label className="block text-sm font-medium" htmlFor="problem-search">
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
              <div className="space-y-1.5">
                <label className="block text-sm font-medium" htmlFor="problem-visibility">
                  {t("filterByVisibility")}
                </label>
                <FilterSelect
                  name="visibility"
                  defaultValue={currentVisibility}
                  placeholder={t("visibilityFilter.all")}
                  options={VISIBILITY_FILTER_VALUES.map((v) => ({
                    value: v,
                    label: visibilityFilterLabels[v],
                  }))}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-sm font-medium">
                {t("filterByTag")}
              </label>
              <FilterSelect
                name="tag"
                defaultValue={currentTag}
                placeholder={t("allTags")}
                options={[
                  { value: "", label: t("allTags") },
                  ...allTags.map((tag) => ({ value: tag.name, label: tag.name })),
                ]}
              />
            </div>

            {/* Preserve progress filter when submitting the form */}
            {currentFilter !== "all" && (
              <input type="hidden" name="progress" value={currentFilter} />
            )}

            <div className="flex gap-2 items-end">
              <Button type="submit">{t("applyFilters")}</Button>
              <Link href={PAGE_PATH}>
                <Button type="button" variant="outline">{t("resetFilters")}</Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-4">
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
                <TableHead>{t("table.tags")}</TableHead>
                <TableHead>{t("table.progress")}</TableHead>
                <TableHead>{t("table.author")}</TableHead>
                <TableHead>{t("table.timeLimit")}</TableHead>
                <TableHead>{t("table.memoryLimit")}</TableHead>
                <TableHead>{t("table.difficulty")}</TableHead>
                <TableHead>{t("table.visibility")}</TableHead>
                <TableHead>{t("table.action")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProblems.map((problem, index) => (
                <TableRow key={problem.id}>
                  <TableCell className="text-muted-foreground font-mono">
                    {problem.sequenceNumber ?? offset + index + 1}
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/dashboard/problems/${problem.id}`} className="text-primary hover:underline">
                      {problem.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {problem.problemTags.map((tag) => (
                        <Link
                          key={tag.name}
                          href={buildPageHref(1, currentFilter, currentVisibility, searchQuery, tag.name)}
                        >
                          <Badge
                            variant="outline"
                            className="cursor-pointer hover:bg-accent text-xs"
                            style={tag.color ? { borderColor: tag.color, color: tag.color } : undefined}
                          >
                            {tag.name}
                          </Badge>
                        </Link>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>{renderProgress(problem.progress, problem.latestStatus)}</TableCell>
                  <TableCell>{problem.author?.name || tCommon("system")}</TableCell>
                  <TableCell>{t("timeLimitValue", { value: problem.timeLimitMs ?? 2000 })}</TableCell>
                  <TableCell>{t("memoryLimitValue", { value: problem.memoryLimitMb ?? 256 })}</TableCell>
                  <TableCell>
                    {problem.difficulty != null ? t("difficultyValue", { value: formatDifficultyValue(problem.difficulty) }) : <span className="text-muted-foreground">-</span>}
                  </TableCell>
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
                      {(problem.authorId === session.user.id || canEditProblems) && (
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
                  <TableCell colSpan={10} className="text-center text-muted-foreground">
                    {t("noProblems")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>

          <PaginationControls
            currentPage={clampedPage}
            totalPages={totalPages}
            buildHref={(page) => buildPageHref(page, currentFilter, currentVisibility, searchQuery, currentTag)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
