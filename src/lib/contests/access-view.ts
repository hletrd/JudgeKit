import type { getUserContestAccess } from "@/lib/assignments/public-contests";

/**
 * Result type from `getUserContestAccess`. Currently `"enrolled" | "managing" | null`
 * but kept as a derived alias so additions to the source union flow through
 * automatically.
 */
export type ContestUserAccess = Awaited<ReturnType<typeof getUserContestAccess>>;

/**
 * Whether a contest detail page should render the rich "participation" view
 * (enrolled student or managing instructor/admin).
 *
 * Extracted in cycle 11 (ARCH11-1) from `(public)/contests/[id]/page.tsx`
 * so the predicate sits next to the access model instead of inside a page
 * module. After the cycle-8 widening, this predicate replaces the inline
 * `userAccess === "enrolled" || === "managing"` compound expression.
 */
export function canShowParticipationView(
  userAccess: ContestUserAccess,
): boolean {
  return userAccess === "enrolled" || userAccess === "managing";
}
