import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/capabilities/cache", () => ({
  resolveCapabilities: vi.fn(async () => new Set()),
}));

vi.mock("@/lib/auth/permissions", () => ({
  canAccessProblem: vi.fn(async (_problemId: string, _userId: string, _role: string) => true),
}));

import { canAccessProblem } from "@/lib/auth/permissions";
import {
  PROBLEM_LINKED_SCOPES,
  canAccessProblemScopedThread,
  canModerateDiscussions,
  isProblemLinkedScope,
} from "@/lib/discussions/permissions";

describe("community scope centralization (NEW-H6 / SEC-9 / NEW-M1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("treats problem, editorial, and solution as problem-linked scopes", () => {
    expect([...PROBLEM_LINKED_SCOPES].sort()).toEqual(["editorial", "problem", "solution"]);
    expect(isProblemLinkedScope("problem")).toBe(true);
    expect(isProblemLinkedScope("editorial")).toBe(true);
    expect(isProblemLinkedScope("solution")).toBe(true);
    expect(isProblemLinkedScope("general")).toBe(false);
    expect(isProblemLinkedScope(null)).toBe(false);
    expect(isProblemLinkedScope(undefined)).toBe(false);
  });

  it("canModerateDiscussions still works (re-export parity)", async () => {
    await expect(canModerateDiscussions("admin")).resolves.toBe(false);
  });

  it("allows non-problem-linked scopes without consulting canAccessProblem", async () => {
    const viewer = { userId: "u1", role: "student" };
    await expect(canAccessProblemScopedThread("general", null, viewer)).resolves.toBe(true);
    expect(canAccessProblem).not.toHaveBeenCalled();
  });

  it("denies a problem-linked scope with no problemId", async () => {
    const viewer = { userId: "u1", role: "student" };
    await expect(canAccessProblemScopedThread("editorial", null, viewer)).resolves.toBe(false);
    expect(canAccessProblem).not.toHaveBeenCalled();
  });

  it("delegates to canAccessProblem for a problem-linked scope with a problemId", async () => {
    const viewer = { userId: "u1", role: "student" };
    vi.mocked(canAccessProblem).mockResolvedValueOnce(false);
    await expect(canAccessProblemScopedThread("solution", "p1", viewer)).resolves.toBe(false);
    expect(canAccessProblem).toHaveBeenCalledWith("p1", "u1", "student");
  });
});
