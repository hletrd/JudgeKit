import type { Metadata } from "next";
import { and, asc, count, desc, eq, like, sql, inArray } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { problems, submissions, tags, problemTags } from "@/lib/db/schema";
import { PublicProblemList } from "../_components/public-problem-list";
import { JsonLd } from "@/components/seo/json-ld";
import { PaginationControls } from "@/components/pagination-controls";
import { buildAbsoluteUrl, buildLocalePath, buildPublicMetadata } from "@/lib/seo";
import { getResolvedSystemSettings } from "@/lib/system-settings";
import { auth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FilterSelect } from "@/components/filter-select";
import Link from "next/link";
import { normalizePage, normalizePageSize, setPaginationParams } from "@/lib/pagination";

type ProblemProgress = "solved" | "attempted" | "untried";
type ProgressFilter = "all" | "solved" | "unsolved" | "attempted";
type SortOption = "number_asc" | "difficulty_asc" | "difficulty_desc" | "successRate_desc" | "newest";

const SORT_VALUES: readonly SortOption[] = ["number_asc", "difficulty_asc", "difficulty_desc", "successRate_desc", "newest"];
const PROGRESS_FILTER_VALUES: readonly ProgressFilter[] = ["all", "solved", "unsolved", "attempted"];

const PAGE_PATH = "/practice";

function normalizeSearch(value?: string) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 200);
}

