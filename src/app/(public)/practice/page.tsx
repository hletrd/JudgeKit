import type { Metadata } from "next";
import { asc, count, eq, sql } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { problems, submissions } from "@/lib/db/schema";
import { PublicProblemList } from "../_components/public-problem-list";
import { JsonLd } from "@/components/seo/json-ld";
import { PaginationControls } from "@/components/pagination-controls";
import { buildAbsoluteUrl, buildLocalePath, buildPublicMetadata } from "@/lib/seo";
import { getResolvedSystemSettings } from "@/lib/system-settings";

const PAGE_SIZE = 30;
const PAGE_PATH = "/practice";

function normalizePage(value?: string) {
  const parsed = Number(value ?? "1");
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.floor(parsed);
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string }>;
} = {}): Promise<Metadata> {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
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
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
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
    path: currentPage > 1 ? `/practice?page=${currentPage}` : "/practice",
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
  searchParams?: Promise<{ page?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const currentPage = normalizePage(resolvedSearchParams?.page);

  const [t, tProblems, locale] = await Promise.all([
    getTranslations("publicShell"),
    getTranslations("problems"),
    getLocale(),
  ]);

  const whereClause = eq(problems.visibility, "public");

  const [{ total }] = await db
    .select({ total: count() })
    .from(problems)
    .where(whereClause);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const clampedPage = Math.min(currentPage, totalPages);
  const offset = (clampedPage - 1) * PAGE_SIZE;

  const publicProblems = await db.query.problems.findMany({
    where: whereClause,
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
          tag: {
            columns: { name: true, color: true },
          },
        },
      },
    },
    orderBy: [asc(problems.sequenceNumber), asc(problems.createdAt)],
    limit: PAGE_SIZE,
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

  const practiceJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: t("practice.catalogTitle"),
    description: t("practice.catalogDescription"),
    url: buildAbsoluteUrl(buildLocalePath(clampedPage > 1 ? `/practice?page=${clampedPage}` : "/practice", locale)),
    inLanguage: locale,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: publicProblems.map((problem, index) => ({
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
        problems={publicProblems.map((problem) => {
          const stats = statsMap.get(problem.id);
          const submissionCount = stats?.submissionCount ?? 0;
          const acceptedCount = stats?.acceptedCount ?? 0;
          const successRate = submissionCount > 0 ? (acceptedCount / submissionCount) * 100 : null;

          return {
            id: problem.id,
            href: buildLocalePath(`/practice/problems/${problem.id}`, locale),
            sequenceNumber: problem.sequenceNumber ?? null,
            title: problem.title,
            difficultyLabel: problem.difficulty != null
              ? tProblems("badges.difficulty", { value: problem.difficulty.toFixed(2).replace(/\.?0+$/, "") })
              : null,
            tags: problem.problemTags.map((entry) => ({
              name: entry.tag.name,
              color: entry.tag.color,
            })),
            solverCount: stats?.solverCount ?? 0,
            submissionCount,
            successRate,
            createdAt: problem.createdAt
              ? problem.createdAt.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" })
              : null,
          };
        })}
      />
      <PaginationControls
        currentPage={clampedPage}
        totalPages={totalPages}
        buildHref={(page) => buildLocalePath(page > 1 ? `${PAGE_PATH}?page=${page}` : PAGE_PATH, locale)}
      />
    </>
  );
}
