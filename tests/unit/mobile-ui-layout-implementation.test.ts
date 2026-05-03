import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("mobile UI layout implementation", () => {
  it("uses a collapsible mobile public header with truncated site title", () => {
    const source = read("src/components/layout/public-header.tsx");

    expect(source).toContain("toggleNavigationMenu");
    expect(source).toContain("aria-controls={menuId}");
    expect(source).toContain("block truncate");
    // Commit 37a4a8c3 widened the mobile-menu range from md to lg so the
    // tablet breakpoint shows the hamburger instead of the cramped inline
    // nav. Keep this assertion in sync with public-header.tsx.
    expect(source).toContain('lg:hidden');
  });

  it("wraps public footer links instead of forcing a single mobile row", () => {
    const source = read("src/components/layout/public-footer.tsx");

    expect(source).toContain("flex-wrap");
    expect(source).toContain("justify-center");
    expect(source).toContain("break-words");
  });

  it("uses flex column public shells so the footer stays pinned to the bottom on short pages", () => {
    const publicLayout = read("src/app/(public)/layout.tsx");
    const homePage = read("src/app/page.tsx");
    const notFoundPage = read("src/app/not-found.tsx");

    expect(publicLayout).toContain("min-h-dvh");

    expect(homePage).toContain("min-h-dvh");

    expect(notFoundPage).toContain("min-h-dvh");
  });

  it("renders mobile card layouts for admin users, languages, and workers", () => {
    const usersPage = read("src/app/(dashboard)/dashboard/admin/users/page.tsx");
    const languagesTable = read("src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx");
    const workersClient = read("src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx");

    expect(usersPage).toContain("overflow-x-auto");

    expect(languagesTable).toContain("rounded-md border");

    expect(workersClient).toContain("grid gap-4 md:grid-cols-4");
  });
});
