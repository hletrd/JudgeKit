import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ConditionalHeader } from "@/components/layout/conditional-header";

const { usePathnameMock } = vi.hoisted(() => ({
  usePathnameMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: usePathnameMock,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

vi.mock("@/components/layout/public-header", () => ({
  PublicHeader: ({ siteTitle }: { siteTitle: string }) => (
    <header data-testid="public-header">{siteTitle}</header>
  ),
}));

vi.mock("@/components/ui/sidebar", () => ({
  SidebarTrigger: () => <button data-testid="sidebar-trigger" />,
}));

const DEFAULT_PROPS = {
  siteTitle: "JudgeKit",
  items: [{ href: "/contests", label: "Contests" }],
  actions: [{ href: "/login", label: "Login" }],
};

describe("ConditionalHeader", () => {
  it("renders minimal header with SidebarTrigger on admin dashboard pages", () => {
    usePathnameMock.mockReturnValue("/dashboard/admin/settings");

    render(<ConditionalHeader {...DEFAULT_PROPS} />);

    expect(screen.getByTestId("sidebar-trigger")).toBeDefined();
    expect(screen.queryByTestId("public-header")).toBeNull();
  });

  it("renders full PublicHeader on non-admin dashboard pages", () => {
    usePathnameMock.mockReturnValue("/dashboard/contests");

    render(<ConditionalHeader {...DEFAULT_PROPS} />);

    expect(screen.getByTestId("public-header")).toBeDefined();
    expect(screen.getByText("JudgeKit")).toBeDefined();
  });

  it("renders full PublicHeader on root dashboard page", () => {
    usePathnameMock.mockReturnValue("/dashboard");

    render(<ConditionalHeader {...DEFAULT_PROPS} />);

    expect(screen.getByTestId("public-header")).toBeDefined();
  });

  it("renders full PublicHeader on public pages", () => {
    usePathnameMock.mockReturnValue("/contests");

    render(<ConditionalHeader {...DEFAULT_PROPS} />);

    expect(screen.getByTestId("public-header")).toBeDefined();
  });
});
