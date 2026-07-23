import { describe, expect, it } from "vitest";
import { assignmentMutationSchema, assignmentPatchSchema } from "@/lib/validators/assignments";

const validPayload = {
  title: " Homework 1 ",
  description: " Introductory exercises ",
  startsAt: 100,
  deadline: 200,
  lateDeadline: 300,
  latePenalty: 20,
  problems: [
    {
      problemId: " problem-1 ",
      points: 50,
    },
    {
      problemId: "problem-2",
      points: 50,
    },
  ],
};

describe("assignmentMutationSchema", () => {
  it("normalizes whitespace for title, description, and problem IDs", () => {
    const parsed = assignmentMutationSchema.parse(validPayload);

    expect(parsed.title).toBe("Homework 1");
    expect(parsed.description).toBe("Introductory exercises");
    expect(parsed.problems[0]?.problemId).toBe("problem-1");
    expect(parsed.visibility).toBe("private");
  });

  it("rejects duplicate problems", () => {
    const result = assignmentMutationSchema.safeParse({
      ...validPayload,
      problems: [
        { problemId: "problem-1", points: 50 },
        { problemId: "problem-1", points: 25 },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("assignmentProblemDuplicate");
  });

  it("rejects invalid schedules", () => {
    const startsAfterDeadline = assignmentMutationSchema.safeParse({
      ...validPayload,
      startsAt: 300,
      deadline: 200,
    });
    const lateDeadlineBeforeDeadline = assignmentMutationSchema.safeParse({
      ...validPayload,
      deadline: 300,
      lateDeadline: 200,
    });

    expect(startsAfterDeadline.success).toBe(false);
    expect(startsAfterDeadline.error?.issues[0]?.message).toBe("assignmentScheduleInvalid");
    expect(lateDeadlineBeforeDeadline.success).toBe(false);
    expect(lateDeadlineBeforeDeadline.error?.issues[0]?.message).toBe(
      "assignmentLateDeadlineInvalid"
    );
  });

  it("rejects a leaderboard freeze outside the contest window", () => {
    const beforeStart = assignmentMutationSchema.safeParse({
      ...validPayload,
      freezeLeaderboardAt: 50, // < startsAt (100)
    });
    const atDeadline = assignmentMutationSchema.safeParse({
      ...validPayload,
      freezeLeaderboardAt: 200, // == deadline (200)
    });

    expect(beforeStart.success).toBe(false);
    expect(beforeStart.error?.issues[0]?.message).toBe("freezeLeaderboardOutOfRange");
    expect(atDeadline.success).toBe(false);
    expect(atDeadline.error?.issues[0]?.message).toBe("freezeLeaderboardOutOfRange");
  });

  it("accepts a leaderboard freeze inside the contest window", () => {
    const result = assignmentMutationSchema.safeParse({
      ...validPayload,
      freezeLeaderboardAt: 150, // startsAt (100) <= 150 < deadline (200)
    });
    expect(result.success).toBe(true);
  });

  it("defaults aiAssistantPolicy to inherit when omitted", () => {
    const parsed = assignmentMutationSchema.parse(validPayload);
    expect(parsed.aiAssistantPolicy).toBe("inherit");
  });

  it.each(["inherit", "allow", "forbid"] as const)(
    "accepts aiAssistantPolicy %s",
    (policy) => {
      const result = assignmentMutationSchema.safeParse({
        ...validPayload,
        aiAssistantPolicy: policy,
      });
      expect(result.success).toBe(true);
      expect(result.data?.aiAssistantPolicy).toBe(policy);
    }
  );

  it("rejects a junk aiAssistantPolicy value", () => {
    const result = assignmentMutationSchema.safeParse({
      ...validPayload,
      aiAssistantPolicy: "banana",
    });
    expect(result.success).toBe(false);
  });
});

describe("assignmentPatchSchema", () => {
  // The exact body the edit dialog sends for a contest (examMode !== "none").
  // Regression: assignmentPatchSchema was .strict() but omitted
  // freezeLeaderboardAt / showResultsToCandidate / hideScoresFromCandidates,
  // so every contest/assignment edit was rejected with unrecognized_keys (400).
  const contestEditPayload = {
    title: "Recruiting Round 1",
    description: "Timed coding test",
    startsAt: 1000,
    deadline: 5000,
    lateDeadline: null,
    latePenalty: 0,
    examMode: "scheduled" as const,
    visibility: "private" as const,
    examDurationMinutes: null,
    scoringModel: "icpc" as const,
    freezeLeaderboardAt: 4000,
    enableAntiCheat: true,
    showResultsToCandidate: false,
    hideScoresFromCandidates: true,
    allowLockedProblems: true,
  };

  it("accepts the full contest edit payload the form sends", () => {
    const result = assignmentPatchSchema.safeParse(contestEditPayload);
    expect(result.success).toBe(true);
    expect(result.data?.freezeLeaderboardAt).toBe(4000);
    expect(result.data?.showResultsToCandidate).toBe(false);
    expect(result.data?.hideScoresFromCandidates).toBe(true);
  });

  it("accepts a freeze/visibility-only partial edit", () => {
    const result = assignmentPatchSchema.safeParse({
      freezeLeaderboardAt: 4000,
      hideScoresFromCandidates: true,
    });
    expect(result.success).toBe(true);
  });

  it("still rejects genuinely unknown keys (strict mode preserved)", () => {
    const result = assignmentPatchSchema.safeParse({
      ...contestEditPayload,
      bogusField: "nope",
    });
    expect(result.success).toBe(false);
  });

  it("accepts an aiAssistantPolicy-only partial edit", () => {
    const result = assignmentPatchSchema.safeParse({ aiAssistantPolicy: "forbid" });
    expect(result.success).toBe(true);
    expect(result.data?.aiAssistantPolicy).toBe("forbid");
  });

  it("leaves aiAssistantPolicy undefined when omitted (optional, no default)", () => {
    const result = assignmentPatchSchema.safeParse({ title: "Edit" });
    expect(result.success).toBe(true);
    expect(result.data?.aiAssistantPolicy).toBeUndefined();
  });

  it("rejects a junk aiAssistantPolicy value", () => {
    const result = assignmentPatchSchema.safeParse({ aiAssistantPolicy: "banana" });
    expect(result.success).toBe(false);
  });
});
