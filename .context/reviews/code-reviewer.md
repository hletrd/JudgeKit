# code-reviewer — RPF Cycle 10 (2026-06-13)

**HEAD:** 03125b4453653986be9e9e27e7803467feef5362 (main == origin/main, clean tree).
**Baseline gates (executed):** tsc 0 · eslint 0/0 · lint:bash clean · unit 340 files / 2666 tests PASS.

## Method
Built a full inventory of every offset/cap-paged DB listing (`grep -rln "\.offset(" src/app/api src/lib`) and every `orderBy` in the API + lib layer; read each paged route's order clause; diffed the cycle-9 functional changes (2d542442..20d67c03) for regressions; spot-read the highest-risk integrity surfaces (leaderboard, contest-scoring, exam-sessions, recruiting-invitations, accepted-solutions, code-snapshots).

## Findings
**No new actionable code findings.** The cycle-9 deterministic-listing-order sweep is verified complete:
- Every offset/cap-paged listing now carries a unique `id` tiebreak after its non-unique sort key:
  - `submissions/route.ts:171` → `desc(submittedAt), desc(id)` ✓
  - `anti-cheat/route.ts:295` (paged events) → `desc(createdAt), desc(id)` ✓
  - `code-snapshots/[userId]/route.ts:54` → `asc(createdAt), asc(id)` ✓ (cycle-9 AGG9-1)
  - `recruiting-invitations.ts:272` → `createdAt, id` ✓ (cycle-9 AGG9-2)
  - `accepted-solutions/route.ts:58-63` → all 3 sort branches end in `desc(submissions.id)` ✓ (cycle-9 AGG9-3)
  - `export.ts` chunked offset paging → every table's `orderColumns` is `["id"]` (or unique `sessionToken`), inside a REPEATABLE READ snapshot — deterministic ✓
  - audit-logs / login-logs / users / files / problems → `desc(createdAt), desc(id)` ✓ (cycle-7)
- The cycle-9 diff is minimal, correct, well-commented, and introduced no regression.

## Pre-existing, NOT a new regression (no change this cycle)
- `accepted-solutions/route.ts:88` filters `shareAcceptedSolutions` AFTER pagination, so a page can render fewer than `pageSize` rows while `total` (line 52) counts all accepted rows. This is a long-standing privacy-toggle-on-a-join cosmetic count mismatch, deterministic ordering is preserved (id tiebreak), no row shuffle. Not introduced or touched this cycle; not an integrity finding.

## Carried deferrals re-checked
- AGG8-2 (anti-cheat gap scan `limit(5000)` ordered `desc(createdAt)` only, line 324): block UNCHANGED this cycle (last edit 4cf6dfe0, cycle-7). Exit criterion (next edit to the block) did NOT fire. Carry.
- P6-1 (similarity TS fallback normalize/n-gram pre-loop): `code-similarity.ts` NOT edited this cycle (last edit 150b74ed). The O(n²) comparison phase already time-slices + aborts (lines 285-304); residual is only the bounded pre-loop (500-row + 10k-literal caps). Exit criterion (edit to `runSimilarityCheckTS`) did NOT fire. Carry.
