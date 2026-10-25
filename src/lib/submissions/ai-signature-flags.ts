import { and, asc, eq, exists, gt, inArray, like, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assignmentProblems,
  assignments,
  groupInstructors,
  groups,
  problems,
  submissionSignatureFlags,
  submissions,
} from "@/lib/db/schema";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import {
  extractSignatureTokens,
  matchSignatureTokens,
  type SignatureCandidate,
  type SignatureMatch,
} from "@/lib/problem-signatures";

/**
 * AI-use signature flags (see src/lib/problem-signatures.ts for the
 * `{{signature: token}}` syntax and the matching rule).
 *
 * Flags are computed when a submission is created and stored in
 * `submission_signature_flags` (one row per flagged submission). A change to a
 * problem's token set re-computes that problem's submissions and every
 * submission of the contests that include the problem.
 *
 * Token scope: a contest submission is checked against the tokens of every
 * problem in its assignment (plus its own problem); a submission outside an
 * assignment only against its own problem's tokens.
 *
 * Visibility: manager-only. Only viewers who can manage the submission's
 * group (owner, co_instructor, `groups.view_all`) may see a flag; submissions
 * outside an assignment are visible to `groups.view_all` only. Students,
 * TAs, and anonymous viewers never receive flags or tokens.
 */

const RECOMPUTE_BATCH_SIZE = 500;
const SIGNATURE_MARKER_LIKE = "%{{signature:%";

type CandidateProblemRow = { id: string; description: string | null };

function candidatesFromRows(rows: CandidateProblemRow[]): SignatureCandidate[] {
  const candidates: SignatureCandidate[] = [];
  for (const row of rows) {
    for (const token of extractSignatureTokens(row.description)) {
      candidates.push({ token, problemId: row.id });
    }
  }
  return candidates;
}

async function loadProblemCandidates(problemId: string): Promise<SignatureCandidate[]> {
  const rows = await db
    .select({ id: problems.id, description: problems.description })
    .from(problems)
    .where(and(eq(problems.id, problemId), like(problems.description, SIGNATURE_MARKER_LIKE)));
  return candidatesFromRows(rows);
}

async function loadAssignmentCandidates(assignmentId: string, problemId: string): Promise<SignatureCandidate[]> {
  const rows = await db
    .select({ id: problems.id, description: problems.description })
    .from(problems)
    .where(
      and(
        like(problems.description, SIGNATURE_MARKER_LIKE),
        or(
          eq(problems.id, problemId),
          inArray(
            problems.id,
            db
              .select({ problemId: assignmentProblems.problemId })
              .from(assignmentProblems)
              .where(eq(assignmentProblems.assignmentId, assignmentId)),
          ),
        ),
      ),
    );
  return candidatesFromRows(rows);
}

/** Candidate tokens for one submission context. */
export async function loadSignatureCandidates(
  problemId: string,
  assignmentId: string | null,
): Promise<SignatureCandidate[]> {
  return assignmentId
    ? loadAssignmentCandidates(assignmentId, problemId)
    : loadProblemCandidates(problemId);
}

export type SignatureFlagSubject = {
  id: string;
  problemId: string;
  assignmentId: string | null;
  sourceCode: string;
};

async function storeFlags(
  batch: readonly { submissionId: string; matches: SignatureMatch[] }[],
) {
  if (batch.length === 0) return;
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .delete(submissionSignatureFlags)
      .where(inArray(submissionSignatureFlags.submissionId, batch.map((entry) => entry.submissionId)));
    const flagged = batch.filter((entry) => entry.matches.length > 0);
    if (flagged.length > 0) {
      await tx.insert(submissionSignatureFlags).values(
        flagged.map((entry) => ({
          submissionId: entry.submissionId,
          matches: entry.matches,
          computedAt: now,
        })),
      );
    }
  });
}

/**
 * Compute and store the flag for one new submission. Returns the matches
 * (empty when not flagged).
 */
export async function computeAndStoreSignatureFlag(subject: SignatureFlagSubject): Promise<SignatureMatch[]> {
  const candidates = await loadSignatureCandidates(subject.problemId, subject.assignmentId);
  const matches = candidates.length > 0 ? matchSignatureTokens(subject.sourceCode, candidates) : [];
  if (matches.length > 0) {
    await storeFlags([{ submissionId: subject.id, matches }]);
  }
  return matches;
}

