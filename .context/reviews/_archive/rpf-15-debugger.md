# RPF Cycle 15 — Debugger

**Date:** 2026-04-20
**Base commit:** f0bef9cb

## Findings

### DBG-1: Duplicate `getDbNowUncached()` in recruiting invitation POST — potential TOCTOU (same as CR-1, SEC-2) [LOW/MEDIUM]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:70,77`

If `expiryDate` is provided, `getDbNowUncached()` is called at line 77 — a different call from line 70 (which runs when `expiryDays` is provided). In the `expiryDate` branch, `expiresAt` is computed as `new Date("YYYY-MM-DDT23:59:59Z")` (no dependency on `dbNow`), but the validation `expiresAt <= dbNow` uses the second `getDbNowUncached()` result. Under normal conditions both calls return nearly identical values, but an NTP clock step between the two calls could cause a legitimate future date to be rejected or an already-past date to be accepted.

**Concrete failure scenario:** DB time is 12:00:00.000. Between the `new Date(...)` construction and the `dbNow` fetch at line 77, an NTP correction shifts DB time backward to 11:59:59.000. A date that should be rejected (e.g., same-day date) might pass the check. Extremely unlikely but possible.

**Fix:** Fetch `dbNow` once and reuse it across both branches.

**Confidence:** MEDIUM

### DBG-2: `handleCopyLink` unhandled exception on clipboard failure [LOW/MEDIUM]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:199`

Same as CR-3. `navigator.clipboard.writeText()` can throw in insecure contexts, when permissions are denied, or on browsers without clipboard API support. The unhandled rejection will propagate to the React error boundary.

**Fix:** Wrap in try/catch.

**Confidence:** MEDIUM

### DBG-3: Copy-feedback timer leak in recruiting invitations panel (same as CR-4) [LOW/LOW]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:201`

**Fix:** Track timer with ref and clean up in `useEffect` return.

**Confidence:** LOW

## Verified Safe

- No regression in prior fixes.
- All `withUpdatedAt()` callers properly pass `now` — verified.
