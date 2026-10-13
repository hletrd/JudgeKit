/**
 * The "problem list" a problem (or one of its submissions) belongs to.
 *
 * Problems are opened in three contexts, and each has its own list page:
 * - a contest (an assignment with examMode != "none") lists its problems on
 *   `/contests/[id]`;
 * - a plain group assignment (examMode "none") is not reachable through
 *   `/contests/[id]` at all, so it lists them on its group assignment page;
 * - everything else is the public practice list.
 */
export function getProblemListPath(
  assignment: { id: string; groupId: string; examMode: string | null } | null | undefined,
): string {
  if (!assignment) {
    return "/practice";
  }

  return assignment.examMode && assignment.examMode !== "none"
    ? `/contests/${assignment.id}`
    : `/groups/${assignment.groupId}/assignments/${assignment.id}`;
}
