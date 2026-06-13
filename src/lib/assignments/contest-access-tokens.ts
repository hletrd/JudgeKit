import { and, eq, inArray } from "drizzle-orm";
import { db, type TransactionClient } from "@/lib/db";
import { assignments, contestAccessTokens } from "@/lib/db/schema";

/**
 * Single owner of the contest access-token VALIDITY and LIFECYCLE rules
 * (RPF cycle-6 AGG6-1 / A6-1).
 *
 * Before this module the "has contest access via token" predicate was
 * implemented inline at six call sites with TWO semantics: the raw-SQL gates
 * (platform-mode context, contest catalog, anti-cheat ingest) required an
 * unexpired token while the Drizzle gates (submission validation, contest
 * detail/status) accepted any row. Divergent verdicts on the same row are a
 * boundary defect regardless of which semantic the owner intends — this
 * module makes "valid token" mean one thing everywhere.
 */

/**
 * Canonical SQL validity condition for a `contest_access_tokens` row aliased
 * as `cat`. Interpolated (NOT parameterized — it contains no user input) into
 * the raw-SQL EXISTS gates so the expiry rule cannot drift from the Drizzle
 * rule below. NOW() is DB time, consistent with every other schedule check.
 */
export const CONTEST_ACCESS_TOKEN_VALIDITY_SQL =
  "(cat.expires_at IS NULL OR cat.expires_at > NOW())";

export type ValidContestAccessToken = {
  id: string;
  expiresAt: Date | null;
};

/**
 * Find the user's access token for an assignment and apply the validity rule
 * against the caller-provided clock. Callers MUST pass DB-derived time
 * (`getDbNow()` / `getDbNowUncached()` / the validator's `now`) — never the
 * app server's `Date.now()` — to stay consistent with the SQL gates that
 * evaluate the same rule via NOW().
 *
 * Returns null when no token exists OR the token is expired. An expired token
 * is intentionally indistinguishable from no token: every consumer is an
 * access gate.
 */
export async function findValidContestAccessToken(
  assignmentId: string,
  userId: string,
  nowMs: number
): Promise<ValidContestAccessToken | null> {
  const token = await db.query.contestAccessTokens.findFirst({
    where: and(
      eq(contestAccessTokens.assignmentId, assignmentId),
      eq(contestAccessTokens.userId, userId)
    ),
    columns: { id: true, expiresAt: true },
  });

  if (!token) return null;
  if (token.expiresAt && token.expiresAt.valueOf() <= nowMs) return null;
  return token;
}

/**
 * Revoke (delete) the user's contest access tokens for every assignment of a
 * group. Called from the group member-removal transaction so "remove from
 * roster" actually revokes contest access — previously the invite-era token
 * survived the enrollment delete and silently re-granted submit + contest
 * detail (RPF cycle-6 AGG6-1/SEC6-1). Returns the number of revoked tokens
 * for the caller's audit record.
 */
export async function revokeContestAccessTokensForGroup(
  tx: TransactionClient,
  groupId: string,
  userId: string
): Promise<number> {
  const revoked = await tx
    .delete(contestAccessTokens)
    .where(
      and(
        eq(contestAccessTokens.userId, userId),
        inArray(
          contestAccessTokens.assignmentId,
          tx
            .select({ id: assignments.id })
            .from(assignments)
            .where(eq(assignments.groupId, groupId))
        )
      )
    )
    .returning({ id: contestAccessTokens.id });

  return revoked.length;
}

/**
 * Effective expiry for a NEW contest access token: the assignment's effective
 * close (`lateDeadline ?? deadline`). Tokens used to expire at `deadline`,
 * which (now that expiry is enforced uniformly) would have cut invited users
 * out of a configured late-submission window.
 */
export function contestAccessTokenExpiry(assignment: {
  deadline: Date | null;
  lateDeadline?: Date | null;
}): Date | null {
  return assignment.lateDeadline ?? assignment.deadline ?? null;
}

/**
 * Re-derive every existing token's expiry for an assignment to its CURRENT
 * effective close (RPF cycle-7 AGG7-3 / SEC7-1). The token-expiry invariant
 * ("a token expires at `lateDeadline ?? deadline`") was previously established
 * only at creation; a later schedule edit left tokens stale:
 *  - EXTEND  → tokens expired early, denying token-only participants during
 *    the bonus window;
 *  - SHORTEN → tokens outlived the new close, re-granting ingest/catalog
 *    visibility past the close the instructor set.
 * Called inside the schedule-edit transaction (mirrors the in-tx
 * `revokeContestAccessTokensForGroup` lifecycle ownership). Also retro-repairs
 * pre-cycle-6 `deadline`-stamped rows on the next edit (no migration needed).
 * Returns the number of token rows updated.
 */
export async function syncContestAccessTokenExpiry(
  tx: TransactionClient,
  assignmentId: string,
  assignment: { deadline: Date | null; lateDeadline?: Date | null }
): Promise<number> {
  const expiresAt = contestAccessTokenExpiry(assignment);
  const updated = await tx
    .update(contestAccessTokens)
    .set({ expiresAt })
    .where(eq(contestAccessTokens.assignmentId, assignmentId))
    .returning({ id: contestAccessTokens.id });
  return updated.length;
}
