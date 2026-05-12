# Tracer Review — Cycle 12 (HEAD: ecfa0b6c)

**Date:** 2026-05-11
**Reviewer:** tracer
**Scope:** Causal tracing of suspicious flows, competing hypotheses

---

## Findings

### C12-TRACE-1: apiFetch memory leak — root cause trace
**Severity:** MEDIUM | **Confidence:** High
**File:** `src/lib/api/client.ts:97-98`

**Hypothesis A:** The apiFetch leak is caused by missing `.finally()` cleanup.
**Evidence:** 
- `createTimeoutSignal(30_000)` at abort.ts:10-11 creates `setTimeout(() => controller.abort(), ms)`
- The timer ID is not returned or stored externally
- No `clearTimeout` is called when fetch completes
- Branch with `init.signal` (line 92) DOES call `cleanupWithTimeout(signal)` in `.finally()`
- Branch without `init.signal` (line 98) does NOT

**Conclusion:** Hypothesis A is confirmed. The fix is to add `.finally(() => cleanupWithTimeout(signal))` to line 98.

**Alternative hypothesis (rejected):** The AbortSignal.timeout() path in createTimeoutSignal might auto-clean.
**Evidence:** abort.ts:7-8 returns `AbortSignal.timeout(ms)` when available. This creates a browser-native timeout signal that MAY auto-clean when the fetch completes (browser implementation detail). However, the fallback path (lines 10-12) uses manual setTimeout which definitely leaks. Since both paths must be correct, the manual cleanup is required regardless.

---

### C12-TRACE-2: Why remaining as casts weren't caught in cycle 11
**Severity:** LOW | **Confidence:** Medium
**File:** `src/hooks/use-submission-polling.ts`

**Hypothesis:** The cycle 11 fixer only addressed the most obvious casts (`as { error?: string }`) and missed the more subtle `as Record<string, unknown>` casts because they were inside map callbacks and conditional blocks.

**Evidence:**
- The cycle 11 commit modified lines around the error response handling
- The `normalizeSubmission` function has casts at lines 48, 50, 52, 75, 77, 79, 82, 257
- These are all `as Record<string, unknown>` casts used to access object properties

**Conclusion:** The cycle 11 fix was scoped to the specific issue (error response casts) and didn't do a full sweep of the file. A global search for `as ` in the file would have caught these.

---

## Final Sweep

Traced all apiFetch call sites (40+ usages). Most do not pass a custom signal, confirming the leak affects the majority of apiFetch calls.
