/**
 * Round a score value to two decimal places for display.
 * Returns "-" for null/undefined values.
 */
export function formatScore(score: number | null | undefined): string {
  if (score == null) return "-";
  return String(Math.round(score * 100) / 100);
}
