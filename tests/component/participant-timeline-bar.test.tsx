import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ParticipantTimeline } from "@/lib/assignments/participant-timeline";

// next-intl's `useTranslations` requires a client context that isn't present
// in raw jsdom renders. The bar component itself does not call next-intl
// directly (translations are passed via the `translations` bag), but it
// renders `SubmissionStatusBadge` which does. Stub the badge to a tiny
// presentational element so the test stays focused on the bar's surface.
vi.mock("@/components/submission-status-badge", () => ({
  SubmissionStatusBadge: ({ status, label }: { status: string; label?: string }) => (
    <span data-testid="submission-status-badge" data-status={status}>
      {label ?? status}
    </span>
  ),
}));

const { ParticipantTimelineBar } = await import("@/components/contest/participant-timeline-bar");

const baseTranslations = {
  noSubmissions: "No submissions",
  firstAccepted: "First AC!",
  codeSnapshot: (chars: number) => `Snapshot (${chars} chars)`,
  attempts: (count: number) => `${count} attempts`,
  tries: (count: number) => `${count} tries`,
  best: (score: string | number) => `best: ${score}`,
  axisStart: "0m",
  scoreLabel: (score: string) => `Score: ${score}`,
  durationLong: (h: number, m: number, s: number) => `${h}h ${m}m ${s}s`,
  durationShort: (m: number, s: number) => `${m}m ${s}s`,
  snapshotMarkerLabel: (title: string, when: string) =>
    `${title} — code snapshot — ${when}`,
};

const koTranslations = {
  ...baseTranslations,
  axisStart: "0분",
  scoreLabel: (score: string) => `점수: ${score}`,
  durationLong: (h: number, m: number, s: number) => `${h}시간 ${m}분 ${s}초`,
  durationShort: (m: number, s: number) => `${m}분 ${s}초`,
  snapshotMarkerLabel: (title: string, when: string) =>
    `${title} — 코드 스냅샷 — ${when}`,
};

const start = new Date("2026-01-01T10:00:00.000Z");
const tSubmit = new Date(start.getTime() + 5 * 60_000); // +5m
const tSnap = new Date(start.getTime() + 7 * 60_000); // +7m
const tAc = new Date(start.getTime() + 10 * 60_000); // +10m

const participant: ParticipantTimeline["participant"] = {
  userId: "u1",
  username: "tester",
  name: "Tester",
  className: null,
  examStartedAt: start,
  personalDeadline: new Date(start.getTime() + 60 * 60_000), // +1h
  contestAccessAt: null,
};

const assignmentProblems = [
  { problemId: "p1", title: "Problem A", points: 100, sortOrder: 1 },
];

function buildTimelineByProblem(): Map<string, ParticipantTimeline["problems"][number]> {
  return new Map([
    [
      "p1",
      {
        problemId: "p1",
        title: "Problem A",
        points: 100,
        sortOrder: 1,
        summary: {
          totalAttempts: 1,
          bestScore: 100,
          firstSubmissionAt: tSubmit,
          lastSubmissionAt: tSubmit,
          firstAcAt: tAc,
          timeToFirstSubmission: 300,
          timeToFirstAc: 600,
          wrongBeforeAc: 0,
          snapshotCount: 1,
        },
        timeline: [
          {
            type: "submission",
            at: tSubmit,
            submissionId: "s1",
            status: "wrong_answer",
            score: 50,
            language: "python",
            executionTimeMs: 100,
            memoryUsedKb: 1024,
          },
          {
            type: "snapshot",
            at: tSnap,
            snapshotId: "snap1",
            charCount: 250,
            language: "python",
          },
          {
            type: "first_ac",
            at: tAc,
            submissionId: "s2",
          },
        ],
      },
    ],
  ]);
}

