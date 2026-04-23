# Verifier Review — RPF Cycle 30

**Date:** 2026-04-23
**Reviewer:** verifier
**Base commit:** 31afd19b

## Previously Fixed Items (Verified)

- AGG-1 (clarification i18n, commit 7e0b3bb8): Verified. Lines 290, 293, 296 now use `t("quickYesAnswer")`, `t("quickNoAnswer")`, `t("quickNoCommentAnswer")`. English and Korean translations confirmed in `messages/en.json` (lines 2356-2358) and `messages/ko.json` (lines 2356-2358).
- AGG-2 (provider error sanitization, commit 93beb49d): Verified. All 6 provider error sites in `providers.ts` now throw `new Error(`...API error ${status}`)` without response body. Full body logged via `logger.warn()` at lines 102, 137, 206, 259, 340, 402.
- AGG-3 (useVisibilityPolling setTimeout, commit 60f24288): Verified. `use-visibility-polling.ts` uses recursive `setTimeout` with `cancelled` flag pattern.
- AGG-4 (progress bar aria-label, commit 3530a989): Verified. `active-timed-assignment-sidebar-panel.tsx:172` has `aria-label={tNav("progress")}`.

## V-1: `countdown-timer.tsx` uses `setInterval` — evidence-based verification of inconsistency [MEDIUM/MEDIUM]

**File:** `src/components/exam/countdown-timer.tsx:117`

**Evidence:** Line 117 contains `const interval = setInterval(recalculate, 1000)`. This is the only client-side timer still using `setInterval`. All others have been migrated:

| Component | Pattern | Migration |
|-----------|---------|-----------|
| useVisibilityPolling | recursive setTimeout | commit 60f24288 |
| contest-replay | recursive setTimeout | commit 9cc30d51 |
| anti-cheat heartbeat | recursive setTimeout | already correct |
| countdown-timer | setInterval | **NOT migrated** |
| active-timed-assignment-sidebar | setInterval | deferred (LOW/LOW) |

**Verification of stated behavior:** The `visibilitychange` handler on line 122-127 calls `recalculate()` when the tab becomes visible. This corrects the displayed time after tab switches. However, it does NOT prevent `setInterval` catch-up behavior — pending interval callbacks can still fire before the visibility change handler runs.

**Fix:** Migrate to recursive `setTimeout` to eliminate the catch-up window.

---

## V-2: `rate-limiter-client.ts` unguarded `.json()` on success path [LOW/MEDIUM]

**File:** `src/lib/security/rate-limiter-client.ts:79`

**Evidence:** Line 79 contains `const data = (await response.json()) as T;` without a `.catch()` guard. If the sidecar returns a non-JSON body (e.g., HTML from a proxy), this throws `SyntaxError`. The outer try/catch catches it but incorrectly increments the circuit breaker, treating a parse error the same as a network failure.

**Fix:** Add `.catch()` to the `.json()` call and handle parse errors separately from network errors.

---

## Verifier Findings (carried/deferred)

### V-CARRIED-1: Encryption plaintext fallback — MEDIUM/MEDIUM, carried from DEFER-39
