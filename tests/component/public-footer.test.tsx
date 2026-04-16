import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { PublicFooter } from "@/components/layout/public-footer";

vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTranslations: async (namespace: string) => (key: string) => {
    const translations: Record<string, Record<string, string>> = {
      common: {
        footerNavigation: "Footer navigation",
      },
    };

    return translations[namespace]?.[key] ?? key;
  },
}));

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

describe("PublicFooter", () => {
  it("wraps footer links for small screens", async () => {
    const view = await PublicFooter({
      siteTitle: "JudgeKit",
      footerContent: {
        en: {
          copyrightText: "© 2026 JudgeKit",
          links: [
            { label: "Docs", url: "/docs" },
            { label: "Status", url: "/status" },
            { label: "Privacy", url: "/privacy" },
          ],
        },
      },
    });

    const { container } = render(view);

    expect(screen.getByText("© 2026 JudgeKit")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Docs" })).toHaveAttribute("href", "/docs");
    expect(screen.getByRole("navigation", { name: "Footer navigation" })).toBeInTheDocument();
    expect(container.querySelector("nav")?.className).toContain("flex-wrap");
    expect(container.querySelector("nav")?.className).toContain("justify-center");
  });

  it("renders a fallback copyright when footer content is missing", async () => {
    const view = await PublicFooter({
      siteTitle: "JudgeKit",
      footerContent: null,
    });

    render(view);

    expect(screen.getByText(/JudgeKit/)).toBeInTheDocument();
  });
});
