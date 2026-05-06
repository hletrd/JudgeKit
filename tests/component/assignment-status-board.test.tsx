import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Mock next-intl so SubmissionStatusBadge (used inside StatusBoard) can call
// useTranslations without a NextIntlClientProvider — return the i18n key as-is.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (values) {
      return Object.entries(values).reduce(
        (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
        key,
      );
    }
    return key;
  },
}));

import { StatusBoard } from "@/app/(public)/groups/[id]/assignments/[assignmentId]/status-board";
import type { AssignmentStudentStatusRow } from "@/lib/assignments/submissions";

const labels = {
  boardTitle: "Assignment status board",
  student: "User",
  class: "Class",
  totalScore: "Total score",
  attempts: "Attempts",
  status: "Status",
  lastSubmission: "Last submission",
  bestScore: "Best score",
  latestSubmission: "Latest submission",
  noSubmission: "No submission",
  noFilteredStudents: "No users",
  notSet: "Not set",
  statsMean: "Mean",
  statsMedian: "Median",
  statsSubmitted: "Submitted",
  statsPerfect: "Perfect",
  pointsAbbreviation: "pt",
  examSessionStatus: "Exam status",
  examSessionNotStarted: "Not started",
  examSessionInProgress: "In progress",
  examSessionCompleted: "Completed",
};

const statusLabels = {
  not_submitted: "Not submitted",
  in_progress: "In progress",
  submitted: "Submitted",
  pending: "Pending",
  queued: "Queued",
  judging: "Judging",
  accepted: "Accepted",
  wrong_answer: "Wrong answer",
  time_limit: "Time limit",
  memory_limit: "Memory limit",
  runtime_error: "Runtime error",
  compile_error: "Compile error",
} as const;

function createRow(overrides: Partial<AssignmentStudentStatusRow>): AssignmentStudentStatusRow {
  return {
    userId: "user-1",
    username: "alpha",
    name: "Alpha",
    className: "A",
    bestTotalScore: 0,
    attemptCount: 0,
    latestSubmissionId: null,
    latestStatus: null,
    latestSubmittedAt: null,
    problems: [
      {
        problemId: "problem-1",
        title: "Problem 1",
        points: 100,
        bestScore: 0,
        attemptCount: 0,
        latestSubmissionId: null,
        latestStatus: null,
        latestSubmittedAt: null,
        isOverridden: false,
        sortOrder: 0,
      },
    ],
    ...overrides,
  };
}

describe("StatusBoard", () => {
  it("renders derived participant statuses for contest participants", () => {
    render(
      <StatusBoard
        filteredRows={[
          createRow({
            userId: "active-no-submissions",
            username: "starter",
            name: "Starter",
          }),
          createRow({
            userId: "partial-accepted",
            username: "partial",
            name: "Partial",
            bestTotalScore: 100,
            attemptCount: 1,
            latestSubmissionId: "sub-1",
            latestStatus: "accepted",
            latestSubmittedAt: new Date("2026-04-15T04:40:00.000Z"),
            problems: [
              {
                problemId: "problem-1",
                title: "Problem 1",
                points: 200,
                bestScore: 100,
                attemptCount: 1,
                latestSubmissionId: "sub-1",
                latestStatus: "accepted",
                latestSubmittedAt: new Date("2026-04-15T04:40:00.000Z"),
                isOverridden: false,
                sortOrder: 0,
              },
            ],
          }),
          createRow({
            userId: "perfect-score",
            username: "perfect",
            name: "Perfect",
            bestTotalScore: 200,
            attemptCount: 2,
            latestSubmissionId: "sub-2",
            latestStatus: "wrong_answer",
            latestSubmittedAt: new Date("2026-04-15T04:50:00.000Z"),
            problems: [
              {
                problemId: "problem-1",
                title: "Problem 1",
                points: 200,
                bestScore: 200,
                attemptCount: 2,
                latestSubmissionId: "sub-2",
                latestStatus: "wrong_answer",
                latestSubmittedAt: new Date("2026-04-15T04:50:00.000Z"),
                isOverridden: false,
                sortOrder: 0,
              },
            ],
          }),
        ]}
        problems={[{ problemId: "problem-1", title: "Problem 1", points: 200 }]}
        totalPoints={200}
        statusLabels={statusLabels}
        locale="en"
        timeZone="UTC"
        labels={labels}
        groupId="group-1"
        assignmentId="assignment-1"
        examMode="windowed"
        currentTimeMs={new Date("2026-04-15T05:00:00.000Z").getTime()}
        examSessions={[
          {
            userId: "active-no-submissions",
            startedAt: "2026-04-15T04:30:00.000Z",
            personalDeadline: "2099-04-15T06:00:00.000Z",
          },
          {
            userId: "partial-accepted",
            startedAt: "2026-04-15T04:30:00.000Z",
            personalDeadline: "2099-04-15T06:00:00.000Z",
          },
        ]}
        isContestView
      />
    );

    expect(screen.getByTestId("assignment-row-status-active-no-submissions")).toHaveTextContent(
      "In progress"
    );
    expect(screen.getByTestId("assignment-row-status-partial-accepted")).toHaveTextContent(
      "In progress"
    );
    expect(screen.getByTestId("assignment-row-status-perfect-score")).toHaveTextContent(
      "Accepted"
    );
  });
});
