# Verifier — RPF Cycle 9 (2026-06-13)

**HEAD:** da6179f3. Gates executed on review HEAD: tsc 0 · eslint 0/0 ·
lint:bash clean · unit 340 files / 2663 tests PASS.

## V9-1 — confirm CR9-1/2/3 are offset-paged with non-unique sort keys (CONFIRMED)
Verified from code (not comments):
- `code-snapshots/[userId]/route.ts`: `parsePagination` → `offset` (line 20),
  `.orderBy(asc(codeSnapshots.createdAt))` (54), `.offset(offset)` (56). `id` is
  the nanoid PK (`schema.pg.ts:1011`). **Offset-paged, non-unique sort key →
  confirmed seam-loss risk.**
- `recruiting-invitations.ts`: `offset` (248), `.orderBy(...createdAt)` (272),
  `.offset(offset)` (274). Confirmed.
- `accepted-solutions/route.ts`: `offset = (page-1)*pageSize` (34),
  `.orderBy(...orderByClause)` (78) where no branch ends in a unique column,
  `.offset(offset)` (80). Confirmed.

## V9-2 — token-lifecycle invariant holds (CONFIRMED)
All 4 token insert/upsert sites use `contestAccessTokenExpiry(assignment)`;
`assignment` loads include both `deadline` and `lateDeadline` at each site
(access-codes 120-121, invite, recruiting-invitations 625-626). AGG8-1 fix at
`access-codes.ts:199` verified.

## Test-gap note
No existing unit test pins the listing order of the three CR9 routes. A red-first
test should capture the `.orderBy(...)` arguments (or assert stable ordering
across a simulated page seam with equal-timestamp fixtures) and assert the `id`
tiebreak is present — mirrors the cycle-7 route tests. See test-engineer.md.

## Deferred register
AGG8-2 and P6-1 exit criteria NOT fired (no edit to either block this cycle).
