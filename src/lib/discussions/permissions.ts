import { resolveCapabilities } from "@/lib/capabilities/cache";
import { canAccessProblem } from "@/lib/auth/permissions";

export async function canModerateDiscussions(role: string): Promise<boolean> {
  const capabilities = await resolveCapabilities(role);
  return capabilities.has("community.moderate");
}

/**
 * Thread scopes that are bound to a specific problem and therefore require the
 * viewer/actor to pass `canAccessProblem` before reading or writing. Keep this
 * as the SINGLE source of truth — previously the page, posts, votes, and create
 * routes each enumerated their own (drifted) subset, letting users read/reply/
 * vote on editorial- or solution-scoped threads without problem access
 * (NEW-H6 / SEC-9 / NEW-M1).
 */
export const PROBLEM_LINKED_SCOPES = ["problem", "editorial", "solution"] as const;

export function isProblemLinkedScope(scopeType: string | null | undefined): boolean {
  return !!scopeType && (PROBLEM_LINKED_SCOPES as readonly string[]).includes(scopeType);
}

/**
 * Returns true when the viewer may access a problem-linked thread/post/vote
 * (i.e. the scope is problem-linked AND the viewer can access the bound
 * problem). Non-problem-linked scopes (general) are always allowed at this
 * layer. Returns a boolean so callers can map to 403/redirect as appropriate.
 */
export async function canAccessProblemScopedThread(
  scopeType: string | null | undefined,
  problemId: string | null | undefined,
  viewer: { userId: string; role: string },
): Promise<boolean> {
  if (!isProblemLinkedScope(scopeType)) return true;
  if (!problemId) return false;
  return canAccessProblem(problemId, viewer.userId, viewer.role);
}

