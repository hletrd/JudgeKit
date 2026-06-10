import { describe, expect, it } from "vitest";
import { buildClaimSql } from "@/lib/judge/claim-query";

describe("buildClaimSql active_tasks accounting", () => {
  it("releases the previous worker's active_tasks slot when reclaiming a stale submission", () => {
    const sql = buildClaimSql(true);
    // The candidate must capture the prior owner so the reclaim can release it.
    expect(sql).toContain("s.judge_worker_id AS previous_worker_id");
    expect(sql).toContain("prev_worker_release");
    // Decrement (floored at 0), only for a DISTINCT prior owner that exists.
    expect(sql).toContain("GREATEST(jw.active_tasks - 1, 0)");
    expect(sql).toContain("c.previous_worker_id IS NOT NULL");
    expect(sql).toContain("c.previous_worker_id <> @workerId");
  });

  it("still bumps the claiming worker's active_tasks", () => {
    expect(buildClaimSql(true)).toContain("active_tasks = active_tasks + 1");
  });

  it("compensates the bump when the worker reclaims ITS OWN stale submission", () => {
    // prev_worker_release must exclude the self case (Postgres forbids two
    // modifying CTEs updating the same judge_workers row in one statement),
    // so the compensation has to live inside worker_bump's SET expression:
    // a self-reclaim nets active_tasks + 1 - 1 = unchanged. Without this the
    // worker leaks +1 capacity per self-reclaim (only a restart heals it).
    const sql = buildClaimSql(true);
    const bumpCte = sql.slice(sql.indexOf("worker_bump"));
    expect(bumpCte).toContain("active_tasks = active_tasks + 1 - (");
    expect(bumpCte).toContain("c.previous_worker_id = @workerId");
  });
});
