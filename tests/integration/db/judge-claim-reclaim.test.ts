/**
 * Chaos / reliability test: a judge worker dies mid-judge.
 *
 * This is the single most important reliability property of the judge queue:
 * if a worker crashes after claiming a submission, that submission must NOT be
 * stuck forever — another worker must reclaim it after the stale-claim timeout,
 * and the dead worker's late ("zombie") result must NOT be allowed to land and
 * corrupt the leaderboard.
 *
 * To avoid query drift, these tests execute the EXACT production claim SQL via
 * the shared `buildClaimSql` builder, translated with the same
 * `namedToPositional` the runtime uses, against an isolated PostgreSQL test DB.
 *
 * Skipped automatically when no integration PostgreSQL is configured
 * (INTEGRATION_DATABASE_URL / TEST_DATABASE_URL / DATABASE_URL).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { createTestDb, hasPostgresIntegrationSupport, seedUser, seedProblem, seedSubmission, type TestDb } from "../support";
import { buildClaimSql } from "@/lib/judge/claim-query";
// Import the translator from the pool-free module so this gated test never
// pulls in the global pool (which throws when DATABASE_URL is unset) at
// collection time — the suite must skip cleanly with no PG configured.
import { namedToPositional } from "@/lib/db/named-params";
import { judgeWorkers, submissions } from "@/lib/db/schema";

describe.skipIf(!hasPostgresIntegrationSupport)("Judge claim reclaim after worker death (chaos)", () => {
  let testDb: TestDb;
  let userId: string;
  let problemId: string;

  beforeAll(async () => {
    testDb = await createTestDb();
    const user = await seedUser(testDb, { username: `reclaim_${nanoid(6)}` });
    const problem = await seedProblem(testDb, { title: "Reclaim chaos problem" });
    userId = user.id;
    problemId = problem.id;
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  beforeEach(async () => {
    // Deterministic isolation: the claim picks the oldest eligible submission
    // across the whole table, so each test must start with a clean queue.
    await testDb.client.query("DELETE FROM submissions");
    await testDb.client.query("DELETE FROM judge_workers");
  });

  async function insertWorker(id: string, opts: { concurrency?: number; activeTasks?: number } = {}) {
    await testDb.db.insert(judgeWorkers).values({
      id,
      hostname: `${id}.test`,
      status: "online",
      concurrency: opts.concurrency ?? 5,
      activeTasks: opts.activeTasks ?? 0,
    });
  }

  async function insertSubmission(id: string) {
    // Use the canonical seed helper so the row always matches the live schema.
    await seedSubmission(testDb, { id, userId, problemId, status: "pending" });
  }

  /** Run the real production claim SQL as `workerId` with the given stale cutoff. */
  async function runClaim(workerId: string | null, staleClaimTimeoutMs: number) {
    const sql = buildClaimSql(Boolean(workerId));
    const claimToken = nanoid();
    const { text, values } = namedToPositional(sql, {
      claimToken,
      claimCreatedAt: Date.now(),
      staleClaimTimeoutMs,
      workerId,
    });
    const res = await testDb.client.query(text, values);
    return { row: res.rows[0] as Record<string, unknown> | undefined, claimToken };
  }

  /** Force a claimed submission to look like a worker that started judging then died. */
  async function makeClaimStale(submissionId: string, ageMs: number) {
    await testDb.client.query(
      `UPDATE submissions
         SET status = 'judging',
             judge_claimed_at = NOW() - ($1 || ' milliseconds')::interval
       WHERE id = $2`,
      [String(ageMs), submissionId]
    );
  }

  it("reclaims a submission orphaned by a crashed worker after the stale timeout", async () => {
    const subId = `sub_${nanoid(8)}`;
    await insertWorker("worker-A");
    await insertWorker("worker-B");
    await insertSubmission(subId);

    // Worker A claims it.
    const first = await runClaim("worker-A", 1_000);
    expect(first.row?.id).toBe(subId);
    expect(first.row?.status).toBe("queued");
    expect(first.row?.previousStatus).toBe("pending");

    // A starts judging, then crashes: its claim ages past the 1s timeout.
    await makeClaimStale(subId, 10_000);

    // Worker B reclaims the orphaned submission.
    const second = await runClaim("worker-B", 1_000);
    expect(second.row?.id).toBe(subId);
    expect(second.row?.previousStatus).toBe("judging");
    expect(second.claimToken).not.toBe(first.claimToken);

    const [row] = await testDb.db
      .select({ token: submissions.judgeClaimToken, worker: submissions.judgeWorkerId, status: submissions.status })
      .from(submissions)
      .where(eq(submissions.id, subId));
    expect(row.worker).toBe("worker-B");
    expect(row.token).toBe(second.claimToken);
    expect(row.status).toBe("queued");
  });

  it("does NOT reclaim a fresh, actively-judging claim (no double-claim)", async () => {
    const subId = `sub_${nanoid(8)}`;
    await insertWorker("worker-A");
    await insertWorker("worker-B");
    await insertSubmission(subId);

    const first = await runClaim("worker-A", 60_000);
    expect(first.row?.id).toBe(subId);

    // A is actively judging with a FRESH claim (well within the 60s timeout).
    await testDb.client.query(
      `UPDATE submissions SET status = 'judging', judge_claimed_at = NOW() WHERE id = $1`,
      [subId]
    );

    // B must find nothing to claim — the submission is not orphaned.
    const second = await runClaim("worker-B", 60_000);
    expect(second.row).toBeUndefined();

    const [row] = await testDb.db
      .select({ token: submissions.judgeClaimToken, worker: submissions.judgeWorkerId })
      .from(submissions)
      .where(eq(submissions.id, subId));
    expect(row.worker).toBe("worker-A");
    expect(row.token).toBe(first.claimToken);
  });

  it("rejects a zombie worker's stale-token result and counts the reclaim exactly once", async () => {
    const subId = `sub_${nanoid(8)}`;
    await insertWorker("worker-A");
    await insertWorker("worker-B");
    await insertSubmission(subId);

    // A claims, starts judging, then hangs.
    const a = await runClaim("worker-A", 1_000);
    expect(a.row?.id).toBe(subId);
    await makeClaimStale(subId, 10_000);

    // B reclaims with a new token.
    const b = await runClaim("worker-B", 1_000);
    expect(b.row?.id).toBe(subId);
    expect(b.claimToken).not.toBe(a.claimToken);

    // Zombie A wakes up and tries to finalize with its OLD token. This mirrors
    // the poll/route.ts finalize guard (id = $sub AND judge_claim_token = $tok).
    const zombie = await testDb.client.query(
      `UPDATE submissions
         SET status = 'completed', score = 50, judge_claim_token = NULL
       WHERE id = $1 AND judge_claim_token = $2`,
      [subId, a.claimToken]
    );
    expect(zombie.rowCount).toBe(0); // stale token → rejected, no corruption

    // B finalizes with the valid token.
    const finalize = await testDb.client.query(
      `UPDATE submissions
         SET status = 'completed', score = 100, judge_claim_token = NULL
       WHERE id = $1 AND judge_claim_token = $2`,
      [subId, b.claimToken]
    );
    expect(finalize.rowCount).toBe(1);

    // Leaderboard correctness: the IOI ranking takes the per-problem best score
    // (see computeContestRanking / leaderboard.ts). Aggregating the same way
    // must show the reclaimed submission counted exactly once at B's score —
    // never doubled, never inflated by the rejected zombie write.
    const board = await testDb.client.query(
      `SELECT user_id,
              MAX(score) AS best,
              COUNT(*) FILTER (WHERE status = 'completed') AS completed_count
         FROM submissions
        WHERE problem_id = $1
        GROUP BY user_id`,
      [problemId]
    );
    expect(board.rows).toHaveLength(1);
    expect(Number(board.rows[0].best)).toBe(100);
    expect(Number(board.rows[0].completed_count)).toBe(1);

    const [row] = await testDb.db
      .select({ status: submissions.status, score: submissions.score, worker: submissions.judgeWorkerId })
      .from(submissions)
      .where(eq(submissions.id, subId));
    expect(row.status).toBe("completed");
    expect(row.score).toBe(100);
    expect(row.worker).toBe("worker-B");
  });

  it("reclaims via the no-worker claim arm too (parity with the worker arm)", async () => {
    const subId = `sub_${nanoid(8)}`;
    await insertSubmission(subId);
    await makeClaimStale(subId, 10_000); // orphaned 'judging' row, no live worker

    const claimed = await runClaim(null, 1_000);
    expect(claimed.row?.id).toBe(subId);
    expect(claimed.row?.previousStatus).toBe("judging");
    expect(claimed.row?.status).toBe("queued");
  });
});
