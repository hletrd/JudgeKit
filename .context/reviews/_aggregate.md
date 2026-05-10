# Aggregate Review — Cycle 43 (RPF Loop)

**Date:** 2026-05-10
**Reviewers:** comprehensive-reviewer (single-agent review, subagent spawning unavailable)
**Total findings:** 1 new (1 LOW) + 0 false positives + all prior deferred items re-validated

---

## Deduplicated Findings

### C43-1: [LOW] Audit flush timer lacks stop function for test teardown

**File:** `src/lib/audit/events.ts:142-151`
**Confidence:** HIGH

The `_flushTimer` (a `setInterval` for flushing buffered audit events) is created in `ensureFlushTimer()` but has no corresponding exported `stopAuditFlushTimer()` function. This is the exact same pattern that was fixed for the rate-limit eviction timer in cycle 34 (commit adding `stopRateLimitEviction()`).

**Why it matters:**
- The timer uses `.unref()`, so it will not block process exit in production
- However, in test environments, Vitest may report open handles after test completion
- Unlike `startSensitiveDataPruning()` / `stopSensitiveDataPruning()`, the audit flush timer is module-level and starts on first `recordAuditEvent()` call

**Fix:** Add an exported `stopAuditFlushTimer()` function that clears `_flushTimer` and sets it to null.

```typescript
export function stopAuditFlushTimer() {
  if (_flushTimer) {
    clearInterval(_flushTimer);
    _flushTimer = null;
  }
}
```

---

## Previously Fixed Items (confirmed in current code)

All cycle 42 fixes verified:
- Cycle 42 was documentation-only (no code changes)

All cycle 41 fixes verified:
- No code changes in cycle 41 (documentation only)

All cycle 40 fixes verified:
- DEFER-36: `formData.get()` cast assertions — FIXED in login-form.tsx and change-password-form.tsx
- Export.ts pre-abort signal check — ADDED in cycle 39, verified in cycles 40-43

All cycle 39 fixes verified:
- AGG-1 (cycle 39): Docker build stderr sanitized
- AGG-2 (cycle 39): `participant-status.ts` `Date.now()` default removed
- AGG-3 (cycle 39): `JUDGE_WORKER_URL` guard added

All cycle 38 fixes verified:
- AGG-3 (cycle 38): `db/import.ts` error messages sanitized
- AGG-4 (cycle 38): Anti-cheat monitor text content capture removed

**Also confirmed fixed since cycle 42 review (April 25):**
- Cycle 43 NEW-1 (April 25): `recruit_` username prefix removed from recruiting-invitations.ts
- Cycle 43 NEW-2 (April 25): Contest scoring background refresh now uses `Date.now()` fallback for cooldown timestamp
- Cycle 43 NEW-3 (April 25): Already-redeemed recruiting path now checks assignment deadline via SQL `NOW()`
- Cycle 43 NEW-4 (April 25): Docker build uses head+tail buffer strategy instead of string accumulation
- Cycle 43 NEW-5 (April 25): In-memory rate limiter removed entirely
- Cycle 43 NEW-6 (April 25): Recruiting ALS store mutation is documented as intentional single-user-per-request design

---

## Carried Deferred Items (unchanged from cycle 42)

All deferred items from cycles 25-41 remain unchanged in status. See `_aggregate-cycle-40.md` for the full list.

| Category | Count | Status |
|----------|-------|--------|
| CRITICAL | 3 | Unchanged |
| HIGH | 1 | Unchanged |
| MEDIUM | 5 | Unchanged |
| LOW | 12+ | Unchanged |

---

## No Agent Failures

Single comprehensive review completed successfully. Subagent spawning was unavailable in this environment; review was performed by the primary agent.

---

## Security Observations (No New Issues)

1. File upload validation remains strong: MIME whitelist + magic bytes + ZIP bomb protection + image processing.
2. Judge claim route properly implements IP allowlist, rate limiting, worker auth, atomic SQL claims.
3. Docker client has path traversal prevention and image reference validation.
4. API handler factory consistently applies auth, CSRF, rate limiting, and Zod validation.
5. Recruiting token validation uses bounded regex to prevent ReDoS.
6. Backup/restore requires password re-confirmation and verifies integrity manifest.
7. Export redaction properly merges sanitized and always-redact column maps via explicit Set union.
8. IP extraction uses proper hop validation (`TRUSTED_PROXY_HOPS`).

## Correctness Observations (No New Issues)

1. Timer cleanup: All examined components clear timers and event listeners on unmount.
2. Error handling: `apiFetchJson` correctly catches network errors and logs parse failures in development.
3. Type safety: No new unsafe type assertions found beyond previously deferred items.
4. React patterns: Ref patterns in anti-cheat monitor are sound.
5. SSE fallback: `useSubmissionPolling` correctly falls back from SSE to fetch polling.
6. Data retention: Uses `getDbNowMs()` for cutoffs, avoiding clock skew.

## Performance Observations (No New Issues)

1. No memory leaks detected: All refs with timers/event listeners have proper cleanup.
2. Fetch patterns: External API calls use `AbortSignal.timeout()`. Internal calls use `apiFetch` with 30s timeout.
3. DB queries: The `getDbNow()` cache deduplicates DB time queries within a single render.
4. Rate limit eviction: Has proper lifecycle management with `stopRateLimitEviction()`.
5. Export streaming: Uses chunked reads with backpressure via `waitForReadableStreamDemand`.
