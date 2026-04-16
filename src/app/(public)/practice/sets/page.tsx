import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { PaginationControls } from "@/components/pagination-controls";
import { PublicProblemSetList } from "@/components/problem/public-problem-set-list";
import { buildLocalePath, buildPublicMetadata } from "@/lib/seo";
import { getResolvedSystemSettings } from "@/lib/system-settings";
import { countPublicProblemSets, listPublicProblemSets } from "@/lib/problem-sets/public";
import { normalizePage } from "@/lib/pagination";

const PAGE_PATH = "/practice/sets";
const PAGE_SIZE = 20;

export async function generateMetadata(): Promise<Metadata> {
  const [tCommon, tShell, locale] = await Promise.all([
    getTranslations("common"),
    getTranslations("publicShell"),
    getLocale(),
  ]);
  const settings = await getResolvedSystemSettings({
    siteTitle: tCommon("appName"),
    siteDescription: tCommon("appDescription"),
  });

  return buildPublicMetadata({
    title: tShell("practice.sets.title"),
    description: tShell("practice.sets.description"),
    path: PAGE_PATH,
    siteTitle: settings.siteTitle,
    locale,
    section: tShell("nav.practice"),
  });
}

export default async function PracticeSetsPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const currentPage = normalizePage(resolvedSearchParams?.page);
  const locale = await getLocale();
  const t = await getTranslations("publicShell");

  const totalCount = await countPublicProblemSets();
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const clampedPage = Math.min(currentPage, totalPages);
  const offset = (clampedPage - 1) * PAGE_SIZE;
  const items = await listPublicProblemSets({ limit: PAGE_SIZE, offset });

  return (
    <div className="space-y-6">
      <PublicProblemSetList
        title={t("practice.sets.title")}
        description={t("practice.sets.description")}
        emptyLabel={t("practice.sets.empty")}
        openLabel={t("practice.sets.open")}
        items={items.map((item) => ({
          id: item.id,
          href: buildLocalePath(`/practice/sets/${item.id}`, locale),
          name: item.name,
          description: item.description,
          creatorName: item.creator?.name ?? item.creator?.username ?? t("practice.unknownAuthor"),
          publicProblemCountLabel: t("practice.sets.problemCount", { count: item.publicProblemCount }),
        }))}
      />
      <PaginationControls
        currentPage={clampedPage}
        totalPages={totalPages}
        pageSize={PAGE_SIZE}
        buildHref={(page) => page > 1 ? `${PAGE_PATH}?page=${page}` : PAGE_PATH}
      />
    </div>
  );
}
