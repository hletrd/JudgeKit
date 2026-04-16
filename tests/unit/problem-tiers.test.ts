import { describe, expect, it } from "vitest";
import { getProblemTierInfo } from "@/lib/problem-tiers";

describe("getProblemTierInfo", () => {
  it("maps representative difficulty values to BOJ-style tier labels", () => {
    expect(getProblemTierInfo(0.7)).toEqual({ tier: "bronze", label: "Bronze V" });
    expect(getProblemTierInfo(2.1)).toEqual({ tier: "bronze", label: "Bronze III" });
    expect(getProblemTierInfo(3.2)).toEqual({ tier: "silver", label: "Silver V" });
    expect(getProblemTierInfo(4.8)).toEqual({ tier: "gold", label: "Gold V" });
    expect(getProblemTierInfo(6.1)).toEqual({ tier: "gold", label: "Gold III" });
    expect(getProblemTierInfo(7.9)).toEqual({ tier: "diamond", label: "Diamond V" });
    expect(getProblemTierInfo(9.5)).toEqual({ tier: "ruby", label: "Ruby V" });
  });

  it("returns null when difficulty is absent", () => {
    expect(getProblemTierInfo(null)).toBeNull();
    expect(getProblemTierInfo(undefined)).toBeNull();
  });
});
