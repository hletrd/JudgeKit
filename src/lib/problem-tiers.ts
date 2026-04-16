import type { Tier } from "@/lib/ratings";

export type ProblemTierInfo = {
  tier: Tier;
  label: string;
};

const PROBLEM_TIER_THRESHOLDS: Array<ProblemTierInfo & { maxExclusive: number }> = [
  { tier: "bronze", label: "Bronze V", maxExclusive: 1.5 },
  { tier: "bronze", label: "Bronze III", maxExclusive: 2.5 },
  { tier: "silver", label: "Silver V", maxExclusive: 3.5 },
  { tier: "silver", label: "Silver III", maxExclusive: 4.5 },
  { tier: "gold", label: "Gold V", maxExclusive: 5.5 },
  { tier: "gold", label: "Gold III", maxExclusive: 6.5 },
  { tier: "platinum", label: "Platinum V", maxExclusive: 7.5 },
  { tier: "diamond", label: "Diamond V", maxExclusive: 8.5 },
];

export function getProblemTierInfo(difficulty: number | null | undefined): ProblemTierInfo | null {
  if (difficulty == null || Number.isNaN(difficulty)) {
    return null;
  }

  for (const entry of PROBLEM_TIER_THRESHOLDS) {
    if (difficulty < entry.maxExclusive) {
      return {
        tier: entry.tier,
        label: entry.label,
      };
    }
  }

  return {
    tier: "ruby",
    label: "Ruby V",
  };
}
