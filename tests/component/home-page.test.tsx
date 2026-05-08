import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "@/app/page";

const { authMock, getResolvedSystemSettingsMock, getHomepageInsightsMock, getJudgeSystemSnapshotMock, publicHeaderPropsMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  getResolvedSystemSettingsMock: vi.fn(),
  getHomepageInsightsMock: vi.fn(),
  getJudgeSystemSnapshotMock: vi.fn(),
  publicHeaderPropsMock: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTranslations: async (namespace: string) => (key: string) => {
    const translations: Record<string, Record<string, string>> = {
      common: {
        appName: "JudgeKit",
        appDescription: "Online judge",
      },
      auth: {
        signIn: "Sign in",
        signUp: "Sign up",
      },
      publicShell: {
        "nav.practice": "Practice",
        "nav.playground": "Playground",
        "nav.contests": "Contests",
        "nav.community": "Community",
        "nav.rankings": "Rankings",
        "nav.submissions": "Submissions",
        "nav.languages": "Languages",
        "nav.dashboard": "Dashboard",
        "home.eyebrow": "Online judge platform",
        "home.title": "Write code. Submit. Get judged.",
        "home.description": "Practice, contest, and coursework platform",
        "home.primaryCta": "Open workspace",
        "home.secondaryCta": "Sign in",
        "home.cards.practice.title": "Practice",
        "home.cards.practice.description": "Solve problems",
        "home.cards.playground.title": "Playground",
        "home.cards.playground.description": "Run code",
        "home.cards.contests.title": "Contests",
        "home.cards.contests.description": "Join contests",
        "home.cards.community.title": "Community",
        "home.cards.community.description": "Discuss",
        "home.insights.problems.label": "Public problems",
        "home.insights.problems.description": "Problem insight",
        "home.insights.submissions.label": "Total submissions",
        "home.insights.submissions.description": "Submission insight",
        "home.insights.languages.label": "Supported languages",
        "home.insights.languages.description": "Language insight",
        "home.judgeInfo.title": "Judge System",
        "home.judgeInfo.description": "Judge description",
        "home.judgeInfo.enabledLanguages": "Enabled languages",
        "home.judgeInfo.onlineWorkers": "Workers online",
        "home.judgeInfo.parallelSlots": "Parallel slots",
        "home.judgeInfo.viewDetails": "View judge environments",
      },
    };

    return translations[namespace]?.[key] ?? key;
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/capabilities/cache", () => ({
  resolveCapabilities: vi.fn().mockResolvedValue(new Set()),
}));

vi.mock("@/lib/system-settings", () => ({
  getResolvedSystemSettings: getResolvedSystemSettingsMock,
}));

vi.mock("@/lib/homepage-insights", () => ({
  getHomepageInsights: getHomepageInsightsMock,
}));

vi.mock("@/lib/judge/dashboard-data", () => ({
  getJudgeSystemSnapshot: getJudgeSystemSnapshotMock,
}));

vi.mock("@/components/layout/public-header", () => ({
  PublicHeader: (props: { children?: ReactNode; items: Array<{ label: string }>; actions: Array<{ label: string }>; loggedInUser?: { label: string } | null }) => {
    publicHeaderPropsMock(props);
    return <div>{props.children ?? "public-header"}</div>;
  },
}));

vi.mock("@/components/layout/public-footer", () => ({
  PublicFooter: () => <div>public-footer</div>,
}));

vi.mock("@/components/layout/skip-to-content", () => ({
  SkipToContent: () => <div>skip-to-content</div>,
}));

vi.mock("@/components/seo/json-ld", () => ({
  JsonLd: () => null,
}));

vi.mock("@/app/(public)/_components/public-home-page", () => ({
  PublicHomePage: ({ primaryCta, secondaryCta, insights }: { primaryCta: { label: string }; secondaryCta?: { label: string } | null; insights: Array<{ label: string; value: string }> }) => (
    <div>
      <div>{primaryCta.label}</div>
      {secondaryCta ? <div>{secondaryCta.label}</div> : null}
      {insights.map((insight) => (
        <div key={insight.label}>{`${insight.label}: ${insight.value}`}</div>
      ))}
    </div>
  ),
}));

describe("HomePage hero CTAs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getResolvedSystemSettingsMock.mockResolvedValue({
      siteTitle: "JudgeKit",
      siteDescription: "Online judge",
      homePageContent: null,
      publicSignupEnabled: false,
    });
    getHomepageInsightsMock.mockResolvedValue({
      publicProblemCount: 1024,
      totalSubmissionCount: 9876,
      enabledLanguageCount: 120,
    });
    getJudgeSystemSnapshotMock.mockResolvedValue({
      onlineWorkerCount: 2,
      activeJudgeTasks: 0,
      totalWorkerCapacity: 8,
      architectureSummary: "x86_64",
      allLanguages: [],
      featuredEnvironments: [],
      additionalLanguageCount: 0,
    });
  });

  it("hides the sign-in hero CTA for logged-in users", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", name: "User" } });

    render(await HomePage());

    expect(screen.getByText("Open workspace")).toBeInTheDocument();
    expect(screen.queryByText("Sign in")).not.toBeInTheDocument();
    expect(screen.getByText("Public problems: 1,024")).toBeInTheDocument();
    expect(screen.getByText("Total submissions: 9,876")).toBeInTheDocument();
    expect(screen.getByText("Supported languages: 120")).toBeInTheDocument();
    const props = publicHeaderPropsMock.mock.calls.at(-1)?.[0];
    expect(props?.loggedInUser?.label).toBe("Dashboard");
    // "Languages" was moved from the header nav to the footer; verify the remaining items
    expect(props?.items.map((item: { label: string }) => item.label)).toContain("Community");
  });

  it("shows the sign-in hero CTA for guests", async () => {
    authMock.mockResolvedValue(null);

    render(await HomePage());

    expect(screen.getByText("Open workspace")).toBeInTheDocument();
    expect(screen.getByText("Sign in")).toBeInTheDocument();
    const props = publicHeaderPropsMock.mock.calls.at(-1)?.[0];
    expect(props?.actions[0]?.label).toBe("Sign in");
  });
});
