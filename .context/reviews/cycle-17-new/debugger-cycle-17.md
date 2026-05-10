# Cycle 17 — Debugger (Manual)

**Date:** 2026-05-09
**HEAD reviewed:** `32464e55`
**Agent status:** Agent tool unavailable; performed manually by orchestrator

---

## Focus Areas

- Latent bugs in the cycle-16 timeout fix implementations
- Failure modes of signal composition
- Regressions introduced by the fix
- Race conditions in concurrent fetch scenarios

---

## Findings

### C17-DB-1: `withTimeout` already-aborted signal leads to delayed abort [MEDIUM]

- **File:** `src/lib/api/client.ts:94-102`, `src/lib/docker/client.ts:104-112`
- **Confidence:** High
- **Problem:** When `withTimeout` receives an already-aborted signal, the combined AbortSignal does not immediately enter the aborted state. Instead, it waits for the timeout to fire. This means a fetch that should immediately fail will instead hang for up to 30s (or 60s for docker worker calls).
- **Debugger analysis:**
  1. `signal.aborted === true` at entry
  2. `const timer = setTimeout(() => combined.abort(), ms)` — timer starts
  3. `signal.addEventListener("abort", ...)` — listener registered, but abort event already fired
  4. Listener never fires, timer not cleared
  5. `combined.signal` only aborts when timer fires
- **Impact:** In React, if an effect cleanup aborts a controller and a subsequent effect reuses the same controller (buggy caller code), the fetch hangs. More realistically, if a component unmounts during `apiFetch` call setup (between the caller creating the signal and `withTimeout` being called), the fetch may not abort immediately.
- **Suggested fix:** Add `if (signal.aborted) { combined.abort(); return combined.signal; }` guard.

### C17-DB-2: `withTimeout` listener accumulation under rapid re-fetch [LOW]

- **File:** `src/lib/api/client.ts:94-102`, `src/lib/docker/client.ts:104-112`
- **Confidence:** Medium
- **Problem:** In the timeout-fires-first case, the abort listener remains on the source signal. If the same signal is reused across multiple `apiFetch` calls (e.g., a long-lived AbortController in a ref), listeners accumulate.
- **Reproduction path:**
  1. Create an AbortController that is never aborted
  2. Call `apiFetch` repeatedly with `controller.signal`
  3. Each call adds a new `{ once: true }` listener
  4. If any fetch times out before the controller is aborted, those listeners are never removed
  5. Memory leak is bounded by the lifetime of the AbortController
- **Impact:** Low in practice because most callers abort controllers within seconds. But the leak exists.

---

## Regressions Checked

- Cycle-16 apiFetch timeout fix: No regressions found. The fix correctly applies timeouts to all calls.
- Cycle-16 docker worker timeout fix: No regressions found.
- Browser compatibility: `createTimeoutSignal` fallback is correct and tested.

---

## Areas Examined

- Signal flow through `apiFetch` -> `withTimeout` -> `fetch`
- Error paths: timeout fire, caller abort, already-aborted signal
- React component cleanup patterns in chat widget, countdown timer, submission auto-refresh
- Test coverage for edge cases
