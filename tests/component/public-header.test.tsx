import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { PublicHeader } from "@/components/layout/public-header";

vi.mock("next-intl", () => ({
  useLocale: () => "ko",
  useTranslations: () => (key: string) => key,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/practice",
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock("@/components/layout/theme-toggle", () => ({
  ThemeToggle: () => <div>theme-toggle</div>,
}));

vi.mock("@/components/layout/locale-switcher", () => ({
  LocaleSwitcher: () => <div>locale-switcher</div>,
}));

describe("PublicHeader", () => {
  it("renders public nav items and actions", () => {
    const { container } = render(
      <PublicHeader
        siteTitle="JudgeKit"
        items={[
          { href: "/practice", label: "Practice" },
          { href: "/community", label: "Community" },
        ]}
        actions={[
          { href: "/workspace", label: "Workspace" },
          { href: "/login", label: "Sign in" },
        ]}
      />
    );

    expect(screen.getByText("JudgeKit")).toBeInTheDocument();
    expect(screen.getByText("Practice")).toBeInTheDocument();
    expect(screen.getByText("Community")).toBeInTheDocument();
    expect(screen.getAllByText("Workspace").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Sign in").length).toBeGreaterThan(0);
    expect(screen.getAllByText("theme-toggle").length).toBeGreaterThan(0);
    expect(screen.getAllByText("locale-switcher").length).toBeGreaterThan(0);
    expect(container.querySelector('a[href="/?locale=ko"]')).toBeTruthy();
    expect(container.querySelector('a[href="/practice?locale=ko"]')).toBeTruthy();
    expect(container.querySelector('a[href="/login?locale=ko"]')).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "mainNavigation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "toggleNavigationMenu" })).toBeInTheDocument();
  });
});
