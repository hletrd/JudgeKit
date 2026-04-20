import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { PaginationControls } from "@/components/pagination-controls";
import { Button } from "@/components/ui/button";
import { FilterSelect } from "@/components/filter-select";
import { Input } from "@/components/ui/input";
import { PublicProblemSetList } from "@/components/problem/public-problem-set-list";
import { buildLocalePath, buildPublicMetadata } from "@/lib/seo";
import { getResolvedSystemSettings } from "@/lib/system-settings";
import { countPublicProblemSets, listPublicProblemSets, listPublicProblemSetTags } from "@/lib/problem-sets/public";
import { normalizePage } from "@/lib/pagination";
import { normalizePracticeSearch } from "@/lib/practice/search";

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
  searchParams?: Promise<{ page?: string; search?: string; tag?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const currentPage = normalizePage(resolvedSearchParams?.page);
  const searchQuery = normalizePracticeSearch(resolvedSearchParams?.search);
  const currentTag = resolvedSearchParams?.tag?.trim() ?? "";
  const locale = await getLocale();
  const t = await getTranslations("publicShell");

  const [totalCount, availableTags] = await Promise.all([
    countPublicProblemSets(searchQuery, currentTag),
    listPublicProblemSetTags(),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const clampedPage = Math.min(currentPage, totalPages);
  const offset = (clampedPage - 1) * PAGE_SIZE;
  const items = await listPublicProblemSets({ limit: PAGE_SIZE, offset, search: searchQuery, tag: currentTag });

  function buildHref(page: number, nextTag = currentTag) {
    const params = new URLSearchParams();
    if (searchQuery) params.set("search", searchQuery);
    if (nextTag) params.set("tag", nextTag);
    if (page > 1) params.set("page", String(page));
    const query = params.toString();
    return query ? `${PAGE_PATH}?${query}` : PAGE_PATH;
  }

  return (
    <div className="space-y-6">
      <form className="flex flex-col gap-3 md:flex-row md:items-end" method="get">
        <div className="flex-1 space-y-1.5">
          <label className="block text-sm font-medium" htmlFor="problem-set-search">
            {t("practice.sets.searchLabel")}
          </label>
          <Input
            id="problem-set-search"
            name="search"
            type="search"
            defaultValue={searchQuery}
            placeholder={t("practice.sets.searchPlaceholder")}
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
              ...availableTags.map((tag) => ({ value: tag.name, label: tag.name })),
            ]}
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit">{t("practice.applyFilters")}</Button>
          <a href={PAGE_PATH}>
            <Button type="button" variant="outline">{t("practice.resetFilters")}</Button>
          </a>
        </div>
      </form>
      <PublicProblemSetList
        title={t("practice.sets.title")}
        description={t("practice.sets.description")}
        emptyLabel={t("practice.sets.empty")}
        openLabel={t("practice.sets.open")}
        locale={locale}
        items={items.map((item) => ({
          id: item.id,
          href: buildLocalePath(`/practice/sets/${item.id}`, locale),
          name: item.name,
          description: item.description,
          creatorName: item.creator?.name ?? item.creator?.username ?? t("practice.unknownAuthor"),
          publicProblemCountLabel: t("practice.sets.problemCount", { count: item.publicProblemCount }),
          tags: item.tags,
        }))}
      />
      <PaginationControls
        currentPage={clampedPage}
        totalPages={totalPages}
        pageSize={PAGE_SIZE}
        buildHref={(page) => buildHref(page)}
      />
    </div>
  );
}