function escapeLike(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function getProblemProgress(statuses: Array<string | null>): ProblemProgress {
  if (statuses.some((s) => s === "accepted")) return "solved";
  if (statuses.length > 0) return "attempted";
  return "untried";
}

function combineFilters(...filters: (ReturnType<typeof eq> | undefined)[]) {
  const defined = filters.filter(Boolean) as Exclude<(typeof filters)[number], undefined>[];
  if (defined.length === 0) return undefined;
  if (defined.length === 1) return defined[0];
  return and(...defined);
}

function buildPageHref(
  page: number,
  pageSize: number,
  search: string,
  tag: string,
  sort: SortOption,
  progressFilter: ProgressFilter,
) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (tag) params.set("tag", tag);
  if (sort !== "number_asc") params.set("sort", sort);
  if (progressFilter !== "all") params.set("progress", progressFilter);
  setPaginationParams(params, page, pageSize);
  const qs = params.toString();
  return qs ? `${PAGE_PATH}?${qs}` : PAGE_PATH;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string; pageSize?: string }>;
} = {}): Promise<Metadata> {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const pageSize = normalizePageSize(resolvedSearchParams?.pageSize);
  const requestedPage = normalizePage(resolvedSearchParams?.page);

  const [tCommon, tShell, locale, countRows] = await Promise.all([
    getTranslations("common"),
    getTranslations("publicShell"),
    getLocale(),
    db.select({ total: count() }).from(problems).where(eq(problems.visibility, "public")),
  ]);
  const settings = await getResolvedSystemSettings({
    siteTitle: tCommon("appName"),
    siteDescription: tCommon("appDescription"),
  });
  const totalCount = Number(countRows[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);

  const pageLabel = currentPage > 1 ? tCommon("paginationPage", { page: currentPage }) : null;
  const title = currentPage > 1
    ? `${tShell("practice.catalogTitle")} · ${pageLabel}`
    : tShell("practice.catalogTitle");
  const description = currentPage > 1
    ? `${tShell("practice.catalogDescription")} ${pageLabel}.`
    : tShell("practice.catalogDescription");

  return buildPublicMetadata({
    title,
    description,
    path: buildPageHref(currentPage, pageSize, "", "", "number_asc", "all"),
    siteTitle: settings.siteTitle,
    locale,
    keywords: [
      "algorithm practice",
      "coding interview problems",
      "programming exercises",
    ],
    section: tShell("nav.practice"),
  });
}

export default async function PracticePage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string; pageSize?: string; search?: string; tag?: string; sort?: string; progress?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const pageSize = normalizePageSize(resolvedSearchParams?.pageSize);
  const currentPage = normalizePage(resolvedSearchParams?.page);
  const searchQuery = normalizeSearch(resolvedSearchParams?.search);
  const currentTag = resolvedSearchParams?.tag?.trim() ?? "";
  const currentSort: SortOption = SORT_VALUES.includes(resolvedSearchParams?.sort as SortOption)
    ? (resolvedSearchParams!.sort as SortOption)
    : "number_asc";
  const rawProgressFilter = resolvedSearchParams?.progress;
  const currentProgressFilter: ProgressFilter = PROGRESS_FILTER_VALUES.includes(rawProgressFilter as ProgressFilter)
    ? (rawProgressFilter as ProgressFilter)
    : "all";

  const [t, tProblems, locale] = await Promise.all([
    getTranslations("publicShell"),
    getTranslations("problems"),
    getLocale(),
  ]);

  // Check auth for progress tracking
  const session = await auth();
  const userId = session?.user?.id ?? null;

  // Fetch all tags for the filter dropdown
  const allTags = await db
    .select({ id: tags.id, name: tags.name, color: tags.color })
    .from(tags)
    .orderBy(asc(tags.name));

  // Base visibility filter: only public problems
  const visibilityFilter = eq(problems.visibility, "public");

  // Search filter
  const searchFilter = searchQuery
    ? like(problems.title, `%${escapeLike(searchQuery)}%`)
    : undefined;

  // Tag filter
  const tagFilter = currentTag
    ? sql`exists (
        select 1 from ${problemTags}
        inner join ${tags} on ${problemTags.tagId} = ${tags.id}
        where ${problemTags.problemId} = ${problems.id}
          and ${tags.name} = ${currentTag}
      )`
    : undefined;

  const baseWhereClause = combineFilters(visibilityFilter, searchFilter, tagFilter);

  // For non-sort-based queries we still need to count
  // Determine sort order
  function getOrderBy() {
    switch (currentSort) {
      case "difficulty_asc":
        return [asc(problems.difficulty), asc(problems.sequenceNumber)];
      case "difficulty_desc":
        return [desc(problems.difficulty), asc(problems.sequenceNumber)];
      case "newest":
        return [desc(problems.createdAt), asc(problems.sequenceNumber)];
      default:
        return [asc(problems.sequenceNumber), asc(problems.createdAt)];
    }
  }

  // --- Path A: No progress filter (or not logged in) ---
  let filteredProblems: Array<{
    id: string;
    sequenceNumber: number | null;
    title: string;
    difficulty: number | null;
    createdAt: Date | null;
    problemTags: Array<{ name: string; color: string | null }>;
    solverCount: number;
    submissionCount: number;
    acceptedCount: number;
    progress: ProblemProgress | null;
  }>;
  let totalCount: number;
  let clampedPage: number;

  if (currentProgressFilter === "all" || !userId) {
    // Count total matching problems
    const [{ total }] = await db
      .select({ total: count() })
      .from(problems)
      .where(baseWhereClause);
    totalCount = Number(total);

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    clampedPage = Math.min(currentPage, totalPages);
    const offset = (clampedPage - 1) * pageSize;

    // For successRate sort, we need a different approach — sort in application code
    if (currentSort === "successRate_desc") {
      // Fetch all matching problem IDs with stats, sort by rate, then paginate
      const allProblemRows = await db.query.problems.findMany({
        where: baseWhereClause,
        columns: {
          id: true,
          sequenceNumber: true,
          title: true,
          difficulty: true,
          createdAt: true,
        },
        with: {
          problemTags: {
            with: {
              tag: { columns: { name: true, color: true } },
            },
          },
        },
      });

      // Fetch stats for all
      const allIds = allProblemRows.map((p) => p.id);
      const statsMap = new Map<string, { solverCount: number; submissionCount: number; acceptedCount: number }>();
      if (allIds.length > 0) {
        const statsRows = await db
          .select({
            problemId: submissions.problemId,
            submissionCount: count(),
            solverCount: sql<number>`count(distinct case when ${submissions.status} = 'accepted' then ${submissions.userId} end)`,
            acceptedCount: sql<number>`count(case when ${submissions.status} = 'accepted' then 1 end)`,
          })
          .from(submissions)
          .where(sql`${submissions.problemId} IN (${sql.join(allIds.map((id) => sql`${id}`), sql`, `)})`)
          .groupBy(submissions.problemId);
        for (const row of statsRows) {
          statsMap.set(row.problemId, {
            solverCount: Number(row.solverCount),
            submissionCount: Number(row.submissionCount),
            acceptedCount: Number(row.acceptedCount),
          });
        }
      }

      const withRate = allProblemRows.map((p) => {
        const s = statsMap.get(p.id);
        const sc = s?.submissionCount ?? 0;
        const ac = s?.acceptedCount ?? 0;
        return { ...p, solverCount: s?.solverCount ?? 0, submissionCount: sc, acceptedCount: ac, rate: sc > 0 ? ac / sc : -1 };
      });
      withRate.sort((a, b) => b.rate - a.rate);

      const pageSlice = withRate.slice(offset, offset + pageSize);
      totalCount = withRate.length;
      const tp2 = Math.max(1, Math.ceil(totalCount / pageSize));
      clampedPage = Math.min(currentPage, tp2);

      // Fetch user progress for the page slice if logged in
      const progressMap = new Map<string, Array<string | null>>();
      if (userId && pageSlice.length > 0) {
        const subRows = await db
          .select({ problemId: submissions.problemId, status: submissions.status })
          .from(submissions)
          .where(and(eq(submissions.userId, userId), inArray(submissions.problemId, pageSlice.map((p) => p.id))));
        for (const row of subRows) {
          const arr = progressMap.get(row.problemId) ?? [];
          arr.push(row.status);
          progressMap.set(row.problemId, arr);
        }
      }

      filteredProblems = pageSlice.map((p) => ({
        id: p.id,
        sequenceNumber: p.sequenceNumber,
        title: p.title,
        difficulty: p.difficulty,
        createdAt: p.createdAt,
        problemTags: p.problemTags.map((e) => ({ name: e.tag.name, color: e.tag.color })),
        solverCount: p.solverCount,
        submissionCount: p.submissionCount,
        acceptedCount: p.acceptedCount,
        progress: userId ? getProblemProgress(progressMap.get(p.id) ?? []) : null,
      }));
    } else {
      // Standard sort via DB
      const publicProblems = await db.query.problems.findMany({
        where: baseWhereClause,
        columns: {
          id: true,
          sequenceNumber: true,
          title: true,
          difficulty: true,
          createdAt: true,
        },
        with: {
          problemTags: {
            with: {
              tag: { columns: { name: true, color: true } },
            },
          },
        },
        orderBy: getOrderBy(),
        limit: pageSize,
        offset,
      });

      // Aggregate submission stats per problem
      const problemIds = publicProblems.map((p) => p.id);
      const statsMap = new Map<string, { solverCount: number; submissionCount: number; acceptedCount: number }>();

      if (problemIds.length > 0) {
        const stats = await db
          .select({
            problemId: submissions.problemId,
            submissionCount: count(),
            solverCount: sql<number>`count(distinct case when ${submissions.status} = 'accepted' then ${submissions.userId} end)`,
            acceptedCount: sql<number>`count(case when ${submissions.status} = 'accepted' then 1 end)`,
          })
          .from(submissions)
          .where(sql`${submissions.problemId} IN (${sql.join(problemIds.map((id) => sql`${id}`), sql`, `)})`)
          .groupBy(submissions.problemId);

        for (const row of stats) {
          statsMap.set(row.problemId, {
            solverCount: Number(row.solverCount),
            submissionCount: Number(row.submissionCount),
            acceptedCount: Number(row.acceptedCount),
          });
        }
      }

      // Fetch user progress if logged in
      const progressMap = new Map<string, Array<string | null>>();
      if (userId && problemIds.length > 0) {
        const subRows = await db
          .select({ problemId: submissions.problemId, status: submissions.status })
          .from(submissions)
          .where(and(eq(submissions.userId, userId), inArray(submissions.problemId, problemIds)));
        for (const row of subRows) {
          const arr = progressMap.get(row.problemId) ?? [];
          arr.push(row.status);
          progressMap.set(row.problemId, arr);
        }
      }

      filteredProblems = publicProblems.map((problem) => {
        const stats = statsMap.get(problem.id);
        return {
          id: problem.id,
          sequenceNumber: problem.sequenceNumber ?? null,
          title: problem.title,
          difficulty: problem.difficulty,
          createdAt: problem.createdAt,
          problemTags: problem.problemTags.map((e) => ({ name: e.tag.name, color: e.tag.color })),
          solverCount: stats?.solverCount ?? 0,
          submissionCount: stats?.submissionCount ?? 0,
          acceptedCount: stats?.acceptedCount ?? 0,
          progress: userId ? getProblemProgress(progressMap.get(problem.id) ?? []) : null,
        };
      });
    }
  } else {
    // --- Path B: Progress filter active (requires auth) ---
    const allProblemRows = await db.query.problems.findMany({
      where: baseWhereClause,
      columns: { id: true },
    });
    const allIds = allProblemRows.map((p) => p.id);

    // Fetch all user submissions for these problems
    const progressMap = new Map<string, Array<string | null>>();
    if (allIds.length > 0) {
      const subRows = await db
        .select({ problemId: submissions.problemId, status: submissions.status })
        .from(submissions)
        .where(and(eq(submissions.userId, userId!), inArray(submissions.problemId, allIds)));
      for (const row of subRows) {
        const arr = progressMap.get(row.problemId) ?? [];
        arr.push(row.status);
        progressMap.set(row.problemId, arr);
      }
    }

    const matchingIds: string[] = [];
    for (const id of allIds) {
      const progress = getProblemProgress(progressMap.get(id) ?? []);
      if (currentProgressFilter === "solved" && progress === "solved") matchingIds.push(id);
      else if (currentProgressFilter === "attempted" && progress === "attempted") matchingIds.push(id);
      else if (currentProgressFilter === "unsolved" && progress !== "solved") matchingIds.push(id);
    }

    totalCount = matchingIds.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    clampedPage = Math.min(currentPage, totalPages);
    const offset = (clampedPage - 1) * pageSize;
    const pageIds = matchingIds.slice(offset, offset + pageSize);

    if (pageIds.length > 0) {
      const pageProblems = await db.query.problems.findMany({
        where: inArray(problems.id, pageIds),
        columns: {
          id: true,
          sequenceNumber: true,
          title: true,
          difficulty: true,
          createdAt: true,
        },
        with: {
          problemTags: {
            with: {
              tag: { columns: { name: true, color: true } },
            },
          },
        },
      });

      const statsMap = new Map<string, { solverCount: number; submissionCount: number; acceptedCount: number }>();
      const statsRows = await db
        .select({
          problemId: submissions.problemId,
          submissionCount: count(),
          solverCount: sql<number>`count(distinct case when ${submissions.status} = 'accepted' then ${submissions.userId} end)`,
          acceptedCount: sql<number>`count(case when ${submissions.status} = 'accepted' then 1 end)`,
        })
        .from(submissions)
        .where(sql`${submissions.problemId} IN (${sql.join(pageIds.map((id) => sql`${id}`), sql`, `)})`)
        .groupBy(submissions.problemId);
      for (const row of statsRows) {
        statsMap.set(row.problemId, {
          solverCount: Number(row.solverCount),
          submissionCount: Number(row.submissionCount),
          acceptedCount: Number(row.acceptedCount),
        });
      }

      const rowMap = new Map(pageProblems.map((p) => [p.id, p]));
      filteredProblems = pageIds
        .map((id) => {
          const p = rowMap.get(id);
          if (!p) return null;
          const stats = statsMap.get(id);
          return {
            id: p.id,
            sequenceNumber: p.sequenceNumber ?? null,
            title: p.title,
            difficulty: p.difficulty,
            createdAt: p.createdAt,
            problemTags: p.problemTags.map((e) => ({ name: e.tag.name, color: e.tag.color })),
            solverCount: stats?.solverCount ?? 0,
            submissionCount: stats?.submissionCount ?? 0,
            acceptedCount: stats?.acceptedCount ?? 0,
            progress: getProblemProgress(progressMap.get(id) ?? []) as ProblemProgress,
          };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);
    } else {
      filteredProblems = [];
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const offset = (clampedPage - 1) * pageSize;
  const rangeStart = totalCount === 0 ? 0 : offset + 1;
  const rangeEnd = offset + filteredProblems.length;

  // Sort option labels
  const sortOptionLabels: Record<SortOption, string> = {
    number_asc: t("practice.sortOptions.number_asc"),
    difficulty_asc: t("practice.sortOptions.difficulty_asc"),
    difficulty_desc: t("practice.sortOptions.difficulty_desc"),
    successRate_desc: t("practice.sortOptions.successRate_desc"),
    newest: t("practice.sortOptions.newest"),
  };

  const progressFilterLabels: Record<ProgressFilter, string> = {
    all: t("practice.progressFilter.all"),
    solved: t("practice.progressFilter.solved"),
    unsolved: t("practice.progressFilter.unsolved"),
    attempted: t("practice.progressFilter.attempted"),
  };

  const practiceJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: t("practice.catalogTitle"),
    description: t("practice.catalogDescription"),
    url: buildAbsoluteUrl(buildLocalePath(buildPageHref(clampedPage, pageSize, searchQuery, currentTag, currentSort, currentProgressFilter), locale)),
    inLanguage: locale,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: filteredProblems.map((problem, index) => ({
        "@type": "ListItem",
        position: offset + index + 1,
        url: buildAbsoluteUrl(buildLocalePath(`/practice/problems/${problem.id}`, locale)),
        name: problem.title,
      })),
    },
  };

  return (
    <>
      <JsonLd data={practiceJsonLd} />

      {/* Search & Filter */}
      <Card className="mb-4">
        <CardContent>
          <form className="flex flex-col gap-4 md:flex-row md:items-end" method="get">
            <div className="flex-1 space-y-1.5">
              <label className="block text-sm font-medium" htmlFor="practice-search">
                {t("practice.searchLabel")}
              </label>
              <Input
                id="practice-search"
                name="search"
                type="search"
                defaultValue={searchQuery}
                placeholder={t("practice.searchPlaceholder")}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium">
                {t("practice.filterByTag")}
              </label>
              <FilterSelect
                name="tag"
                defaultValue={currentTag}
                placeholder={t("practice.allTags")}
                options={[
                  { value: "", label: t("practice.allTags") },
                  ...allTags.map((tag) => ({ value: tag.name, label: tag.name })),
                ]}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium">
                {t("practice.sortBy")}
              </label>
              <FilterSelect
                name="sort"
                defaultValue={currentSort}
                placeholder={sortOptionLabels.number_asc}
                options={SORT_VALUES.map((v) => ({
                  value: v,
                  label: sortOptionLabels[v],
                }))}
              />
            </div>

            {/* Preserve progress filter when submitting */}
            {currentProgressFilter !== "all" && (
              <input type="hidden" name="progress" value={currentProgressFilter} />
            )}
            <input type="hidden" name="pageSize" value={String(pageSize)} />

            <div className="flex gap-2 items-end">
              <Button type="submit">{t("practice.applyFilters")}</Button>
              <Link href={PAGE_PATH}>
                <Button type="button" variant="outline">{t("practice.resetFilters")}</Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Progress filter tabs (only when logged in) */}
      {userId && (
        <div className="mb-4 flex flex-wrap gap-2">
          {PROGRESS_FILTER_VALUES.map((filter) => (
            <Link key={filter} href={buildPageHref(1, pageSize, searchQuery, currentTag, currentSort, filter)}>
              <Button variant={currentProgressFilter === filter ? "default" : "outline"} size="sm">
                {progressFilterLabels[filter]}
              </Button>
            </Link>
          ))}
        </div>
      )}

      {totalCount > 0 && (
        <p className="mb-4 text-sm text-muted-foreground">
          {t("practice.showingRange", { start: rangeStart, end: rangeEnd, total: totalCount })}
        </p>
      )}

      <PublicProblemList
        title={t("practice.catalogTitle")}
        description={t("practice.catalogDescription")}
        noProblemsLabel={t("practice.noProblems")}
        numberLabel={tProblems("table.number")}
        problemTitleLabel={tProblems("table.title")}
        difficultyLabel={tProblems("table.difficulty")}
        tagLabel={tProblems("table.tags")}
        solverCountLabel={t("practice.solverCount")}
        successRateLabel={t("practice.successRate")}
        createdAtLabel={t("practice.createdAt")}
        progressLabel={t("practice.progressLabel")}
        progressLabels={{
          solved: t("practice.progress.solved"),
          attempted: t("practice.progress.attempted"),
          untried: t("practice.progress.untried"),
        }}
        problems={filteredProblems.map((problem) => {
          const successRate = problem.submissionCount > 0
            ? (problem.acceptedCount / problem.submissionCount) * 100
            : null;

          return {
            id: problem.id,
            href: buildLocalePath(`/practice/problems/${problem.id}`, locale),
            sequenceNumber: problem.sequenceNumber ?? null,
            title: problem.title,
            difficultyLabel: problem.difficulty != null
              ? tProblems("badges.difficulty", { value: problem.difficulty.toFixed(2).replace(/\.?0+$/, "") })
              : null,
            tags: problem.problemTags.map((tag) => ({
              name: tag.name,
              color: tag.color,
              href: buildPageHref(1, pageSize, searchQuery, tag.name, currentSort, currentProgressFilter),
            })),
            solverCount: problem.solverCount,
            submissionCount: problem.submissionCount,
            successRate,
            progress: problem.progress,
            createdAt: problem.createdAt
              ? problem.createdAt.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" })
              : null,
          };
        })}
      />
      <PaginationControls
        currentPage={clampedPage}
        totalPages={totalPages}
        pageSize={pageSize}
        buildHref={(page, nextPageSize) => buildPageHref(page, nextPageSize, searchQuery, currentTag, currentSort, currentProgressFilter)}
      />
    </>
  );
}
