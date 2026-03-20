import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  buildHref: (page: number) => string;
}

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

export function PaginationControls({
  currentPage,
  totalPages,
  buildHref,
}: PaginationControlsProps) {
  if (totalPages <= 1) return null;

  const pages = getPageNumbers(currentPage, totalPages);

  return (
    <div className="flex items-center justify-center gap-1 mt-4">
      {/* First */}
      {currentPage > 1 ? (
        <Link
          href={buildHref(1)}
          aria-label="First page"
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-8")}
        >
          <ChevronsLeft className="size-4" aria-hidden="true" />
        </Link>
      ) : (
        <span
          aria-hidden="true"
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-8 pointer-events-none opacity-40")}
        >
          <ChevronsLeft className="size-4" />
        </span>
      )}

      {/* Prev */}
      {currentPage > 1 ? (
        <Link
          href={buildHref(currentPage - 1)}
          aria-label="Previous page"
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-8")}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Link>
      ) : (
        <span
          aria-hidden="true"
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-8 pointer-events-none opacity-40")}
        >
          <ChevronLeft className="size-4" />
        </span>
      )}

      {/* Page numbers */}
      {pages.map((p, i) =>
        p === "..." ? (
          <span
            key={`ellipsis-${i}`}
            className="flex size-8 items-center justify-center text-sm text-muted-foreground select-none"
          >
            ...
          </span>
        ) : (
          <Link
            key={p}
            href={buildHref(p)}
            aria-label={`Page ${p}`}
            aria-current={p === currentPage ? "page" : undefined}
            className={cn(
              buttonVariants({ variant: p === currentPage ? "default" : "ghost", size: "icon" }),
              "size-8 text-xs"
            )}
          >
            {p}
          </Link>
        )
      )}

      {/* Next */}
      {currentPage < totalPages ? (
        <Link
          href={buildHref(currentPage + 1)}
          aria-label="Next page"
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-8")}
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      ) : (
        <span
          aria-hidden="true"
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-8 pointer-events-none opacity-40")}
        >
          <ChevronRight className="size-4" />
        </span>
      )}

      {/* Last */}
      {currentPage < totalPages ? (
        <Link
          href={buildHref(totalPages)}
          aria-label="Last page"
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-8")}
        >
          <ChevronsRight className="size-4" aria-hidden="true" />
        </Link>
      ) : (
        <span
          aria-hidden="true"
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-8 pointer-events-none opacity-40")}
        >
          <ChevronsRight className="size-4" />
        </span>
      )}
    </div>
  );
}
