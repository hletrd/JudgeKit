import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StudentDashboard } from "@/app/(public)/dashboard/_components/student-dashboard";

const { dbSelectMock, getResolvedSystemSettingsMock } = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
  getResolvedSystemSettingsMock: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTranslations: async (namespace: string) => (key: string) => {
    const messages: Record<string, Record<string, string>> = {
      dashboard: {
        progressTitle: "Progress",
        solvedProblems: "Solved problems",
        acceptanceRate: "Acceptance rate",
        totalSubmissions: "Total submissions",
        topLanguages: "Top languages",
        myGroups: "My groups",
        recentSubmissions: "Recent submissions",
        noRecentSubmissions: "No recent submissions",
        viewSubmission: "View submission",
      },
      common: {
        appName: "JudgeKit",
        appDescription: "Online judge",
        unknown: "Unknown",
        viewAll: "View all",
      },
    };

    return messages[namespace]?.[key] ?? key;
  },
}));

vi.mock("@/lib/db", () => ({
  db: { select: dbSelectMock },
}));

vi.mock("@/lib/db-time", () => ({
  getDbNowUncached: vi.fn(async () => new Date()),
  getDbNow: vi.fn(async () => new Date()),
}));

vi.mock("@/lib/system-settings", () => ({
  getResolvedSystemSettings: getResolvedSystemSettingsMock,
}));

vi.mock("@/components/submission-status-badge", () => ({
  SubmissionStatusBadge: ({ label }: { label: string }) => <div>{label}</div>,
}));

function mockSelectQueue(...results: unknown[][]) {
  dbSelectMock.mockImplementation(() => {
    const result = results.shift() ?? [];
    const promise = Promise.resolve(result);
    const chain = {
      from: () => chain,
      where: () => chain,
      leftJoin: () => chain,
      innerJoin: () => chain,
      groupBy: () => chain,
      orderBy: () => chain,
      limit: () => promise,
      then: promise.then.bind(promise),
      catch: promise.catch.bind(promise),
      finally: promise.finally.bind(promise),
    };
    return chain;
  });
}

describe("StudentDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getResolvedSystemSettingsMock.mockResolvedValue({
      siteTitle: "JudgeKit",
      siteDescription: "Online judge",
      timeZone: "UTC",
    });
  });

  it("removes assignment summary sections and keeps recent submissions", async () => {
    mockSelectQueue(
      [{ totalSubmissions: 10, acceptedSubmissions: 7, solvedProblems: 4, attemptedProblems: 5 }],
      [{ language: "python", count: 8 }],
      [{
        id: "submission-1",
        status: "accepted",
        submittedAt: new Date("2026-04-16T00:00:00Z"),
        problem: { id: "problem-1", title: "A + B" },
      }],
      [{ count: 2 }],
    );

    render(await StudentDashboard({ userId: "student-1" }));

    expect(screen.getByText("Progress")).toBeInTheDocument();
    expect(screen.getByText("My groups")).toBeInTheDocument();
    expect(screen.getByText("Recent submissions")).toBeInTheDocument();
    expect(screen.getByText("A + B")).toBeInTheDocument();

    expect(screen.queryByText("Open assignments")).not.toBeInTheDocument();
    expect(screen.queryByText("Completed assignments")).not.toBeInTheDocument();
    expect(screen.queryByText("Upcoming deadlines")).not.toBeInTheDocument();
  });
});
