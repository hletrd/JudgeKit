import Link from "next/link";
import { and, desc, eq, like, sql } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PaginationControls } from "@/components/pagination-controls";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { auth } from "@/lib/auth";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { FilterSelect } from "@/components/filter-select";
import { db } from "@/lib/db";
import { files, users } from "@/lib/db/schema";
import { formatDateTimeInTimeZone } from "@/lib/datetime";
import { getResolvedSystemTimeZone } from "@/lib/system-settings";
import { getConfiguredSettings } from "@/lib/system-settings-config";
import { FileManagementClient } from "./file-management-client";

const PAGE_SIZE = 24;
const PAGE_PATH = "/dashboard/admin/files";
const CATEGORY_VALUES = ["all", "image", "attachment"] as const;
type CategoryFilter = (typeof CATEGORY_VALUES)[number];

function normalizePage(value?: string) {
  const parsed = Number(value ?? "1");
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.floor(parsed);
}

function normalizeCategoryFilter(value?: string): CategoryFilter {
  if (CATEGORY_VALUES.includes(value as CategoryFilter)) return value as CategoryFilter;
  return "all";
}

function normalizeSearch(value?: string) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 200);
}

function buildPageHref(page: number, category: CategoryFilter, search: string) {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (category !== "all") params.set("category", category);
  if (search) params.set("search", search);
  const qs = params.toString();
  return qs ? `${PAGE_PATH}?${qs}` : PAGE_PATH;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function AdminFilesPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string; category?: string; search?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const caps = await resolveCapabilities(session.user.role);
  if (!caps.has("files.manage")) redirect("/dashboard");

  const resolvedParams = searchParams ? await searchParams : undefined;
  const requestedPage = normalizePage(resolvedParams?.page);
  const categoryFilter = normalizeCategoryFilter(resolvedParams?.category);
  const searchQuery = normalizeSearch(resolvedParams?.search);

  const [t, tCommon, locale, timeZone] = await Promise.all([
    getTranslations("admin.files"),
    getTranslations("common"),
    getLocale(),
    getResolvedSystemTimeZone(),
  ]);

  const categoryLabels = {
    all: t("filters.categoryAll"),
    image: t("filters.categoryImage"),
    attachment: t("filters.categoryAttachment"),
  };

  const conditions = [];
  if (categoryFilter !== "all") {
    conditions.push(eq(files.category, categoryFilter));
  }
  if (searchQuery) {
    conditions.push(like(files.originalName, `%${searchQuery}%`));
  }
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ total }] = await db
    .select({ total: sql<number>`count(${files.id})` })
    .from(files)
    .where(whereClause);

  const totalCount = Number(total ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const offset = (currentPage - 1) * PAGE_SIZE;

  const rows = await db
    .select({
      id: files.id,
      originalName: files.originalName,
      mimeType: files.mimeType,
      sizeBytes: files.sizeBytes,
      category: files.category,
      width: files.width,
      height: files.height,
      createdAt: files.createdAt,
      uploaderName: users.name,
    })
    .from(files)
    .leftJoin(users, eq(files.uploadedBy, users.id))
    .where(whereClause)
    .orderBy(desc(files.createdAt))
    .limit(PAGE_SIZE)
    .offset(offset);

  const rangeStart = rows.length === 0 ? 0 : offset + 1;
  const rangeEnd = offset + rows.length;

  const serializedRows = rows.map((row) => ({
    ...row,
    createdAt: row.createdAt ? row.createdAt.toISOString() : null,
    formattedSize: formatFileSize(row.sizeBytes),
    formattedDate: row.createdAt
      ? formatDateTimeInTimeZone(row.createdAt, locale, timeZone)
      : "-",
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
      </div>

      <Card>
        <CardContent>
          <form className="flex flex-col gap-4 md:flex-row md:items-end" method="get">
            <div className="flex-1 space-y-1.5">
              <label className="block text-sm font-medium" htmlFor="file-search">
                {t("filters.searchLabel")}
              </label>
              <Input
                id="file-search"
                name="search"
                type="search"
                defaultValue={searchQuery}
                placeholder={t("filters.searchPlaceholder")}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium" htmlFor="file-category">
                {t("filters.categoryLabel")}
              </label>
              <FilterSelect
                name="category"
                defaultValue={categoryFilter}
                placeholder={categoryLabels.all}
                options={CATEGORY_VALUES.map((value) => ({
                  value,
                  label: categoryLabels[value],
                }))}
              />
            </div>

            <div className="flex gap-2 items-end">
              <Button type="submit">{tCommon("apply")}</Button>
              <Link href={PAGE_PATH}>
                <Button type="button" variant="outline">{tCommon("reset")}</Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <FileManagementClient
        files={serializedRows}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        totalCount={totalCount}
        maxFileSizeBytes={getConfiguredSettings().uploadMaxFileSizeBytes}
      />

      <PaginationControls
        currentPage={currentPage}
        totalPages={totalPages}
        buildHref={(page) => buildPageHref(page, categoryFilter, searchQuery)}
      />
    </div>
  );
}
