# Code Reviewer — Cycle 3 Review

## C3-CR-1: `getParticipantTimeline` lacks transaction isolation

**File:** `src/lib/assignments/participant-timeline.ts:94-184`
**Severity:** MEDIUM | Confidence: High

The function fires 8 parallel DB queries via `Promise.all` without wrapping them in a transaction. Each query reads from a potentially changing database state. Without transaction isolation:
- A new submission inserted after the submissions query but before the snapshots query would result in a timeline event referencing a submission that has no corresponding snapshot at that exact moment (or vice versa).
- The anti-cheat event count could diverge from the actual submissions shown.
- The participant metadata (exam session, contest access) could reflect a state different from the submissions.

**Fix:** Wrap the `Promise.all` in `db.transaction(async (tx) => { ... })` and use `tx` instead of `db` for all 8 queries.

---

## C3-CR-2: `rawQueryOne` inside transaction uses global pool

**File:** `src/lib/assignments/exam-sessions.ts:52`
**Severity:** MEDIUM | Confidence: High

Inside `db.transaction(async (tx) => { ... })`, line 52 calls `rawQueryOne("SELECT NOW()::timestamptz AS now")`. The `rawQueryOne` function in `src/lib/db/queries.ts` always uses the global `pool.query()`, not the transaction client. This means the time query executes outside the transaction. While `SELECT NOW()` is mostly harmless, this pattern indicates a systemic issue: any raw SQL helper called inside a transaction silently bypasses transaction isolation.

**Fix:** Add an optional `client` parameter to `rawQueryOne`/`rawQueryAll` so callers inside transactions can pass the transaction client. Or use `tx.execute()` / Drizzle's raw query method when inside transactions.

---

## C3-CR-3: Source-inspection tests masquerade as logic tests

**File:** `tests/unit/assignments/participant-timeline-logic.test.ts`
**Severity:** MEDIUM | Confidence: High

The entire test file reads the source code as strings and checks for substring presence. It never exercises any actual function logic. This provides zero confidence that the code works correctly — it only verifies that certain text exists in the file. The comment acknowledges this is intentional but the file should be replaced with real unit tests that mock the DB layer and exercise the transformation logic.

**Fix:** Rewrite with `vi.mock("@/lib/db")` to mock Drizzle queries, then call `getParticipantTimeline` with mocked data and assert on the returned structure.

---

## C3-CR-4: Silent data truncation in timeline queries

**File:** `src/lib/assignments/participant-timeline.ts:163,175`
**Severity:** LOW | Confidence: High

Submissions query has `.limit(5000)` and snapshots query has `.limit(1000)`. For extremely active participants, data is silently truncated with no indication to the caller. The summary counts (totalAttempts, snapshotCount) would then be inconsistent with the actual timeline events.

**Fix:** Either remove limits (if performance is acceptable), add pagination, or return a `truncated: true` flag so the UI can warn the user.

---

## C3-CR-5: Duplicate scoring logic between contest-scoring.ts and leaderboard.ts

**File:** `src/lib/assignments/leaderboard.ts:118-176`, `src/lib/assignments/contest-scoring.ts`
**Severity:** MEDIUM | Confidence: High

`computeSingleUserLiveRank` reimplements ICPC and IOI scoring logic in raw SQL that mirrors the logic in `computeContestRanking`. Any scoring rule change must be updated in both places or rankings will diverge.

**Fix:** Extract the common SQL building blocks into shared helpers, or have `computeSingleUserLiveRank` call `computeContestRanking` and extract the single user's rank from the full result.
