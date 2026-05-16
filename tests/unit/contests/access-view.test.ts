import { describe, it, expect } from "vitest";
import { canShowParticipationView } from "@/lib/contests/access-view";

describe("canShowParticipationView", () => {
  it("returns true for enrolled students", () => {
    expect(canShowParticipationView("enrolled")).toBe(true);
  });

  it("returns true for managing instructors/admins", () => {
    expect(canShowParticipationView("managing")).toBe(true);
  });

  it("returns false for null (unauthenticated or non-participant)", () => {
    expect(canShowParticipationView(null)).toBe(false);
  });
});
