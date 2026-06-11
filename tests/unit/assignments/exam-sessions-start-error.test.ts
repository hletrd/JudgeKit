/**
 * RPF cycle-4 AGG4-4: when the post-insert re-fetch inside startExamSession
 * misses (insert-then-vanish anomaly), the thrown error must be the internal
 * `examSessionUnavailable` — NOT `assignmentClosed`, which told a student
 * their open exam was closed at the exact moment they tried to start and
 * which the route maps to a non-retryable user-facing verdict.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, txMock, getDbNowUncachedMock } = vi.hoisted(() => {
  const txMock = {
    query: {
      examSessions: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  };
  return {
    txMock,
    dbMock: {
      query: {
        assignments: {
          findFirst: vi.fn(),
        },
      },
      transaction: vi.fn(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
    },
    getDbNowUncachedMock: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/db-time", () => ({
  getDbNow: vi.fn(),
  getDbNowUncached: getDbNowUncachedMock,
}));

import { startExamSession } from "@/lib/assignments/exam-sessions";

describe("startExamSession — re-fetch anomaly (AGG4-4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDbNowUncachedMock.mockResolvedValue(new Date("2026-06-11T10:00:00.000Z"));
    dbMock.query.assignments.findFirst.mockResolvedValue({
      id: "assignment-1",
      examMode: "windowed",
      examDurationMinutes: 60,
      startsAt: new Date("2026-06-11T09:00:00.000Z"),
      deadline: new Date("2026-06-11T12:00:00.000Z"),
    });
  });

  it("throws the internal examSessionUnavailable key, never a false assignmentClosed", async () => {
    // No pre-existing session, and the post-insert re-fetch ALSO misses.
    txMock.query.examSessions.findFirst.mockResolvedValue(null);

    await expect(startExamSession("assignment-1", "student-1")).rejects.toThrow(
      "examSessionUnavailable"
    );
  });

  it("returns the authoritative row when the re-fetch finds it", async () => {
    const row = {
      id: "session-1",
      assignmentId: "assignment-1",
      userId: "student-1",
      startedAt: new Date("2026-06-11T10:00:00.000Z"),
      personalDeadline: new Date("2026-06-11T11:00:00.000Z"),
    };
    txMock.query.examSessions.findFirst
      .mockResolvedValueOnce(null) // existence check
      .mockResolvedValueOnce(row); // post-insert re-fetch

    await expect(startExamSession("assignment-1", "student-1")).resolves.toEqual(row);
  });
});
