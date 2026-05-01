import { describe, expect, it } from "vitest";
import {
  getAssignmentParticipantStatus,
  hasActiveExamSession,
} from "@/lib/assignments/participant-status";

describe("assignment participant status", () => {
  const now = new Date("2026-04-15T05:00:00.000Z").getTime();

  it("marks active exam sessions without submissions as in progress", () => {
    expect(
      getAssignmentParticipantStatus({
        latestStatus: null,
        attemptCount: 0,
        bestTotalScore: 0,
        totalPoints: 200,
        examSessionStartedAt: "2026-04-15T04:30:00.000Z",
        examSessionPersonalDeadline: "2026-04-15T06:00:00.000Z",
        now,
      })
    ).toBe("in_progress");
  });

  it("does not mark partial accepted scores as accepted while the exam is still active", () => {
    expect(
      getAssignmentParticipantStatus({
        latestStatus: "accepted",
        attemptCount: 1,
        bestTotalScore: 100,
        totalPoints: 200,
        examSessionStartedAt: "2026-04-15T04:30:00.000Z",
        examSessionPersonalDeadline: "2026-04-15T06:00:00.000Z",
        now,
      })
    ).toBe("in_progress");
  });

  it("downgrades partial accepted totals to submitted after the exam window ends", () => {
    expect(
      getAssignmentParticipantStatus({
        latestStatus: "accepted",
        attemptCount: 1,
        bestTotalScore: 100,
        totalPoints: 200,
        examSessionStartedAt: "2026-04-15T03:30:00.000Z",
        examSessionPersonalDeadline: "2026-04-15T04:00:00.000Z",
        now,
      })
    ).toBe("submitted");
  });

  it("keeps perfect scores accepted even if the latest judged attempt was earlier", () => {
    expect(
      getAssignmentParticipantStatus({
        latestStatus: "wrong_answer",
        attemptCount: 3,
        bestTotalScore: 200,
        totalPoints: 200,
        now,
      })
    ).toBe("accepted");
  });

  it("preserves non-accepted terminal verdicts for attempted but incomplete work", () => {
    expect(
      getAssignmentParticipantStatus({
        latestStatus: "wrong_answer",
        attemptCount: 2,
        bestTotalScore: 65,
        totalPoints: 200,
        now,
      })
    ).toBe("wrong_answer");
  });

  it("returns 'pending' for null status with attempts (e.g., worker crash mid-judge)", () => {
    expect(
      getAssignmentParticipantStatus({
        latestStatus: null,
        attemptCount: 1,
        bestTotalScore: 0,
        totalPoints: 200,
        now,
      })
    ).toBe("pending");
  });

  it("returns 'pending' for null status with multiple attempts", () => {
    expect(
      getAssignmentParticipantStatus({
        latestStatus: null,
        attemptCount: 3,
        bestTotalScore: 50,
        totalPoints: 200,
        now,
      })
    ).toBe("pending");
  });

  it("returns 'submitted' for explicit accepted status with attempts", () => {
    expect(
      getAssignmentParticipantStatus({
        latestStatus: "accepted",
        attemptCount: 1,
        bestTotalScore: 50,
        totalPoints: 200,
        now,
      })
    ).toBe("submitted");
  });

  it("detects expired and future exam sessions correctly", () => {
    expect(
      hasActiveExamSession("2026-04-15T04:00:00.000Z", now, "2026-04-15T03:00:00.000Z")
    ).toBe(false);
    expect(
      hasActiveExamSession("2026-04-15T06:00:00.000Z", now, "2026-04-15T05:30:00.000Z")
    ).toBe(false);
    expect(
      hasActiveExamSession("2026-04-15T06:00:00.000Z", now, "2026-04-15T04:30:00.000Z")
    ).toBe(true);
  });
});