export type SignatureRecomputeResult = { scanned: number; flagged: number };

async function recomputeWhere(filter: SQL | undefined): Promise<SignatureRecomputeResult> {
  const candidateCache = new Map<string, SignatureCandidate[]>();
  let scanned = 0;
  let flagged = 0;
  let cursor: string | null = null;

  for (;;) {
    const page: SignatureFlagSubject[] = await db
      .select({
        id: submissions.id,
        problemId: submissions.problemId,
        assignmentId: submissions.assignmentId,
        sourceCode: submissions.sourceCode,
      })
      .from(submissions)
      .where(and(filter, cursor ? gt(submissions.id, cursor) : undefined))
      .orderBy(asc(submissions.id))
      .limit(RECOMPUTE_BATCH_SIZE);

    if (page.length === 0) break;

    const batch: { submissionId: string; matches: SignatureMatch[] }[] = [];
    for (const row of page) {
      const key = row.assignmentId ? `a:${row.assignmentId}:${row.problemId}` : `p:${row.problemId}`;
      let candidates = candidateCache.get(key);
      if (!candidates) {
        candidates = await loadSignatureCandidates(row.problemId, row.assignmentId);
        candidateCache.set(key, candidates);
      }
      const matches = candidates.length > 0 ? matchSignatureTokens(row.sourceCode, candidates) : [];
      if (matches.length > 0) flagged += 1;
      batch.push({ submissionId: row.id, matches });
    }
    await storeFlags(batch);

    scanned += page.length;
    cursor = page[page.length - 1].id;
    if (page.length < RECOMPUTE_BATCH_SIZE) break;
  }

  return { scanned, flagged };
}

/**
 * Re-flag every submission whose token set depends on `problemId`: the
 * problem's own submissions plus all submissions of the assignments that
 * include it.
 */
export async function recomputeSignatureFlagsForProblem(problemId: string): Promise<SignatureRecomputeResult> {
  const assignmentRows = await db
    .select({ assignmentId: assignmentProblems.assignmentId })
    .from(assignmentProblems)
    .where(eq(assignmentProblems.problemId, problemId));
  const assignmentIds = [...new Set(assignmentRows.map((row) => row.assignmentId))];
  return recomputeWhere(
    assignmentIds.length > 0
      ? or(eq(submissions.problemId, problemId), inArray(submissions.assignmentId, assignmentIds))
      : eq(submissions.problemId, problemId),
  );
}

export async function recomputeSignatureFlagsForAssignment(assignmentId: string): Promise<SignatureRecomputeResult> {
  return recomputeWhere(eq(submissions.assignmentId, assignmentId));
}

/**
 * Re-flag every submission that can carry a flag: those of problems with a
 * signature marker, those of assignments that include such a problem, and
 * those flagged today (so removed tokens clear their flags).
 */
export async function recomputeAllSignatureFlags(): Promise<SignatureRecomputeResult> {
  const markedProblemIds = db
    .select({ id: problems.id })
    .from(problems)
    .where(like(problems.description, SIGNATURE_MARKER_LIKE));
  return recomputeWhere(
    or(
      inArray(submissions.problemId, markedProblemIds),
      inArray(
        submissions.assignmentId,
        db
          .select({ id: assignmentProblems.assignmentId })
          .from(assignmentProblems)
          .where(inArray(assignmentProblems.problemId, markedProblemIds)),
      ),
      submissionHasSignatureFlagSql(),
    ),
  );
}

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

/**
 * Which flags a viewer may see: every flag (`groups.view_all`), or the flags
 * of contest submissions in the groups they own or co-instruct. `null` means
 * none at all (students, TAs, assistants, anonymous).
 */
export type SignatureFlagViewerScope = { all: true } | { all: false; groupIds: string[] };

export async function resolveSignatureFlagViewerScope(
  user: { id: string; role: string } | null | undefined,
): Promise<SignatureFlagViewerScope | null> {
  if (!user?.id) return null;
  const caps = await resolveCapabilities(user.role);
  if (caps.has("groups.view_all")) return { all: true };

  const rows = await db
    .select({ id: groups.id })
    .from(groups)
    .leftJoin(
      groupInstructors,
      and(
        eq(groupInstructors.groupId, groups.id),
        eq(groupInstructors.userId, user.id),
        eq(groupInstructors.role, "co_instructor"),
      ),
    )
    .where(or(eq(groups.instructorId, user.id), eq(groupInstructors.userId, user.id)));
  const groupIds = [...new Set(rows.map((row) => row.id))];
  return groupIds.length > 0 ? { all: false, groupIds } : null;
}

