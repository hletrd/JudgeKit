import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PaginationControls } from "@/components/pagination-controls";

vi.mock("next/link", () => ({
  default: ({ href, children, className, "aria-label": ariaLabel, "aria-current": ariaCurrent }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    "aria-label"?: string;
    "aria-current"?: "page" | "true" | "false" | boolean;
  }) => (
    <a href={href} className={className} aria-label={ariaLabel} aria-current={ariaCurrent as "page" | "true" | "false" | boolean | undefined}>
      {children}
    </a>
  ),
}));

vi.mock("lucide-react", () => ({
  ChevronLeft: ({ className }: { className?: string }) => (
    <svg data-testid="icon-chevron-left" className={className} aria-hidden="true" />
  ),
  ChevronRight: ({ className }: { className?: string }) => (
    <svg data-testid="icon-chevron-right" className={className} aria-hidden="true" />
  ),
  ChevronsLeft: ({ className }: { className?: string }) => (
    <svg data-testid="icon-chevrons-left" className={className} aria-hidden="true" />
  ),
  ChevronsRight: ({ className }: { className?: string }) => (
    <svg data-testid="icon-chevrons-right" className={className} aria-hidden="true" />
  ),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string, values?: { page?: number; size?: number }) => {
    switch (key) {
      case "paginationNav":
        return "Pagination";
      case "paginationFirst":
        return "First page";
      case "paginationPrevious":
        return "Previous page";
      case "paginationNext":
        return "Next page";
      case "paginationLast":
        return "Last page";
      case "paginationPage":
        return `Page ${values?.page ?? ""}`;
      case "paginationPageSize":
        return "Page size";
      case "paginationPageSizeOption":
        return `Show ${values?.size ?? ""} items per page`;
      default:
        return key;
    }
  },
}));

const buildHref = (page: number, pageSize: number) => {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (pageSize !== 50) params.set("pageSize", String(pageSize));
  const qs = params.toString();
  return qs ? `/submissions?${qs}` : "/submissions";
};

async function renderPagination(currentPage: number, totalPages: number, pageSize = 50) {
  render(await PaginationControls({ currentPage, totalPages, pageSize, buildHref }));
}

describe("PaginationControls", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders page size controls even when only one page exists", async () => {
    await renderPagination(1, 1);

    expect(screen.getByText("Page size")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Show 10 items per page" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Pagination" })).not.toBeInTheDocument();
  });

  it("renders page size controls even when there are zero results", async () => {
    await renderPagination(1, 0);

    expect(screen.getByText("Page size")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Show 100 items per page" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Pagination" })).not.toBeInTheDocument();
  });

  it("renders page number links for small total (5 pages)", async () => {
    await renderPagination(1, 5);
    for (let i = 1; i <= 5; i++) {
      expect(screen.getByRole("link", { name: `Page ${i}` })).toBeInTheDocument();
    }
  });

  it("marks current page with aria-current=page", async () => {
    await renderPagination(3, 5);
    const currentLink = screen.getByRole("link", { name: "Page 3" });
    expect(currentLink).toHaveAttribute("aria-current", "page");
  });

  it("marks current page size with aria-current=page", async () => {
    await renderPagination(1, 5, 20);
    expect(screen.getByRole("link", { name: "Show 20 items per page" })).toHaveAttribute("aria-current", "page");
  });

  it("renders first/prev as disabled buttons on page 1", async () => {
    await renderPagination(1, 5);
    expect(screen.queryByRole("link", { name: "First page" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Previous page" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "First page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
  });

  it("renders next/last as links on page 1", async () => {
    await renderPagination(1, 5);
    expect(screen.getByRole("link", { name: "Next page" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Last page" })).toBeInTheDocument();
  });

  it("renders next/last as disabled buttons on last page", async () => {
    await renderPagination(5, 5);
    expect(screen.queryByRole("link", { name: "Next page" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Last page" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Last page" })).toBeDisabled();
  });

  it("shows ellipsis for large page counts (20 pages, current=10)", async () => {
    await renderPagination(10, 20);
    const ellipsisItems = screen.getAllByText("...");
    expect(ellipsisItems.length).toBeGreaterThanOrEqual(1);
  });

  it("page size links reset to the first page when changing size", async () => {
    await renderPagination(3, 5, 50);
    expect(screen.getByRole("link", { name: "Show 10 items per page" })).toHaveAttribute("href", "/submissions?pageSize=10");
    expect(screen.getByRole("link", { name: "Show 50 items per page" })).toHaveAttribute("href", "/submissions");
  });

  it("page navigation links preserve the selected page size", async () => {
    await renderPagination(3, 5, 20);
    expect(screen.getByRole("link", { name: "First page" })).toHaveAttribute("href", "/submissions?pageSize=20");
    expect(screen.getByRole("link", { name: "Previous page" })).toHaveAttribute("href", "/submissions?page=2&pageSize=20");
    expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute("href", "/submissions?page=4&pageSize=20");
    expect(screen.getByRole("link", { name: "Last page" })).toHaveAttribute("href", "/submissions?page=5&pageSize=20");
  });
});
