# Code Reviewer — RPF Cycle 9 (2026-06-13)

**HEAD reviewed:** da6179f3 (main == origin/main, clean tree).
**Baseline gates:** tsc 0 · eslint 0/0 · lint:bash clean · unit 340 files / 2663 PASS.
**Method:** full src inventory (610 ts/tsx). Focus: what the cycle-7 deterministic
listing-order sweep ("7 sibling routes", commit 4cf6dfe0) and cycle-8 token sweep
left behind. Validated behavior from code, not comments.

## CR9-1 — code-snapshot evidence timeline paginates by `createdAt` only, no unique tiebreak (MEDIUM, High, CONFIRMED)
**File:** `src/app/api/v1/contests/[assignmentId]/code-snapshots/[userId]/route.ts:54`
```
.orderBy(asc(codeSnapshots.createdAt))   // no desc(id)/asc(id) tiebreak
.limit(limit).offset(offset)             // offset-paginated, default 50 / max 200
```
The `code_snapshots` table (`schema.pg.ts:1007`) has a `nanoid` PK `id` and a
plain `created_at` index (`cs_created_at_idx`). Snapshots are POSTed one row at a
time by the editor's autosave (`/api/v1/code-snapshots`, insert at
`code-snapshots/route.ts:79`) with `created_at` defaulting to `new Date()` — so
**multiple snapshots from rapid editing land in the same millisecond.** Postgres
gives no stable order among equal `created_at` rows, and it can choose a
different order per query, so an instructor paging a candidate's snapshot
timeline can see a row **duplicated across page N/N+1 or dropped at the seam.**
This is the *exact* class cycle-7 (4cf6dfe0) fixed for 7 sibling routes — this
anti-cheat evidence route was missed, and it is MORE collision-prone than the
heartbeat scan deferred as AGG8-2 (heartbeats are ~60 s apart; snapshots cluster).
**Fix:** append `asc(codeSnapshots.id)` to the orderBy.

## CR9-2 — recruiting-invitation list paginates by `createdAt` only, no tiebreak (MEDIUM, High, CONFIRMED)
**File:** `src/lib/assignments/recruiting-invitations.ts:272`
```
.orderBy(recruitingInvitations.createdAt)   // single column, asc
.limit(limit).offset(offset)                // limit ≤ 500, offset paged (lines 247-248,273-274)
```
`recruiting_invitations.id` is the nanoid PK. A recruiter paging the candidate
list (or any consumer requesting page 2+) can get an invitation duplicated or
skipped at a page boundary when two invitations were created in the same
instant (bulk CSV invite import creates many rows fast). Same seam-loss class as
CR9-1 and the cycle-7 sweep. **Fix:** append `, recruitingInvitations.id`
(asc) to the orderBy.

## CR9-3 — public accepted-solutions list: all 3 sort modes lack a unique tiebreak (MEDIUM, Medium, CONFIRMED)
**File:** `src/app/api/v1/problems/[id]/accepted-solutions/route.ts:54-59`, offset-paged (`offset = (page-1)*pageSize` line 34, `.offset(offset)` line 80).
- `newest` → `desc(submittedAt)` alone;
- `shortest` → `[asc(octet_length(...)), desc(submittedAt)]`;
- `fastest` → `[asc(coalesce(executionTimeMs,…)), desc(submittedAt)]`.
None ends in a unique column, so equal-key rows (same length / same time / same
submittedAt) reorder nondeterministically across pages → dup/skip at the seam on
the public solution browser. **Fix:** append `desc(submissions.id)` as the final
clause of every branch.

## Provenance / no-new-finding lenses
Token-lifecycle theme (cycles 6–8) is fully converged: all 4 contest-access-token
insert/upsert sites (`access-codes.ts:199`, `invite/route.ts:115,124`,
`recruiting-invitations.ts:691`) and the schedule-edit sync route through the
single `contestAccessTokenExpiry()` owner; AGG8-1 fix verified at line 199.
The deferred AGG8-2 gap-scan (`anti-cheat/route.ts:316-325`) and P6-1 similarity
fallback are UNCHANGED this cycle — exit criteria not fired.

**Confidence:** CR9-1/CR9-2 High (offset-paged, non-unique sort key, established
class). CR9-3 Medium (same mechanism; lower-traffic surface). All three are
correctness on listing endpoints — not deferrable.