/** A flag as shown to a manager (tooltip: token + the problem defining it). */
export type SignatureFlagView = {
  matches: { token: string; problemId: string; problemTitle: string | null }[];
};

/**
 * Flags of `submissionIds` that `scope` may see, keyed by submission id.
 * Returns an empty map for a `null` scope without touching the database.
 */
export async function getSignatureFlagsForSubmissions(
  submissionIds: readonly string[],
  scope: SignatureFlagViewerScope | null,
): Promise<Map<string, SignatureFlagView>> {
  const result = new Map<string, SignatureFlagView>();
  if (!scope || submissionIds.length === 0) return result;

  const rows = await db
    .select({
      submissionId: submissionSignatureFlags.submissionId,
      matches: submissionSignatureFlags.matches,
      groupId: assignments.groupId,
    })
    .from(submissionSignatureFlags)
    .innerJoin(submissions, eq(submissions.id, submissionSignatureFlags.submissionId))
    .leftJoin(assignments, eq(assignments.id, submissions.assignmentId))
    .where(inArray(submissionSignatureFlags.submissionId, [...new Set(submissionIds)]));

  const visible = rows.filter(
    (row) => scope.all || (row.groupId !== null && scope.groupIds.includes(row.groupId)),
  );
  if (visible.length === 0) return result;

  const problemIds = [...new Set(visible.flatMap((row) => (row.matches ?? []).map((match) => match.problemId)))];
  const titleRows = problemIds.length > 0
    ? await db
        .select({ id: problems.id, title: problems.title })
        .from(problems)
        .where(inArray(problems.id, problemIds))
    : [];
  const titles = new Map(titleRows.map((row) => [row.id, row.title]));

  for (const row of visible) {
    const matches = (row.matches ?? []).map((match) => ({
      token: match.token,
      problemId: match.problemId,
      problemTitle: titles.get(match.problemId) ?? null,
    }));
    if (matches.length > 0) result.set(row.submissionId, { matches });
  }
  return result;
}

export async function getSignatureFlagForSubmission(
  submissionId: string,
  scope: SignatureFlagViewerScope | null,
): Promise<SignatureFlagView | null> {
  const flags = await getSignatureFlagsForSubmissions([submissionId], scope);
  return flags.get(submissionId) ?? null;
}

/** SQL predicate: the submission row (`submissions`) has a stored flag. */
export function submissionHasSignatureFlagSql(): SQL {
  return exists(
    db
      .select({ one: sql`1` })
      .from(submissionSignatureFlags)
      .where(eq(submissionSignatureFlags.submissionId, submissions.id)),
  );
}

/**
 * SQL predicate for "flagged, and the flag is visible to `scope`", to filter a
 * query over `submissions`.
 */
export function visibleSignatureFlagFilterSql(scope: SignatureFlagViewerScope): SQL {
  if (scope.all) return submissionHasSignatureFlagSql();
  return and(
    submissionHasSignatureFlagSql(),
    inArray(
      submissions.assignmentId,
      db
        .select({ id: assignments.id })
        .from(assignments)
        .where(inArray(assignments.groupId, scope.groupIds)),
    ),
  ) as SQL;
}

/**
 * Per-student, per-problem counts of flagged submissions in a contest, for
 * the manager leaderboard. Callers must have checked canManageContest.
 */
export type ContestSignatureFlagCounts = Record<string, { total: number; problems: Record<string, number> }>;

export async function getContestSignatureFlagCounts(assignmentId: string): Promise<ContestSignatureFlagCounts> {
  const rows = await db
    .select({
      userId: submissions.userId,
      problemId: submissions.problemId,
      count: sql<number>`count(*)::int`,
    })
    .from(submissionSignatureFlags)
    .innerJoin(submissions, eq(submissions.id, submissionSignatureFlags.submissionId))
    .where(eq(submissions.assignmentId, assignmentId))
    .groupBy(submissions.userId, submissions.problemId);

  const counts: ContestSignatureFlagCounts = {};
  for (const row of rows) {
    const entry = (counts[row.userId] ??= { total: 0, problems: {} });
    const count = Number(row.count ?? 0);
    entry.problems[row.problemId] = count;
    entry.total += count;
  }
  return counts;
}
