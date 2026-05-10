# Aggregate Review — Cycle 46 (RPF Loop)

**Date:** 2026-05-10
**Reviewers:** comprehensive-reviewer (single-agent review)
**Total findings:** 2 new (both LOW) + prior cycle findings confirmed fixed

---

## Deduplicated Findings

### C46-1: [LOW] Timer leak in `callWorkerJson`/`callWorkerNoContent` when custom signal provided

**Sources:** comprehensive-reviewer | **Confidence:** HIGH

`src/lib/docker/client.ts:118` and `152` — `callWorkerJson` and `callWorkerNoContent` wrap optional caller-provided `AbortSignal` with `withTimeout()` before passing to `fetch()`. When `fetch()` completes before the timeout expires, the timer is never cleaned up because neither function calls `cleanupWithTimeout()`. This is the same `withTimeout` timer leak pattern that was fixed in `apiFetch` during cycle 45.

**Concrete failure scenario:** An admin triggers a Docker image build via the admin UI with a custom abort signal. The build completes in 5s but the 30s timer remains pending. After 10 sequential builds, 10 dangling timers are active. On a busy admin dashboard with frequent image operations, this accumulates until each timer fires and self-cleans.

**Fix:** Store the combined signal, pass it to `fetch()`, and chain `.finally(() => cleanupWithTimeout(combinedSignal))` when a custom signal was provided.

---

### C46-2: [LOW] `useVisibilityPolling` breaks permanently if callback throws

**Sources:** comprehensive-reviewer | **Confidence:** MEDIUM

`src/hooks/use-visibility-polling.ts:57-61` — The `scheduleNext()` function calls `tick()` synchronously inside a `setTimeout` callback, then recursively calls `scheduleNext()`. If `tick()` throws an exception, the exception propagates past `scheduleNext()`, the recursion breaks, and polling stops permanently. The effect does not re-run until a dependency changes.

**Concrete failure scenario:** A submissions dashboard uses `useVisibilityPolling(() => refetchSubmissions(), 30000)` to auto-refresh every 30s. During one tick, `refetchSubmissions` encounters a transient React render error (e.g., a `setState` call during render). The error is caught by an error boundary, but `useVisibilityPolling`'s internal `scheduleNext()` never fires again. The dashboard shows stale submission status indefinitely until the user navigates away and back.

**Fix:** Wrap `tick()` in a try/catch inside the `setTimeout` callback, and call `scheduleNext()` in both the success and catch paths.

---

## Previously Fixed Items (confirmed in current code)

All cycle 45 fixes verified:
- C45-1: `cleanupWithTimeout()` chained in `apiFetch` at `src/lib/api/client.ts:92-94`
- C45-2: `isMountedRef` guard in `problem-submission-form.tsx:135`

All cycle 44 fixes verified:
- C44-1: `stopSseCleanupTimer()` exported in `src/app/api/v1/submissions/[id]/events/route.ts:150-156`
- C44-2: `formData.get()` safe extraction in admin import/restore routes

All cycle 43 fixes verified:
- C43-1: `stopAuditFlushTimer()` exported in `src/lib/audit/events.ts:156-161`

All earlier cycle fixes verified (cycles 25-42): All previously committed fixes remain in place with no regressions.

---

## Carried Deferred Items (unchanged from cycle 45)

All deferred items from cycles 25-41 remain unchanged in status. See prior cycle aggregates for details.

| Category | Count | Status |
|----------|-------|--------|
| CRITICAL | 3 | Unchanged |
| HIGH | 1 | Unchanged |
| MEDIUM | 5 | Unchanged |
| LOW | 12+ | Unchanged |

---

## No Agent Failures

Single comprehensive review completed successfully.
