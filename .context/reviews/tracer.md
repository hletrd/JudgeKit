# Tracer — RPF Cycle 9 (2026-06-13)

**HEAD:** da6179f3.

## Trace 1 — snapshot evidence: insert → store → paged read
- **Write:** editor autosave → `POST /api/v1/code-snapshots` → `insert(codeSnapshots)`
  (`code-snapshots/route.ts:79`) with `created_at` defaulting to `new Date()`
  (`schema.pg.ts` `$defaultFn(() => new Date())`). No monotonic sequence column;
  bursts share a millisecond.
- **Read:** instructor → `GET .../code-snapshots/[userId]` →
  `ORDER BY created_at ASC LIMIT n OFFSET k` (`route.ts:54-56`), **no `id`
  tiebreak**. → equal-`created_at` rows reorder between page requests → a
  snapshot can vanish/duplicate at a page boundary. The data layer offers a
  unique `id` (PK) that the read path simply does not use as a tiebreak. Fix:
  add `asc(codeSnapshots.id)`.

## Trace 2 — the cycle-7 sweep's coverage boundary
The AGG7-2 contract test (`listing-order-tiebreak.test.ts`) is an explicit
allow-list of 5 routes. Tracing "which offset-paged listings exist" vs "which the
test guards" shows three uncovered: code-snapshots, recruiting-invitations,
accepted-solutions. The sweep fixed what it enumerated; it did not enumerate
these. This is a coverage-boundary miss, not a regression.

## Token-lifecycle trace (re-verified)
join gate (`access-codes.ts:136` effectiveClose) and token expiry
(`:199` `contestAccessTokenExpiry`) now derive from the same `lateDeadline ??
deadline` — no divergence remains across the 4 insert sites. AGG8-1 closed.
