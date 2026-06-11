# Tracer Review — RPF Cycle 4 (Loop 4/100)

**Date:** 2026-04-24
**Reviewer:** tracer
**Base commit:** a717b371

## Traced Flows

### Flow 1: Judge Claim → Stale Claim Detection

```
POST /api/v1/judge/claim
  → isJudgeIpAllowed (IP allowlist check)
  → consumeUserApiRateLimit (rate limiting)
  → isJudgeAuthorized / isJudgeAuthorizedForWorker (auth)
  → Worker existence + status check
  → Worker secret validation (safeTokenCompare)
  → getDbNowUncached().getTime() → claimCreatedAt [FIXED - was Date.now()]
  → Raw SQL: FOR UPDATE SKIP LOCKED → atomic claim
  → Stale claim detection: judge_claimed_at < NOW() - interval
  → recordAuditEvent
  → Fetch problem + test cases + language config
  → Return claimed submission
```

**Verdict:** Flow is correct. The `getDbNowUncached()` fix ensures that `claimCreatedAt` is DB-consistent with the `NOW()` used in stale claim detection. No clock-skew race.

### Flow 2: SSE Connection Lifecycle

```
GET /api/v1/submissions/[id]/events
  → getApiUser (auth)
  → consumeApiRateLimit
  → acquireSharedSseConnectionSlot (if shared coordination)
     → withPgAdvisoryLock → getDbNowUncached() → insert rateLimits row
  OR addConnection (if process-local)
  → canAccessSubmission (authorization)
  → ReadableStream with:
     → subscribeToPoll (shared polling)
     → Auth re-check every 30s
     → Timeout after sseTimeoutMs
     → close() → unsubscribeFromPoll → releaseSharedSseConnectionSlot/removeConnection
```

**Verdict:** Flow is correct. Connection cleanup happens via abort signal, timeout, and auth re-check. The `userConnectionCounts` map ensures O(1) per-user connection counting.

### Flow 3: Rate Limit (Two-Tier: Sidecar + DB)

```
consumeApiRateLimit
  → sidecarConsume (fast path)
     → sidecarCheck → returns allowed/!allowed/null
     → null = sidecar unreachable → fallback to DB
  → atomicConsumeRateLimit (DB path)
     → Date.now() → now [DEFERRED - known carry-over]
     → SELECT FOR UPDATE → check attempts/window/blockedUntil
     → INSERT or UPDATE rateLimits
  → rateLimitedResponse (429 with headers)
```

**Verdict:** Flow is correct. The `Date.now()` in `atomicConsumeRateLimit` is a known carry-over (AGG-2). The sidecar null-fallback is correct (never fail-closed).

### Flow 4: Anti-Cheat Event Logging

```
POST /api/v1/contests/[assignmentId]/anti-cheat
  → createApiHandler (auth + CSRF + rate limit + validation)
  → getContestAssignment + exam mode check
  → Access check (enrollments + access tokens)
  → SELECT NOW() → now (DB server time for boundary checks)
  → Heartbeat dedup: usesSharedRealtimeCoordination → DB-backed or Date.now()-LRU
  → INSERT antiCheatEvents
```

**Verdict:** Flow is correct. DB time is used for contest boundary checks. The `Date.now()` in the process-local heartbeat dedup LRU is a known carry-over (SEC-2) but is acceptable for in-memory operations.

## New Findings

**No new findings from causal tracing this cycle.** All traced flows are correct. The judge claim flow is verified fixed. The rate-limit `Date.now()` flow is a known carry-over with documented rationale.
