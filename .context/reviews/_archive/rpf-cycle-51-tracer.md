# Cycle 51 — Tracer

**Date:** 2026-04-23
**Base commit:** 778a019f
**Reviewer:** tracer

## Causal Tracing of Key Flows

### Flow 1: Recruiting Token Redemption

**Path:** `redeemRecruitingToken()` → `db.transaction()` → read invitation → validate status/expiry → create user + enroll + access token → atomic claim via `UPDATE WHERE status='pending' AND (expires_at IS NULL OR expires_at > NOW())`

**Hypothesis 1 (Clock Skew):** If app-server time and DB-server time diverge, the atomic SQL WHERE clause uses `NOW()`, making it the authoritative check. The JS-side does not check expiry, avoiding TOCTOU.
**Verdict:** Clock-skew-safe by design.

**Hypothesis 2 (Concurrent Redeem):** Two requests redeem the same token simultaneously. The `FOR UPDATE` row lock in the transaction ensures serialization. The second request finds `status != 'pending'` and the UPDATE returns 0 rows, throwing "alreadyRedeemed".
**Verdict:** Race-safe by design.

### Flow 2: ICPC Leaderboard Sort

**Path:** `computeContestRanking()` → raw SQL query → group by user → build entries → sort by (solvedCount DESC, totalPenalty ASC, lastAcTime ASC, userId ASC) → assign ranks

**Hypothesis (Non-deterministic Sort):** Two users with identical solved count, penalty, and last AC time could swap positions across page loads. The `userId.localeCompare()` tie-breaker at `contest-scoring.ts:358` ensures deterministic ordering.
**Verdict:** Deterministic. No issue.

### Flow 3: Anti-Cheat Heartbeat with Shared Coordination

**Path:** POST `/api/v1/contests/[assignmentId]/anti-cheat` → `usesSharedRealtimeCoordination()` → `shouldRecordSharedHeartbeat()` → advisory lock → check lastAttempt → insert/update with DB time

**Hypothesis (Lost Heartbeat):** If the advisory lock contention delays a heartbeat beyond the 60-second interval, the heartbeat is simply recorded late. No data loss, but the gap detection may show a false positive.
**Verdict:** Acceptable — false-positive gaps are less harmful than missed heartbeats.

### Flow 4: Leaderboard Freeze

**Path:** `computeLeaderboard()` → read freezeLeaderboardAt → compare with `Date.now()` → if frozen, compute ranking with `cutoffSec`

**Hypothesis (Clock Skew on Freeze Boundary):** The `Date.now()` comparison at `leaderboard.ts:53` could be off by up to a few hundred ms from the DB server's NOW(). If the freeze time is exactly at the boundary, a student might see live data for one extra request or frozen data one request early. This is a very narrow window and the consequence is minimal (student sees slightly stale or slightly fresh data).
**Verdict:** Known deferred item (AGG-2 from cycle 49). LOW risk.

## Findings

No new findings this cycle. All traced flows are correct and well-protected against the identified risk vectors.
