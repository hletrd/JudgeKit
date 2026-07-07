import { inArray, sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { problems } from "@/lib/db/schema";

/**
 * Stable per-problem catalog numbers, computed in SQL for ONLY the page's rows.
 *
 * A problem's displayed number is its rank within the viewer's visible scope
 * (`scopeFilter`; `undefined` = the whole catalog) by the canonical catalog
 * order: `sequence_number ASC` (Postgres ASC default = NULLS LAST), then
 * `created_at ASC`. The rank is independent of search/tag/progress filters and
 * of pagination, so a problem keeps its number on every page and filter view.
 *
 * Previously both `/problems` and `/practice` fetched the id of EVERY visible
 * problem on EVERY page view and built a whole-catalog JS Map to label ~20
 * rows (RPF cycle-1 AGG-3). The `row_number()` window in a CTE, outer-filtered
 * by the page ids, transfers at most `pageIds.length` rows with identical
 * numbering semantics.
 *
 * IMPORTANT: keep the window's ORDER BY byte-identical in semantics to the
 * catalog display order used by the pages — both must say "sequence_number
 * ASC, created_at ASC" with default NULLS handling. Changing one without the
 * other desynchronizes the displayed numbers from the display order.
 */
export async function getCatalogNumbersForIds(
  pageIds: readonly string[],
  scopeFilter?: SQL,
  dbOverride?: NodePgDatabase<Record<string, unknown>>
): Promise<Map<string, number>> {
  if (pageIds.length === 0) return new Map();

  // Lazy global-db resolution: importing "@/lib/db" at module scope creates
  // the pool (and throws without DATABASE_URL), which would break collection
  // of the env-gated integration test for this module. Same pattern as
  // tests/integration/db/judge-claim-reclaim.test.ts documents for
  // named-params. The dynamic import is cached after first resolution.
  const dbi =
    dbOverride ??
    ((await import("@/lib/db")).db as unknown as NodePgDatabase<Record<string, unknown>>);

  const ranked = dbi.$with("catalog_ranked").as(
    dbi
      .select({
        id: problems.id,
        // problems.id is the deterministic final tiebreaker: without it, rows
        // tied on (sequenceNumber, createdAt) could swap catalog numbers
        // between renders (RPF cycle-1 PR-L3).
        rank: sql<number>`row_number() over (order by ${problems.sequenceNumber} asc, ${problems.createdAt} asc, ${problems.id} asc)`.as(
          "catalog_rank"
        ),
      })
      .from(problems)
      .where(scopeFilter)
  );

  const rows = await dbi
    .with(ranked)
    .select({ id: ranked.id, rank: ranked.rank })
    .from(ranked)
    .where(inArray(ranked.id, [...pageIds]));

  return new Map(rows.map((row) => [row.id, Number(row.rank)] as const));
}
