export type Tier = "bronze" | "silver" | "gold" | "platinum" | "diamond" | "ruby";

const TIER_THRESHOLDS: Array<{ tier: Tier; minSolved: number }> = [
  { tier: "ruby", minSolved: 701 },
  { tier: "diamond", minSolved: 501 },
  { tier: "platinum", minSolved: 301 },
  { tier: "gold", minSolved: 151 },
  { tier: "silver", minSolved: 51 },
  { tier: "bronze", minSolved: 1 },
];

export function calculateTier(solvedCount: number): Tier | null {
  if (solvedCount < 1) return null;

  for (const { tier, minSolved } of TIER_THRESHOLDS) {
    if (solvedCount >= minSolved) return tier;
  }

  return null;
}

export const TIER_COLORS: Record<Tier, string> = {
  bronze: "text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-600 bg-orange-50 dark:bg-orange-950",
  silver: "text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900",
  gold: "text-yellow-600 dark:text-yellow-400 border-yellow-300 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-950",
  platinum: "text-cyan-600 dark:text-cyan-400 border-cyan-300 dark:border-cyan-600 bg-cyan-50 dark:bg-cyan-950",
  diamond: "text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-950",
  ruby: "text-red-600 dark:text-red-400 border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-950",
};
