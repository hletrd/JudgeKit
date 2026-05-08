# Code Reviewer Report — Cycle 5/100 (RPF Run)

**Date:** 2026-05-09
**HEAD:** 6fc4a4a2
**Scope:** Full TypeScript/TSX source review focusing on areas not well-covered in cycles 1-4 of this run

---

## Findings

### C5-CR-1: Unremoved abort listener in auto-review Promise.race [LOW]

- **Severity:** LOW
- **Confidence:** HIGH
- **File+line:** `src/lib/judge/auto-review.ts:175-198`
- **Issue:** The `timeoutController.signal.addEventListener("abort", ...)` listener created for the `Promise.race` timeout is never removed when `provider.chatWithTools()` wins the race. The `finally` block clears the `setTimeout` but does not call `removeEventListener`. Since `PROVIDER_REQUEST_TIMEOUT_MS` (25s) is shorter than `AUTO_REVIEW_TIMEOUT_MS` (30s), the provider timeout fires first in practice, making the auto-review timeout effectively dead code. The unremoved listener is minor memory noise but technically a leak.
- **Fix:** Remove the abort listener in `finally`, or better: wire the provider fetch to the same `AbortSignal` so a single timeout governs both the fetch and the race.

### C5-CR-2: Redundant Promise.race timeout in auto-review [LOW]

- **Severity:** LOW
- **Confidence:** HIGH
- **File+line:** `src/lib/judge/auto-review.ts:174-199`
- **Issue:** `provider.chatWithTools()` already passes `AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS)` (25s) to `fetch()`. The outer `Promise.race` with `AUTO_REVIEW_TIMEOUT_MS` (30s) can never win — the provider always rejects first. This adds complexity and the listener leak (C5-CR-1) for no operational benefit.
- **Fix:** Remove the custom `Promise.race` and rely on the provider's `AbortSignal.timeout`. If a longer or separate timeout is desired, increase `PROVIDER_REQUEST_TIMEOUT_MS` instead.

---

## Areas Verified (No Issues Found)

- **Timer cleanup:** All `setTimeout`/`setInterval` usages have matching cleanup.
- **Event listener cleanup:** All `addEventListener` calls have matching `removeEventListener`.
- **JSON.parse guards:** All untrusted paths have try/catch or safeParse.
- **React key stability:** All dynamic `.map()` uses stable IDs.
- **Type safety:** No `@ts-ignore`, no `any` types in source (except `TABLE_MAP` in import.ts which is already documented).
- **Auth endpoints:** CSRF protection, rate limiting, and JWT validation verified.
- **Korean letter spacing:** No inappropriate `tracking-*` applied to Korean text.

---

## Already-fixed findings verified at HEAD

All cycle 1-21 fixes remain resolved.
