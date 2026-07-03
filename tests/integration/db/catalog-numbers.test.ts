/**
 * Ranking-semantics test for getCatalogNumbersForIds (RPF cycle-1 AGG-3).
 *
 * The helper replaced the "fetch every visible problem id per page view"
 * implementation on /problems and /practice with a SQL row_number() window
 * outer-filtered to the page's ids. The numbering CONTRACT it must preserve:
 *   - rank by sequence_number ASC (NULLS LAST, Postgres ASC default),
 *     then created_at ASC;
 *   - rank within the given scope filter only;
 *   - independent of which ids are requested (pagination/filter stable);
 *   - returns entries only for the requested ids.
 *
 * Skipped automatically when no integration PostgreSQL is configured
 * (INTEGRATION_DATABASE_URL / TEST_DATABASE_URL / DATABASE_URL).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../support";
import { getCatalogNumbersForIds } from "@/lib/problems/catalog-numbers";
import { problems } from "@/lib/db/schema";

describe.skipIf(process.env.SKIP_INTEGRATION_TESTS === "1")("getCatalogNumbersForIds ranking semantics", () => {
  let testDb: TestDb;
  // Inserted in scrambled order on purpose; expected catalog order is:
  //   seq 1 (oldest createdAt wins nothing — unique seq), seq 2, seq 5,
  //   then NULL-seq rows by createdAt ASC.
  const ids = {
    seq2: `p_${nanoid(8)}`,
    nullOld: `p_${nanoid(8)}`,
    seq5: `p_${nanoid(8)}`,
    nullNew: `p_${nanoid(8)}`,
    seq1: `p_${nanoid(8)}`,
    hidden: `p_${nanoid(8)}`,
  };

  beforeAll(async () => {
    testDb = await createTestDb();
    const base = Date.parse("2026-01-01T00:00:00Z");
    const rows = [
      { id: ids.seq2, sequenceNumber: 2, createdAt: new Date(base + 5_000), visibility: "public" },
      { id: ids.nullOld, sequenceNumber: null, createdAt: new Date(base + 1_000), visibility: "public" },
      { id: ids.seq5, sequenceNumber: 5, createdAt: new Date(base + 2_000), visibility: "public" },
      { id: ids.nullNew, sequenceNumber: null, createdAt: new Date(base + 9_000), visibility: "public" },
      { id: ids.seq1, sequenceNumber: 1, createdAt: new Date(base + 8_000), visibility: "public" },
      // Excluded by the scope filter — must not shift public ranks.
      { id: ids.hidden, sequenceNumber: 3, createdAt: new Date(base + 3_000), visibility: "hidden" },
    ] as const;
    for (const row of rows) {
      await testDb.db.insert(problems).values({
        id: row.id,
        title: `Catalog ${row.id.slice(0, 6)}`,
        description: "ranking test",
        visibility: row.visibility,
        sequenceNumber: row.sequenceNumber,
        timeLimitMs: 2000,
        memoryLimitMb: 256,
        createdAt: row.createdAt,
        updatedAt: row.createdAt,
      });
    }
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  it("ranks seq ASC NULLS LAST then createdAt ASC, scoped by the filter", async () => {
    const scope = eq(problems.visibility, "public");
    const map = await getCatalogNumbersForIds(Object.values(ids), scope, testDb.db);

    expect(map.get(ids.seq1)).toBe(1);
    expect(map.get(ids.seq2)).toBe(2);
    expect(map.get(ids.seq5)).toBe(3);
    // NULL sequence numbers sort AFTER all numbered rows (ASC default), by createdAt.
    expect(map.get(ids.nullOld)).toBe(4);
    expect(map.get(ids.nullNew)).toBe(5);
    // The hidden row is outside the scope: no rank, and (asserted above by the
    // contiguous 1..5 ranks) it did not shift anyone else's number.
    expect(map.has(ids.hidden)).toBe(false);
  });

  it("is pagination-stable: a subset request returns the SAME ranks as the full request", async () => {
    const scope = eq(problems.visibility, "public");
    const subset = await getCatalogNumbersForIds([ids.seq5, ids.nullOld], scope, testDb.db);

    expect(subset.size).toBe(2);
    expect(subset.get(ids.seq5)).toBe(3);
    expect(subset.get(ids.nullOld)).toBe(4);
  });

  it("returns an empty map without querying for an empty page", async () => {
    const map = await getCatalogNumbersForIds([], undefined, testDb.db);
    expect(map.size).toBe(0);
  });
});
