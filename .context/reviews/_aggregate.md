# Aggregate Review — Cycle 42 (RPF Loop)

**Date:** 2026-05-10
**Reviewers:** comprehensive-reviewer (single-agent review, subagent spawning unavailable)
**Total findings:** 0 new + 0 false positives + all prior deferred items re-validated

---

## Deduplicated Findings

No new findings in this cycle.

---

## Previously Fixed Items (confirmed in current code)

All cycle 41 fixes verified:
- No code changes in cycle 41 (documentation only)

All cycle 40 fixes verified:
- DEFER-36: `formData.get()` cast assertions — FIXED in login-form.tsx and change-password-form.tsx
- Export.ts pre-abort signal check — ADDED in cycle 39, verified in cycles 40-42

All cycle 39 fixes verified:
- AGG-1 (cycle 39): Docker build stderr sanitized
- AGG-2 (cycle 39): `participant-status.ts` `Date.now()` default removed
- AGG-3 (cycle 39): `JUDGE_WORKER_URL` guard added

All cycle 38 fixes verified:
- AGG-3 (cycle 38): `db/import.ts` error messages sanitized
- AGG-4 (cycle 38): Anti-cheat monitor text content capture removed

### Cycles 32-37 — All Fixed
(See prior aggregates for full list; all prior fixes verified intact.)

---

## Carried Deferred Items (unchanged from cycle 41)

### CRITICAL (requires architecture/product decision)
- **C-1**: Test/Seed localhost check spoofable
- **C-2**: Accepted solutions endpoint unauthenticated
- **C-3**: File DELETE CSRF ordering

### HIGH
- **H-1**: SSE result visibility bypass

### MEDIUM
- **DEFER-C30-4**: `.json()` before `.ok` in non-critical components (30+ files)
- **DEFER-C30-5**: Raw API error strings without i18n (ongoing incremental)
- **DEFER-C30-6**: `as { error?: string }` unsafe type assertions (15 instances)
- **C29 AGG-10**: Admin routes bypass createApiHandler (partially fixed, 15 routes remain)
- **C29 AGG-12**: Recruiting validate endpoint token brute-force (mitigated by rate limit + format validation)

### LOW
- **DEFER-27**: Missing AbortController on polling fetches
- **DEFER-34**: Hardcoded English fallback strings
- **DEFER-35**: Hardcoded English strings in editor title attributes
- **C25-6**: Client-side console.error (remaining instances)
- **C25-7**: WeakMap complexity in api-rate-limit.ts
- **C29 AGG-13**: files/[id] GET selects storedName
- **C29 AGG-14**: Admin settings exposes DB host/port
- **C29 AGG-15**: Missing error boundaries
- **C29 AGG-17**: Hardcoded English in throw new Error (permissions.ts)
- **C29 AGG-18**: Hardcoded English fallback strings in code-editor.tsx

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

## Correctness Observations (No New Issues)

1. Timer cleanup: All examined components properly clear timers and event listeners on unmount.
2. Error handling: `apiFetchJson` correctly catches network errors and logs parse failures in development.
3. Type safety: No new unsafe type assertions found beyond previously deferred items.
4. React patterns: Ref patterns in anti-cheat monitor are sound.
5. SSE fallback: `useSubmissionPolling` correctly falls back from SSE to fetch polling.

## Performance Observations (No New Issues)

1. No memory leaks detected: All refs with timers/event listeners have proper cleanup.
2. Fetch patterns: External API calls use `AbortSignal.timeout()`. Internal calls use `apiFetch` with 30s timeout.
3. DB queries: The `getDbNow()` cache deduplicates DB time queries within a single render.
4. Rate limit eviction: Has proper lifecycle management with `stopRateLimitEviction()`.
5. Export streaming: Uses chunked reads with backpressure via `waitForReadableStreamDemand`.
