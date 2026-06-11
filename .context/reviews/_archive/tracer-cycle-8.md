# Tracer — Cycle 8 (Loop 8/100)

**Date:** 2026-04-24
**HEAD commit:** c5644a05

## Methodology

Causal tracing of suspicious flows, competing hypotheses, and data-flow verification. Traced auth, recruiting token, SSE, and compiler execution paths end-to-end.

## Findings

**No new findings this cycle.**

### Traces Verified

1. **Login flow (credentials → JWT → session)**:
   - `authorize()` → `consumeRateLimitAttemptMulti()` → `verifyAndRehashPassword()` → `createSuccessfulLoginResponse()` → JWT callback → `syncTokenWithUser()` → `getDbNowMs()` for `authenticatedAt`
   - **Trace: CORRECT.** All temporal comparisons use DB time.

2. **Recruiting token redemption**:
   - `authorizeRecruitingToken()` → `redeemRecruitingToken()` → transaction: read invitation → validate → create user → enroll → insert access token → atomic `UPDATE ... WHERE status = 'pending' AND expiresAt > NOW()` → `RETURNING`
   - **Trace: CORRECT.** Atomic claim prevents double-redemption. DB time used throughout.

3. **SSE submission events**:
   - `GET` → auth check → rate limit → connection tracking → `subscribeToPoll()` → shared poll timer → status dispatch → terminal result → `close()` → `removeConnection()` or `releaseSharedSseConnectionSlot()`
   - **Trace: CORRECT.** Connection cleanup on abort, timeout, and terminal state all properly release resources.

4. **Compiler execution**:
   - `executeCompilerRun()` → try Rust runner → fallback to local Docker → `executeInDocker()` → `spawn("docker", ...)` → stdout/stderr truncation → timeout → cleanup
   - **Trace: CORRECT.** Output bounded at 4 MiB, timeout enforced, container cleanup fire-and-forget.

5. **Data retention cleanup**:
   - `pruneSensitiveOperationalData()` → `DATA_RETENTION_LEGAL_HOLD` check → batch deletes with delays → `getRetentionCutoff(days, Date.now())`
   - **Trace: ACCEPTABLE.** Uses `Date.now()` for cutoff calculation, which is consistent (comparing against `createdAt` timestamps that were also written with app-server time).

### Competing Hypotheses Tested

- **Hypothesis: Recruiting token could be redeemed twice** — DISPROVED. The atomic SQL `UPDATE ... WHERE status = 'pending'` with `RETURNING` prevents double-redemption at the database level.

- **Hypothesis: SSE connections could leak** — DISPROVED. Every path (abort, timeout, terminal state, close) calls `removeConnection()` or `releaseSharedSseConnectionSlot()`. The stale cleanup timer evicts connections older than `sseTimeoutMs + 30s`.

- **Hypothesis: Compiler output could grow unbounded** — DISPROVED. Stream destruction and `MAX_OUTPUT_BYTES` truncation prevent unbounded growth.

## Files Reviewed

All critical path files as traced above.
