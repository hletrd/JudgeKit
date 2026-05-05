import { getContestStatus, getContestsForUser, type ContestEntry } from "@/lib/assignments/contests";
import { getDbNow } from "@/lib/db-time";

export type ActiveTimedAssignmentSummary = {
  assignmentId: string;
  title: string;
  groupName: string;
  href: string;
  mode: "scheduled" | "windowed";
  startedAt: string;
  deadline: string;
};

/**
 * Filter and sort contests to show only active timed assignments.
 *
 * IMPORTANT: The `now` parameter should come from `getDbNow()` in server
 * components to avoid clock skew. See `getActiveTimedAssignmentsForSidebar`
 * for the async wrapper that fetches DB time automatically.
 */
export function selectActiveTimedAssignments(
  contests: ContestEntry[],
  now: Date
): ActiveTimedAssignmentSummary[] {
  return contests
    .filter((contest) => {
      const status = getContestStatus(contest, now);
      return status === "in_progress" || (contest.examMode === "scheduled" && status === "open");
    })
    .map((contest) => ({
      assignmentId: contest.id,
      title: contest.title,
      groupName: contest.groupName,
      href: `/contests/${contest.id}`,
      mode: contest.examMode as "scheduled" | "windowed",
      startedAt: (contest.examMode === "scheduled" ? contest.startsAt : contest.startedAt)?.toISOString() ?? "",
      deadline: (contest.examMode === "scheduled" ? contest.deadline : contest.personalDeadline)?.toISOString() ?? "",
    }))
    .filter((contest) => Boolean(contest.startedAt && contest.deadline))
    .sort((left, right) => {
      const deadlineDiff = new Date(left.deadline).getTime() - new Date(right.deadline).getTime();
      if (deadlineDiff !== 0) {
        return deadlineDiff;
      }
      return new Date(left.startedAt).getTime() - new Date(right.startedAt).getTime();
    });
}

export async function getActiveTimedAssignmentsForSidebar(
  userId: string,
  role: string,
  now?: Date
): Promise<ActiveTimedAssignmentSummary[]> {
  const dbNow = now ?? await getDbNow();
  const contests = await getContestsForUser(userId, role);
  return selectActiveTimedAssignments(contests, dbNow);
}
