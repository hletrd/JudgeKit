import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("submission queue status implementation", () => {
  it("adds a queue-status API route that counts earlier queued submissions", () => {
    const source = read("src/app/api/v1/submissions/[id]/queue-status/route.ts");

    expect(source).toContain("const QUEUED_STATUSES = [\"pending\", \"queued\"]");
    expect(source).toContain("lt(submissions.submittedAt, submission.submittedAt ?? new Date(0))");
    expect(source).toContain("queuePosition");
  });

  it("keeps queue hot paths backed by composite submission indexes", () => {
    const schema = read("src/lib/db/schema.pg.ts");
    const migration = read("drizzle/pg/0035_queue_claim_indexes.sql");
    const claimRoute = read("src/app/api/v1/judge/claim/route.ts");

    expect(schema).toContain("submissions_queue_claim_idx");
    expect(schema).toContain("submissions_stale_claim_idx");
    expect(migration).toContain(
      'CREATE INDEX "submissions_queue_claim_idx" ON "submissions" USING btree ' +
        '("status","submitted_at","id")'
    );
    expect(migration).toContain(
      'CREATE INDEX "submissions_stale_claim_idx" ON "submissions" USING btree ' +
        '("status","judge_claimed_at","submitted_at","id")'
    );
    expect(claimRoute).toContain("await Promise.all([");
    expect(claimRoute).toContain("problemPromise");
    expect(claimRoute).toContain("langConfigPromise");
  });

  it("shows queue/judging copy on the submission detail page while a submission is live", () => {
    const source = read("src/components/submissions/submission-detail-client.tsx");

    expect(source).toContain("/api/v1/submissions/${submission.id}/queue-status");
    expect(source).toContain('t("queueAhead", { count: queuePosition ?? 0 })');
    expect(source).toContain('t("judgingInProgress")');
  });
});
