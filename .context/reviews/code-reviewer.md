# Code Reviewer — RPF Cycle 7 (2026-06-12)

**HEAD reviewed:** 0472b007 (main == origin/main, clean tree).
**Lens executed directly by the cycle agent** (no reviewer subagents registered in this environment — same fallback as cycles 1–6, recorded in `_aggregate.md`).
**Inventory:** full `src/app/api/v1/**` route surface (112 route files), `src/lib/assignments/**`, `src/lib/judge/**`, `src/lib/security/**`, `src/lib/db/**`, cycle-6 diff (22e1510f..0472b007) re-reviewed line-by-line, anti-cheat client/components, docs/api.md cross-checks.
**Baseline gates on this HEAD (executed):** tsc 0 · eslint 0/0 · lint:bash clean · unit 339 files / 2650 tests PASS.

## CR7-1 — Offset-paginated listings still order by a single timestamp key (LOW-MEDIUM, High, CONFIRMED)
Cycle-6 G4 fixed exactly ONE instance (submissions offset listing) of a defect
class that exists in seven other offset-paginated or row-capped listings. All
order by a non-unique timestamp only, so same-timestamp rows shuffle across
pages/exports (Postgres gives no stable order within equal keys):
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:292` — `orderBy(desc(antiCheatEvents.createdAt))`, offset-paginated by BOTH the dashboard and the participant timeline (`limit`/`offset` params, lines 268-269). Same-millisecond events are routine (queued batch flush, multi-user dashboards).
- `src/app/api/v1/admin/audit-logs/route.ts:269` (paged) and `:219` (CSV export row cap — the truncation boundary is nondeterministic too).
- `src/app/api/v1/admin/login-logs/route.ts:129` (paged) and `:93` (CSV cap).
- `src/app/api/v1/users/route.ts:46` — bulk roster imports create many users with identical `createdAt`; the admin user list shuffles across pages.
- `src/app/api/v1/files/route.ts:197`.
- `src/app/api/v1/problems/route.ts:61` and `:131` — bulk problem imports share `createdAt`.
**Failure scenario:** an instructor pages through anti-cheat evidence during a live exam; two same-timestamp rows swap between page 1 and page 2 between requests — one row is shown twice, another never. For the audit-log CSV the exported row set itself is nondeterministic at the cap boundary.
**Fix:** add the table's `id` as a second `desc(...)` key (the exact cycle-6 G4 contract), mirror the `orderBy` arity test pin from `tests/unit/api/submissions.route.test.ts:758-759` for each route, and note the order contract in `docs/api.md` where the endpoint is documented.

## CR7-2 — Anti-cheat dashboard poll-merge drops loaded rows at the page seam; loadMore appends without dedupe or stale-guard (MEDIUM, High, CONFIRMED)
`src/components/contest/anti-cheat-dashboard.tsx`:
- Poll merge (lines 125-148): when the reviewer has loaded >1 page, the 30 s poll replaces the first PAGE_SIZE rows and keeps `prev.slice(PAGE_SIZE)`. If N new events arrived server-side, old rows at indices `PAGE_SIZE-N .. PAGE_SIZE-1` are in NEITHER the fresh first page NOR the preserved tail — **already-loaded evidence rows silently vanish** from the reviewer's screen.
- `loadMore` (lines 161-179) appends `json.data.events` with **no id-dedupe** and **no fetch-sequence guard** — the exact pair of defects cycle-6 G4 fixed in the participant timeline (`participant-anti-cheat-timeline.tsx:136-154`) but not here. Because `offset` is preserved across poll merges (lines 141-148) while the server list shifts, the next page re-contains rows already rendered → duplicate `key={event.id}` rows (line 577): React key-collision warnings + visually duplicated evidence.
**Fix:** mirror the timeline's pattern, adapted to the dashboard's preserve-tail UX: (a) id-union merge on poll (fresh first page first, then ALL previous rows not present in it — no seam loss), `setOffset(merged.length)`; (b) `fetchSeqRef` bump in `fetchEvents`, capture in `loadMore`, discard stale responses; (c) id-dedupe on append. Component tests interleaving poll-merge with an in-flight loadMore.

## CR7-3 — Contest invite re-issue keeps a stale token expiry (LOW, Medium, CONFIRMED logic / limited blast radius)
`src/app/api/v1/contests/[assignmentId]/invite/route.ts:104-119`: the token
insert is `onConflictDoNothing`, so re-inviting a user whose token row already
exists does NOT refresh `expiresAt` to the current effective close. Since
cycle-6 made expiry uniformly enforced, a pre-existing row stamped with an
older (or pre-cycle-6 `deadline`-based) expiry stays stale. Blast radius is
limited because the same POST upserts the `enrollments` row (lines 121-130)
and every gate accepts enrollment OR a valid token — but the row now
misstates the invariant the module documents ("token expiry = effective
close", `contest-access-tokens.ts:93-104`).
**Fix:** `onConflictDoUpdate` refreshing `expiresAt: contestAccessTokenExpiry(assignment)` (leave `redeemedAt`/`ipAddress` untouched). Pairs with SEC7-1 (schedule-edit sync) — one invariant, all lifecycle points.

## Clean checks (explicitly verified, no findings)
- `contest-access-tokens.ts` module itself: validity rule, DB-clock contract, in-tx revocation — sound; both creation sites verified to also insert enrollments (recruiting-invitations.ts:675-692, invite route:104-131).
- Community vote toggle transaction (votes/route.ts:93-141) — TOCTOU-safe, self-vote guarded.
- Files bulk-delete (DB-first, best-effort disk, audited) — sound.
- Judge claim CTE chain (claim-query.ts) — invariants documented and intact; heartbeat route + staleness sweep refactor consistent.
- `exam-sessions.ts` idempotent start + SQL-composed extension — sound.
- Final sweep: re-grepped all `.orderBy(` call sites for the CR7-1 class (the 7 listed are exhaustive for offset/cap consumers; `admin/workers/route.ts:34` is a single-page fleet list — not paginated, excluded deliberately).
