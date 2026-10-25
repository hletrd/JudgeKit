import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProblemDescription } from "@/components/problem-description";
import { StructuredProblemStatement } from "@/components/problem/structured-problem-statement";
import { AiSignatureBadge } from "@/components/submissions/ai-signature-badge";
import { LeaderboardTable } from "@/components/contest/leaderboard-table";

const apiFetchMock = vi.fn();
let pollingCallback: (() => void) | null = null;

vi.mock("@/components/code/copy-code-button", () => ({
  CopyCodeButton: ({ value }: { value: string }) => (
    <button data-testid="copy-code-button" data-value={value} type="button">
      Copy code
    </button>
  ),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join("|")}` : key,
  useLocale: () => "ko",
}));

vi.mock("@/hooks/use-visibility-polling", () => ({
  useVisibilityPolling: (cb: () => void) => {
    pollingCallback = cb;
  },
}));

vi.mock("@/lib/api/client", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  apiFetchJson: async (input: unknown, init: unknown) => {
    const res = await apiFetchMock(input, init);
    return { ok: res.ok, data: await res.json() };
  },
}));

describe("signature markers in the rendered statement", () => {
  it("removes the marker from markdown, including code blocks, and keeps hidden notes", () => {
    const { container } = render(
      <ProblemDescription
        description={[
          "### 문제",
          "",
          "두 수의 합.{{hidden: 주석 // sr5j 를 넣는다.}}{{signature: sr5j}}",
          "",
          "```cpp",
          "int main() {} // {{signature: sr5j}}",
          "```",
          "",
          "인라인 `{{signature: sr5j}}` 끝",
        ].join("\n")}
      />,
    );

    expect(container.innerHTML).not.toContain("{{signature");
    expect(container.innerHTML).not.toContain("signature:");
    // The hidden note (which may mention the token) still renders; only the
    // signature marker itself is gone.
    expect(container.querySelector("span.problem-hidden-note")?.textContent).toBe("주석 // sr5j 를 넣는다.");
    const copyButtons = screen.getAllByTestId("copy-code-button");
    expect(copyButtons.every((button) => !button.getAttribute("data-value")?.includes("signature"))).toBe(true);
  });

  it("removes the marker from legacy HTML descriptions", () => {
    const { container } = render(
      <ProblemDescription description={"<p>두 수의 합{{signature: zz11}}</p><pre>x {{signature: zz11}}</pre>"} />,
    );
    expect(container.innerHTML).not.toContain("zz11");
    expect(container.textContent).toContain("두 수의 합");
  });

  it("removes the marker from the structured statement", () => {
    const { container } = render(
      <StructuredProblemStatement description={"## 문제\n두 수의 합{{signature: qq42}}\n## 입력\na b"} />,
    );
    expect(container.innerHTML).not.toContain("qq42");
  });
});

describe("AiSignatureBadge", () => {
  it("labels the badge and lists each token with its problem", () => {
    render(
      <AiSignatureBadge
        matches={[
          { token: "sr5j", problemId: "p1", problemTitle: "합" },
          { token: "tk9q", problemId: "p2", problemTitle: null },
        ]}
      />,
    );
    const badge = screen.getByTestId("ai-signature-badge");
    expect(badge.textContent).toContain("badge");
    expect(badge.getAttribute("aria-label")).toContain("match:sr5j|합");
    expect(badge.getAttribute("aria-label")).toContain("match:tk9q|unknownProblem");
  });

  it("renders nothing without matches", () => {
    const { container } = render(<AiSignatureBadge matches={[]} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("LeaderboardTable AI signature flags", () => {
  const baseData = {
    scoringModel: "ioi",
    frozen: false,
    frozenAt: null,
    startsAt: null,
    problems: [
      { problemId: "p1", title: "A", points: 100, sortOrder: 0 },
      { problemId: "p2", title: "B", points: 100, sortOrder: 1 },
    ],
    entries: [
      {
        userId: "u1",
        username: "alice",
        name: "Alice",
        className: null,
        rank: 1,
        totalScore: 150,
        totalPenalty: 0,
        problems: [
          { problemId: "p1", score: 100, attempts: 2, solved: true, firstAcAt: null, penalty: 0 },
          { problemId: "p2", score: 50, attempts: 1, solved: false, firstAcAt: null, penalty: 0 },
        ],
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    pollingCallback = null;
  });

  async function renderWith(data: unknown, props: { showAiSignatureFlags?: boolean } = {}) {
    apiFetchMock.mockResolvedValue({ ok: true, json: async () => ({ data }) });
    render(<LeaderboardTable assignmentId="a1" canViewStudentDetails {...props} />);
    await act(async () => {
      pollingCallback?.();
    });
    await waitFor(() => expect(screen.getByText("Alice")).toBeTruthy());
  }

  it("requests flags and marks the student row and the flagged problem cell for managers", async () => {
    await renderWith(
      { ...baseData, aiSignatureFlags: { u1: { total: 2, problems: { p2: 2 } } } },
      { showAiSignatureFlags: true },
    );
    expect(apiFetchMock.mock.calls[0][0]).toBe("/api/v1/contests/a1/leaderboard?aiFlags=1");
    expect(screen.getByTestId("leaderboard-ai-flag-count").textContent).toContain("aiSuspectedCount:2");
    const cells = screen.getAllByTestId("leaderboard-ai-flag-cell");
    expect(cells).toHaveLength(1);
    expect(cells[0].closest("td")?.textContent).toContain("50");
  });

  it("shows nothing and does not ask for flags on the student view", async () => {
    await renderWith(baseData);
    expect(apiFetchMock.mock.calls[0][0]).toBe("/api/v1/contests/a1/leaderboard");
    expect(screen.queryByTestId("leaderboard-ai-flag-count")).toBeNull();
    expect(screen.queryByTestId("leaderboard-ai-flag-cell")).toBeNull();
  });
});
