import { describe, expect, it } from "vitest";
import { getProblemListPath } from "@/lib/navigation/problem-list";

describe("getProblemListPath", () => {
  it("returns the practice list when there is no assignment context", () => {
    expect(getProblemListPath(null)).toBe("/practice");
    expect(getProblemListPath(undefined)).toBe("/practice");
  });

  it("returns the contest page for scheduled and windowed contests", () => {
    expect(getProblemListPath({ id: "contest-1", groupId: "group-1", examMode: "scheduled" })).toBe(
      "/contests/contest-1",
    );
    expect(getProblemListPath({ id: "contest-2", groupId: "group-1", examMode: "windowed" })).toBe(
      "/contests/contest-2",
    );
  });

  it("returns the group assignment page for plain assignments, which /contests/[id] does not serve", () => {
    expect(getProblemListPath({ id: "hw-1", groupId: "group-9", examMode: "none" })).toBe(
      "/groups/group-9/assignments/hw-1",
    );
    expect(getProblemListPath({ id: "hw-2", groupId: "group-9", examMode: null })).toBe(
      "/groups/group-9/assignments/hw-2",
    );
  });
});
