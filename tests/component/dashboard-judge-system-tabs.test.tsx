import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { DashboardJudgeSystemTabs } from "@/app/(public)/dashboard/_components/dashboard-judge-system-tabs";

vi.mock("next/link", () => ({
  default: ({ href, children, asChild: _asChild, ...props }: { href: string; children: ReactNode; asChild?: boolean } & Record<string, unknown>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("next-intl", () => ({
  useLocale: () => "en",
}));

describe("DashboardJudgeSystemTabs", () => {
  it("renders the judge overview by default and switches to featured languages", async () => {
    const user = userEvent.setup();

    render(
      <DashboardJudgeSystemTabs
        sectionTitle="Judge system snapshot"
        sectionDescription="Check current worker capacity and major language environments."
        overviewTabLabel="Judge runtime overview"
        languagesTabLabel="Supported languages"
        statusCards={[
          { label: "Online workers", value: "3", description: "Architectures: amd64, arm64" },
          { label: "Worker capacity", value: "12", description: "Total concurrent judging slots." },
        ]}
        featuredEnvironmentsTitle="Featured language environments"
        featuredEnvironmentsDescription="The dashboard highlights the most commonly used language families first."
        featuredEnvironments={[
          {
            key: "c",
            title: "C",
            runtime: "Alpine / GCC",
            compiler: "GCC (gcc)",
            variants: ["C (C23)", "C (C17)"],
            variantCountLabel: "2 active variants",
          },
          {
            key: "python",
            title: "Python",
            runtime: "Alpine / CPython",
            compiler: "CPython 3.14",
            variants: ["Python"],
            variantCountLabel: "1 active variant",
          },
        ]}
        additionalLanguagesMessage="5 more enabled languages are available on the full catalog page."
        noFeaturedLanguagesMessage="No enabled languages are currently available."
        viewAllLanguagesHref="/languages"
        viewAllLanguagesLabel="View all languages"
      />
    );

    expect(screen.getByText("Judge system snapshot")).toBeInTheDocument();
    expect(screen.getByText("Online workers")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Supported languages" }));

    expect(screen.getByText("Featured language environments")).toBeInTheDocument();
    expect(screen.getByText("C")).toBeInTheDocument();
    expect(screen.getAllByText("Python").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "View all languages" })).toHaveAttribute("href", "/languages");
    expect(screen.getByText("5 more enabled languages are available on the full catalog page.")).toBeInTheDocument();
  });
});
