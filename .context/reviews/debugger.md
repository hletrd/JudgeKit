# Debugger Review — Cycle 33

**Reviewer:** debugger
**Date:** 2026-05-10
**Scope:** Latent bugs, failure modes, edge cases, race conditions

---

## Findings

### C33-DB-1: [MEDIUM] Race condition in anti-cheat flush + retry

**File:** `src/components/exam/anti-cheat-monitor.tsx:73-86`
**Confidence:** MEDIUM

The `performFlush` function loads events from localStorage, sends them, then saves remaining events. Between the load and save, another tab or event handler could modify localStorage. While unlikely in a single-tab exam scenario, this is a latent race condition.

**Fix:** Use a Mutex-like pattern or sessionStorage (which is tab-scoped) instead of localStorage.

---

### C33-DB-2: [MEDIUM] submission-list-auto-refresh concurrent tick guard insufficient

**File:** `src/components/submission-list-auto-refresh.tsx:34-37`
**Confidence:** HIGH

The `isRunningRef` guard prevents concurrent ticks within the same timer chain, but if `hasActiveSubmissions` prop changes rapidly, the effect cleanup and re-setup could create overlapping timer chains. The old timer is cleared, but a new one starts immediately.

**Fix:** Add an AbortController for the fetch in tick() to cancel in-flight requests when props change.

---

### C33-DB-3: [LOW] export-button blob URL leak on rapid clicks

**File:** `src/components/contest/export-button.tsx:30-37`
**Confidence:** LOW

If user rapidly clicks export buttons, multiple blob URLs are created but `URL.revokeObjectURL` only runs after the successful download. Rapid clicks could temporarily leak memory.

**Fix:** Track and revoke previous blob URL before creating new one, or disable button during export.

---

### C33-DB-4: [LOW] sign-out localStorage key iteration non-atomic

**File:** `src/lib/auth/sign-out.ts:37-44`
**Confidence:** MEDIUM

The iteration pattern `for (let i = 0; i < window.localStorage.length; i++)` is non-atomic. If keys are added or removed during iteration (e.g., by another tab or the anti-cheat monitor), the loop behavior is undefined.

**Fix:** Use `Object.keys(window.localStorage)` to snapshot before iterating.

---

## Positive Observations

1. Error count backoff in submission-list-auto-refresh prevents spam on failure.
2. Anti-cheat retry cap (MAX_RETRIES=3) prevents infinite loops.
3. Most async operations have cleanup handlers.