describe("ParticipantTimelineBar", () => {
  it("renders one marker per timeline event with unique keys", () => {
    const timelineByProblem = buildTimelineByProblem();
    render(
      <ParticipantTimelineBar
        participant={participant}
        assignmentProblems={assignmentProblems}
        timelineByProblem={timelineByProblem}
        locale="en"
        timeZone="UTC"
        translations={baseTranslations}
        statusLabels={{ wrong_answer: "Wrong Answer" }}
      />
    );

    // Submission link (s1) → "/submissions/s1"
    const submissionLink = screen.getByRole("link", { name: /Problem A.*wrong_answer/i });
    expect(submissionLink).toHaveAttribute("href", "/submissions/s1");
    // first_ac link (s2)
    const firstAcLink = screen.getByRole("link", { name: /Problem A.*first_ac/i });
    expect(firstAcLink).toHaveAttribute("href", "/submissions/s2");

    // Per-problem card shows "1 tries" and "best: 100" (also appears in the
    // legend row above the bar, so use `getAllByText` rather than `getByText`).
    expect(screen.getByText("1 tries")).toBeInTheDocument();
    expect(screen.getAllByText(/best: 100/).length).toBeGreaterThan(0);
  });

  it("uses the translations bag for the axis label, score label, and duration", () => {
    const timelineByProblem = buildTimelineByProblem();
    render(
      <ParticipantTimelineBar
        participant={participant}
        assignmentProblems={assignmentProblems}
        timelineByProblem={timelineByProblem}
        locale="ko"
        timeZone="UTC"
        translations={koTranslations}
        statusLabels={{ wrong_answer: "오답" }}
      />
    );

    // Axis label sourced from translations bag
    expect(screen.getByText("0분")).toBeInTheDocument();
    // Total duration uses Korean durationLong (1h 0m 0s)
    expect(screen.getByText("1시간 0분 0초")).toBeInTheDocument();
  });

  it("does not leak English literals when rendered in Korean", () => {
    const timelineByProblem = buildTimelineByProblem();
    const { container } = render(
      <ParticipantTimelineBar
        participant={participant}
        assignmentProblems={assignmentProblems}
        timelineByProblem={timelineByProblem}
        locale="ko"
        timeZone="UTC"
        translations={koTranslations}
        statusLabels={{ wrong_answer: "오답" }}
      />
    );
    const html = container.innerHTML;
    expect(html).not.toMatch(/Score:\s/);
    // Korean axis label
    expect(html).toMatch(/0분/);
    // Korean score label (rendered in the tooltip — hidden but still in DOM)
    expect(html).toMatch(/점수:/);
  });

  it("renders a non-interactive img marker when submissionId is missing", () => {
    // Synthesize a single submission event without submissionId by typing through
    // the existing structure. The component does not normally receive such rows,
    // but defensive code must not produce a Link to '#'.
    const synth = buildTimelineByProblem();
    const problem = synth.get("p1")!;
    const broken: ParticipantTimeline["problems"][number] = {
      ...problem,
      timeline: [
        {
          type: "submission",
          at: tSubmit,
          // @ts-expect-error — intentionally simulating a missing submissionId
          submissionId: undefined,
          status: "wrong_answer",
          score: null,
          language: "python",
          executionTimeMs: null,
          memoryUsedKb: null,
        },
      ],
    };
    synth.set("p1", broken);
    render(
      <ParticipantTimelineBar
        participant={participant}
        assignmentProblems={assignmentProblems}
        timelineByProblem={synth}
        locale="en"
        timeZone="UTC"
        translations={baseTranslations}
        statusLabels={{ wrong_answer: "Wrong Answer" }}
      />
    );
    // No link to '#' should be emitted.
    const links = screen.queryAllByRole("link");
    for (const link of links) {
      expect(link.getAttribute("href")).not.toBe("#");
    }
    // The marker is still discoverable via its aria-label as an image role.
    const imgMarker = screen.getByRole("img", { name: /Problem A.*wrong_answer/i });
    expect(imgMarker).toBeInTheDocument();
  });

  it("clamps formatDuration at 0 for pre-start events (regression test for DBG10-2)", () => {
    // A submission whose timestamp predates participant.examStartedAt
    // (retroactively-started exam, clock skew, etc.) used to render
    // "0m -5s" in the relative-time tooltip line. The cycle-10 clamp
    // `Math.max(0, totalSeconds)` should now produce "0m 0s" / "0분 0초".
    const beforeStart = new Date(start.getTime() - 5_000); // 5s before start
    const synth = new Map<string, ParticipantTimeline["problems"][number]>([
      [
        "p1",
        {
          problemId: "p1",
          title: "Problem A",
          points: 100,
          sortOrder: 1,
          summary: {
            totalAttempts: 1,
            bestScore: 0,
            firstSubmissionAt: beforeStart,
            lastSubmissionAt: beforeStart,
            firstAcAt: null,
            timeToFirstSubmission: -5,
            timeToFirstAc: null,
            wrongBeforeAc: 1,
            snapshotCount: 0,
          },
          timeline: [
            {
              type: "submission",
              at: beforeStart,
              submissionId: "s-pre",
              status: "wrong_answer",
              score: 0,
              language: "python",
              executionTimeMs: 50,
              memoryUsedKb: 512,
            },
          ],
        },
      ],
    ]);
    const { container } = render(
      <ParticipantTimelineBar
        participant={participant}
        assignmentProblems={assignmentProblems}
        timelineByProblem={synth}
        locale="ko"
        timeZone="UTC"
        translations={koTranslations}
        statusLabels={{ wrong_answer: "오답" }}
      />
    );
    const html = container.innerHTML;
    // No negative-second substring should appear in the tooltip relative-time.
    expect(html).not.toMatch(/-\d+초/);
    expect(html).not.toMatch(/-\d+s\b/);
    // The pre-start relative-time should clamp to "0분 0초" (ko durationShort).
    expect(html).toMatch(/\+0분 0초/);
  });

  it("renders 'no submissions' fallback when there are no events", () => {
    render(
      <ParticipantTimelineBar
        participant={participant}
        assignmentProblems={assignmentProblems}
        timelineByProblem={new Map()}
        locale="en"
        timeZone="UTC"
        translations={baseTranslations}
        statusLabels={{}}
      />
    );
    expect(screen.getByText("No submissions")).toBeInTheDocument();
  });
});
