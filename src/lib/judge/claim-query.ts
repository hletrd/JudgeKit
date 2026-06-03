/**
 * Atomic judge-claim SQL builder.
 *
 * Extracted verbatim from `src/app/api/v1/judge/claim/route.ts` so the exact
 * production query can be exercised by integration/chaos tests without query
 * drift. The route and the tests MUST share this single source of truth.
 *
 * Named parameters (resolved by `namedToPositional` / `rawQueryOne`):
 *   @workerId            — claiming worker id (only used when hasWorker=true)
 *   @claimToken          — fresh claim token (nanoid) written to the row
 *   @claimCreatedAt      — DB-server epoch ms for judge_claimed_at (clock-skew safe)
 *   @staleClaimTimeoutMs — reclaim cutoff; a 'queued'/'judging' row whose
 *                          judge_claimed_at is older than NOW() - this interval
 *                          is considered orphaned (its worker died) and is
 *                          re-claimable. This is the self-healing property that
 *                          guarantees no submission stays stuck when a worker
 *                          crashes mid-judge.
 *
 * Concurrency safety:
 *   - `FOR UPDATE SKIP LOCKED` on the candidate prevents two workers from
 *     claiming the same row.
 *   - The fresh @claimToken is the optimistic-lock fence: a resurrected zombie
 *     worker can only finalize a submission whose judge_claim_token still
 *     matches the token it was handed (see poll/route.ts), so a reclaimed
 *     submission cannot be double-written.
 */
export function buildClaimSql(hasWorker: boolean): string {
  if (hasWorker) {
    return `
        WITH worker_slot AS (
          SELECT id
          FROM judge_workers
          WHERE id = @workerId
            AND status = 'online'
            AND active_tasks < concurrency
          FOR UPDATE
        ),
        candidate AS (
          SELECT
            s.id,
            s.status AS previous_status,
            s.judge_worker_id AS previous_worker_id
          FROM submissions s
          INNER JOIN problems p ON p.id = s.problem_id
          WHERE EXISTS (SELECT 1 FROM worker_slot)
            AND (s.status = 'pending'
              OR (s.status IN ('queued', 'judging')
                  AND s.judge_claimed_at < NOW() - (@staleClaimTimeoutMs || ' milliseconds')::interval))
            AND COALESCE(p.problem_type, 'auto') != 'manual'
          ORDER BY s.submitted_at ASC, s.id ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        ),
        claimed AS (
          UPDATE submissions AS s
          SET
            status = 'queued',
            judge_claim_token = @claimToken,
            judge_claimed_at = to_timestamp(@claimCreatedAt::double precision / 1000),
            judge_worker_id = @workerId
          FROM candidate
          WHERE s.id = candidate.id
          RETURNING
            s.id,
            s.user_id AS "userId",
            s.problem_id AS "problemId",
            s.assignment_id AS "assignmentId",
            candidate.previous_status AS "previousStatus",
            s.judge_claim_token AS "claimToken",
            s.language,
            s.source_code AS "sourceCode",
            s.status,
            s.compile_output AS "compileOutput",
            s.execution_time_ms AS "executionTimeMs",
            s.memory_used_kb AS "memoryUsedKb",
            s.score,
            EXTRACT(EPOCH FROM s.judged_at)::bigint AS "judgedAt",
            EXTRACT(EPOCH FROM s.submitted_at)::bigint AS "submittedAt"
        ),
        prev_worker_release AS (
          -- Reclaiming a stale submission: it was still counted against its
          -- previous (now-unresponsive) worker's active_tasks. Release that slot
          -- so the dead worker's capacity counter does not leak permanently.
          -- Only fires when a distinct prior owner exists and the row was claimed;
          -- a fresh 'pending' claim has previous_worker_id = NULL and is skipped.
          UPDATE judge_workers AS jw
          SET active_tasks = GREATEST(jw.active_tasks - 1, 0)
          FROM candidate c
          WHERE jw.id = c.previous_worker_id
            AND c.previous_worker_id IS NOT NULL
            AND c.previous_worker_id <> @workerId
            AND EXISTS (SELECT 1 FROM claimed)
          RETURNING jw.id
        ),
        worker_bump AS (
          UPDATE judge_workers
          SET active_tasks = active_tasks + 1
          WHERE id = @workerId
            AND EXISTS (SELECT 1 FROM claimed)
          RETURNING id
        )
        SELECT * FROM claimed
      `;
  }

  return `
        WITH candidate AS (
          SELECT
            s.id,
            s.status AS previous_status
          FROM submissions s
          INNER JOIN problems p ON p.id = s.problem_id
          WHERE (s.status = 'pending'
             OR (s.status IN ('queued', 'judging')
                 AND s.judge_claimed_at < NOW() - (@staleClaimTimeoutMs || ' milliseconds')::interval))
            AND COALESCE(p.problem_type, 'auto') != 'manual'
          ORDER BY s.submitted_at ASC, s.id ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        UPDATE submissions AS s
        SET
          status = 'queued',
          judge_claim_token = @claimToken,
          judge_claimed_at = to_timestamp(@claimCreatedAt::double precision / 1000),
          judge_worker_id = @workerId
        FROM candidate
        WHERE s.id = candidate.id
        RETURNING
          s.id,
          s.user_id AS "userId",
          s.problem_id AS "problemId",
          s.assignment_id AS "assignmentId",
          candidate.previous_status AS "previousStatus",
          s.judge_claim_token AS "claimToken",
          s.language,
          s.source_code AS "sourceCode",
          s.status,
          s.compile_output AS "compileOutput",
          s.execution_time_ms AS "executionTimeMs",
          s.memory_used_kb AS "memoryUsedKb",
          s.score,
          EXTRACT(EPOCH FROM s.judged_at)::bigint AS "judgedAt",
          EXTRACT(EPOCH FROM s.submitted_at)::bigint AS "submittedAt"
      `;
}
