import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "@/lib/pagination";

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  pageSize?: number;
  buildHref: (page: number, pageSize: number) => string;
}

const navBtn = "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground size-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const navBtnDisabled = "inline-flex items-center justify-center rounded-md text-sm font-medium size-8 pointer-events-none opacity-40";
const pageBtn = "inline-flex items-center justify-center rounded-md font-medium transition-colors hover:bg-accent hover:text-accent-foreground size-8 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const pageBtnActive = "inline-flex items-center justify-center rounded-md font-medium transition-colors bg-primary text-primary-foreground hover:bg-primary/90 size-8 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | "...")[] = [1];

  if (current > 3) {
    pages.push("...");
  }

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) {
    pages.push("...");
  }

  pages.push(total);

  return pages;
}

export async function PaginationControls({
  currentPage,
  totalPages,
  pageSize = DEFAULT_PAGE_SIZE,
  buildHref,
}: PaginationControlsProps) {
  const t = await getTranslations("common");
  const shouldRenderPageNav = totalPages > 1;
  const shouldRenderSizeSelector = PAGE_SIZE_OPTIONS.length > 1;

  if (!shouldRenderPageNav && !shouldRenderSizeSelector) return null;

  const pages = getPageNumbers(currentPage, totalPages);

  return (
    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {shouldRenderSizeSelector && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t("paginationPageSize")}</span>
          <div className="flex flex-wrap gap-1">
            {PAGE_SIZE_OPTIONS.map((size) => (
              <Link
                key={size}
                href={buildHref(1, size)}
                aria-current={size === pageSize ? "page" : undefined}
                aria-label={t("paginationPageSizeOption", { size })}
                className={size === pageSize ? pageBtnActive : pageBtn}
              >
                {size}
              </Link>
            ))}
          </div>
        </div>
      )}

      {shouldRenderPageNav && (
        <nav role="navigation" aria-label={t("paginationNav")} className="flex items-center justify-center gap-1">
          {currentPage > 1 ? (
            <Link href={buildHref(1, pageSize)} aria-label={t("paginationFirst")} className={navBtn}>
              <ChevronsLeft className="size-4" aria-hidden="true" />
            </Link>
          ) : (
            <button disabled aria-disabled="true" aria-label={t("paginationFirst")} className={navBtnDisabled}>
              <ChevronsLeft className="size-4" aria-hidden="true" />
            </button>
          )}

          {currentPage > 1 ? (
            <Link href={buildHref(currentPage - 1, pageSize)} aria-label={t("paginationPrevious")} className={navBtn}>
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Link>
          ) : (
            <button disabled aria-disabled="true" aria-label={t("paginationPrevious")} className={navBtnDisabled}>
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
          )}

          {pages.map((p, i) =>
            p === "..." ? (
              <span
                key={`ellipsis-${i}`}
                className="flex size-8 select-none items-center justify-center text-sm text-muted-foreground"
              >
                ...
              </span>
            ) : (
              <Link
                key={p}
                href={buildHref(p, pageSize)}
                aria-label={t("paginationPage", { page: p })}
                aria-current={p === currentPage ? "page" : undefined}
                className={p === currentPage ? pageBtnActive : pageBtn}
              >
                {p}
              </Link>
            )
          )}

          {currentPage < totalPages ? (
            <Link href={buildHref(currentPage + 1, pageSize)} aria-label={t("paginationNext")} className={navBtn}>
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          ) : (
            <button disabled aria-disabled="true" aria-label={t("paginationNext")} className={navBtnDisabled}>
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          )}

          {currentPage < totalPages ? (
            <Link href={buildHref(totalPages, pageSize)} aria-label={t("paginationLast")} className={navBtn}>
              <ChevronsRight className="size-4" aria-hidden="true" />
            </Link>
          ) : (
            <button disabled aria-disabled="true" aria-label={t("paginationLast")} className={navBtnDisabled}>
              <ChevronsRight className="size-4" aria-hidden="true" />
            </button>
          )}
        </nav>
      )}
    </div>
  );
}
