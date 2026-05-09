import { cache } from "react";
import { and, eq, inArray } from "drizzle-orm";
import type { PlatformMode } from "@/types";
import { db } from "@/lib/db";
import { assignmentProblems, recruitingInvitations } from "@/lib/db/schema";
import { getResolvedPlatformMode } from "@/lib/system-settings";
import { getCachedRecruitingContext, setCachedRecruitingContext } from "@/lib/recruiting/request-cache";

export type RecruitingAccessContext = {
  assignmentIds: string[];
  problemIds: string[];
  isRecruitingCandidate: boolean;
  effectivePlatformMode: PlatformMode;
};

/**
 * Load the recruiting access context for a user.
 *
 * This function uses a dual caching strategy:
 *
 * 1. **React `cache()`**: Deduplicates calls within a single RSC render.
 *    This is the primary cache for dashboard page loads where the layout
 *    and individual page components both call this function.
 *
 * 2. **AsyncLocalStorage**: Bridges the gap for API route handlers, which
 *    are outside the React rendering lifecycle and therefore not covered by
 *    React `cache()`. Without this fallback, every call from an API route
 *    (e.g., permission checks in `canAccessProblem`) would hit the database.
 *
 * Both caches are request-scoped and do not persist across requests, so stale
 * data is not a concern. If AsyncLocalStorage is not available (e.g., outside
 * a Next.js request context), the cache gracefully degrades to uncached queries.
 */
async function loadRecruitingAccessContext(
  userId: string
): Promise<RecruitingAccessContext> {
  // Check AsyncLocalStorage cache first (covers API routes)
  const cached = getCachedRecruitingContext(userId);
  if (cached) return cached;

  const platformMode = await getResolvedPlatformMode();

  if (!userId) {
    const result = {
      assignmentIds: [],
      problemIds: [],
      isRecruitingCandidate: false,
      effectivePlatformMode: platformMode,
    };
    setCachedRecruitingContext(userId, result);
    return result;
  }

  const invitationRows = await db
    .select({ assignmentId: recruitingInvitations.assignmentId })
    .from(recruitingInvitations)
    .where(
      and(
        eq(recruitingInvitations.userId, userId),
        eq(recruitingInvitations.status, "redeemed")
      )
    );

  const assignmentIds = [...new Set(invitationRows.map((row) => row.assignmentId))];
  let problemIds: string[] = [];

  if (assignmentIds.length > 0) {
    const problemRows = await db
      .select({ problemId: assignmentProblems.problemId })
      .from(assignmentProblems)
      .where(inArray(assignmentProblems.assignmentId, assignmentIds));
    problemIds = [...new Set(problemRows.map((row) => row.problemId))];
  }

  const isRecruitingCandidate = assignmentIds.length > 0;

  const result: RecruitingAccessContext = {
    assignmentIds,
    problemIds,
    isRecruitingCandidate,
    effectivePlatformMode:
      (platformMode === "recruiting" || isRecruitingCandidate
        ? "recruiting"
        : platformMode) as PlatformMode,
  };

  // Store in AsyncLocalStorage for subsequent calls in the same request
  setCachedRecruitingContext(userId, result);

  return result;
}

/**
 * Get the recruiting access context for a user, cached per-request.
 *
 * Uses a dual caching strategy:
 * - React `cache()` deduplicates within a single server component render
 * - AsyncLocalStorage deduplicates across API route handlers (via
 *   `withRecruitingContextCache` in `createApiHandler`)
 *
 * **Server actions:** Server actions run outside the React rendering lifecycle
 * and are NOT covered by React `cache()`. If a server action calls this
 * function (or any function that calls it, such as `canAccessProblem`), wrap
 * the action body with `withRecruitingContextCache()` to enable deduplication.
 * Without the wrapper, each call executes two DB queries.
 *
 * **Dev-mode safety:** `setCachedRecruitingContext` logs a warning when no
 * active AsyncLocalStorage store is detected in non-production environments.
 * This helps catch server actions and other call sites that forget to wrap.
 *
 * Call sites do not need any changes unless they are server actions.
 */
export const getRecruitingAccessContext = cache(
  async function getRecruitingAccessContextInner(
    userId: string
  ): Promise<RecruitingAccessContext> {
    return loadRecruitingAccessContext(userId);
  }
);

export async function isRecruitingCandidateUser(userId: string): Promise<boolean> {
  return (await getRecruitingAccessContext(userId)).isRecruitingCandidate;
}
