# Debugger Review — Cycle 12 (HEAD: ecfa0b6c)

**Date:** 2026-05-11
**Reviewer:** debugger
**Scope:** Latent bugs, failure modes, edge cases, regressions

---

## Findings

### C12-DEBUG-1: apiFetch timeout signal never cleaned up in default branch
**Severity:** MEDIUM | **Confidence:** High
**File:** `src/lib/api/client.ts:97-98`

**Failure scenario:**
1. Component calls `apiFetch("/api/v1/resource")` without a custom signal (the common case)
2. `createTimeoutSignal(30_000)` creates an AbortController with a 30-second timer
3. Fetch completes in 200ms
4. The timer is never cleared — it fires after 30 seconds, calling `controller.abort()` on an already-completed operation
5. The AbortController and its signal are retained in memory until the timer fires
6. With 100 apiFetch calls per minute, this accumulates ~100 dangling timers and controllers

**Regression check:** This is a regression from the cycle 9/10 AbortController work. The `.finally(cleanupWithTimeout)` was added for the `init.signal` branch but missed for the default branch.

**Fix:** Add `.finally(() => cleanupWithTimeout(signal))` to line 98.

---

### C12-DEBUG-2: normalizeSubmission runtime casts could mask shape changes
**Severity:** LOW | **Confidence:** Medium
**File:** `src/hooks/use-submission-polling.ts:45-119`

The `normalizeSubmission` function uses runtime `typeof` checks for most fields but still has `as Record<string, unknown>` casts at lines 48, 50, 52, 75, 77, 79, 82. If the API response shape changes (e.g., `results` contains objects with different keys), the casts silently pass through and subsequent `typeof` checks on missing keys return `undefined`, producing `null` values instead of throwing.

This is a silent data loss scenario — fields that should be present become null without any error.

**Fix:** Replace casts with explicit shape validation (e.g., check that required keys exist before accessing them).

---

### C12-DEBUG-3: countdown-timer.tsx syncTime promise chain type mismatch
**Severity:** LOW | **Confidence:** High
**File:** `src/components/exam/countdown-timer.tsx:89`

Line 89: `return res.json().catch(() => null) as Promise<{ timestamp: number } | null>;`

The `.catch(() => null)` returns `null` (not a Promise). When this null propagates to the `.then()` on line 91, `data` is `null` and the `if (!data) return;` guard handles it. But the `as` cast masks a real type error: the expression's actual type is `Promise<{ timestamp: number }> | null`, not `Promise<{ timestamp: number } | null>`.

This could cause issues if future refactors change the chain structure.

**Fix:** Remove the `as` cast and restructure the chain to have proper types.

---

## Final Sweep

Checked all error boundaries, catch blocks, and cleanup paths. No other latent bugs found.
