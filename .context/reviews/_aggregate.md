# Aggregate Review — Cycle 44 (RPF Loop)

**Date:** 2026-05-10
**Reviewers:** comprehensive-reviewer (single-agent review, subagent spawning unavailable)
**Total findings:** 2 new (2 LOW) + 0 false positives + all prior deferred items re-validated

---

## Deduplicated Findings

### C44-1: [LOW] SSE cleanup timer lacks stop function for test teardown

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:122-145`
**Confidence:** HIGH

The `globalThis.__sseCleanupTimer` (a `setInterval` for evicting stale SSE connection tracking entries) is created at module load time with an atomic guard but has no corresponding exported `stopSseCleanupTimer()` function. This is the exact same pattern that was fixed for the audit flush timer in cycle 43 (C43-1, commit 2c86c3b1) and the rate-limit eviction timer in cycle 34.

**Why it matters:**
- The timer uses `.unref()`, so it will not block process exit in production
- However, in test environments, Vitest may report open handles after test completion
- Any test that imports this route module will have the timer active

**Fix:** Add an exported `stopSseCleanupTimer()` function that clears the timer and resets the guard flag.

```typescript
export function stopSseCleanupTimer() {
  if (globalThis.__sseCleanupTimer) {
    clearInterval(globalThis.__sseCleanupTimer);
    globalThis.__sseCleanupTimer = undefined;
    globalThis.__sseCleanupInitialized = false;
  }
}
```

---

### C44-2: [LOW] `formData.get("password") as string | null` still present in two admin routes

**File:** `src/app/api/v1/admin/migrate/import/route.ts:48` and `src/app/api/v1/admin/restore/route.ts:40`
**Confidence:** MEDIUM

These are additional instances of DEFER-36 (`formData.get()` cast assertions) that were not addressed in cycle 40. Cycle 40 fixed `login-form.tsx` and `change-password-form.tsx`, but these admin routes retain the unsafe cast pattern. While `typeof` guards on the next line provide defense in depth, the `as` cast is brittle and inconsistent with the cycle 40 fix.

**Fix:** Use `String(formData.get("password") ?? "")` instead of `as string | null`, matching the cycle 40 remediation pattern.

**Note:** This is an additional instance of the existing DEFER-36 deferred item, not a new category of bug.

---

## Previously Fixed Items (confirmed in current code)

All cycle 43 fixes verified:
- C43-1: `stopAuditFlushTimer()` exported in `src/lib/audit/events.ts:156-161`

All cycle 42 fixes verified:
- No code changes in cycle 42 (documentation only)

All cycle 40 fixes verified:
- DEFER-36: `formData.get()` cast assertions — FIXED in login-form.tsx and change-password-form.tsx

All earlier cycle fixes verified (cycles 25-39):
- All previously committed fixes remain in place with no regressions

---

## Carried Deferred Items (unchanged from cycle 43)

All deferred items from cycles 25-41 remain unchanged in status.

| Category | Count | Status |
|----------|-------|--------|
| CRITICAL | 3 | Unchanged |
| HIGH | 1 | Unchanged |
| MEDIUM | 5 | Unchanged |
| LOW | 12+ | Unchanged |

**Specific deferred items with additional instances found this cycle:**
- DEFER-36: +2 instances in admin import/restore routes (see C44-2 above)

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
