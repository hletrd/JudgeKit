import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PaginationControls } from "@/components/pagination-controls";

// Mock next/link — render as a plain anchor so href is testable
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

// Mock lucide-react icons as minimal svgs
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

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

const buildHref = (page: number) => `/submissions?page=${page}`;

describe("PaginationControls", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when totalPages is 1", () => {
    const { container } = render(
      <PaginationControls currentPage={1} totalPages={1} buildHref={buildHref} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("returns null when totalPages is 0", () => {
    const { container } = render(
      <PaginationControls currentPage={1} totalPages={0} buildHref={buildHref} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders page number links for small total (5 pages)", () => {
    render(<PaginationControls currentPage={1} totalPages={5} buildHref={buildHref} />);
    for (let i = 1; i <= 5; i++) {
      expect(screen.getByRole("link", { name: `Page ${i}` })).toBeInTheDocument();
    }
  });

  it("marks current page with aria-current=page", () => {
    render(<PaginationControls currentPage={3} totalPages={5} buildHref={buildHref} />);
    const currentLink = screen.getByRole("link", { name: "Page 3" });
    expect(currentLink).toHaveAttribute("aria-current", "page");
  });

  it("other pages do not have aria-current set", () => {
    render(<PaginationControls currentPage={3} totalPages={5} buildHref={buildHref} />);
    const page2Link = screen.getByRole("link", { name: "Page 2" });
    expect(page2Link).not.toHaveAttribute("aria-current");
  });

  it("renders first/prev as disabled spans on page 1", () => {
    render(<PaginationControls currentPage={1} totalPages={5} buildHref={buildHref} />);
    // On page 1, first and prev are spans (not links)
    expect(screen.queryByRole("link", { name: "First page" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Previous page" })).not.toBeInTheDocument();
  });

  it("renders next/last as links on page 1", () => {
    render(<PaginationControls currentPage={1} totalPages={5} buildHref={buildHref} />);
    expect(screen.getByRole("link", { name: "Next page" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Last page" })).toBeInTheDocument();
  });

  it("renders next/last as disabled spans on last page", () => {
    render(<PaginationControls currentPage={5} totalPages={5} buildHref={buildHref} />);
    expect(screen.queryByRole("link", { name: "Next page" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Last page" })).not.toBeInTheDocument();
  });

  it("renders first/prev as links on last page", () => {
    render(<PaginationControls currentPage={5} totalPages={5} buildHref={buildHref} />);
    expect(screen.getByRole("link", { name: "First page" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Previous page" })).toBeInTheDocument();
  });

  it("shows ellipsis for large page counts (20 pages, current=10)", () => {
    render(<PaginationControls currentPage={10} totalPages={20} buildHref={buildHref} />);
    // Ellipsis spans contain "..."
    const ellipsisItems = screen.getAllByText("...");
    expect(ellipsisItems.length).toBeGreaterThanOrEqual(1);
  });

  it("first page link has correct href", () => {
    render(<PaginationControls currentPage={3} totalPages={5} buildHref={buildHref} />);
    const firstLink = screen.getByRole("link", { name: "First page" });
    expect(firstLink).toHaveAttribute("href", "/submissions?page=1");
  });

  it("next page link has correct href", () => {
    render(<PaginationControls currentPage={3} totalPages={5} buildHref={buildHref} />);
    const nextLink = screen.getByRole("link", { name: "Next page" });
    expect(nextLink).toHaveAttribute("href", "/submissions?page=4");
  });

  it("previous page link has correct href", () => {
    render(<PaginationControls currentPage={3} totalPages={5} buildHref={buildHref} />);
    const prevLink = screen.getByRole("link", { name: "Previous page" });
    expect(prevLink).toHaveAttribute("href", "/submissions?page=2");
  });

  it("last page link has correct href", () => {
    render(<PaginationControls currentPage={3} totalPages={5} buildHref={buildHref} />);
    const lastLink = screen.getByRole("link", { name: "Last page" });
    expect(lastLink).toHaveAttribute("href", "/submissions?page=5");
  });
});
