# Verifier — Cycle 7 Deep Review

**Date:** 2026-04-20
**Scope:** Evidence-based correctness check against stated behavior

---

## Findings

### HIGH 1 — `tokenInvalidatedAt` session revocation can be bypassed via clock skew

**Confidence:** HIGH
**Evidence:** Code tracing of the session revocation flow:

1. Admin deactivates user via `src/app/api/v1/users/[id]/route.ts:466`: `tokenInvalidatedAt: new Date()`
2. Proxy checks session via `src/proxy.ts:240-274`: fetches user from DB, calls `isTokenInvalidated(token, user.tokenInvalidatedAt)`
3. `isTokenInvalidated()` in `src/lib/auth/session-security.ts:26-36`: compares `authenticatedAtSeconds < invalidatedAtSeconds`
4. JWT `authenticatedAt` is set via `Date.now()` at login time (in the JWT callback)

If the app server clock jumps forward between steps 1 and 4, the JWT's `authenticatedAt` could be ahead of `tokenInvalidatedAt`, causing the check to pass when it should fail.

**Verification:** This is a theoretical vulnerability that depends on clock drift. The risk is real in production environments where NTP corrections can cause sudden clock jumps.

**Suggested fix:** Use `getDbNowUncached()` for `tokenInvalidatedAt`.

---

### HIGH 2 — Public contest status uses `new Date()` instead of DB time

**Confidence:** HIGH
**Evidence:** Code tracing:

1. `getPublicContests()` calls `getContestStatus(contest, new Date())` (line 30)
2. `getPublicContestById()` calls `getContestStatus(contest, new Date())` (line 124)
3. `getContestStatus()` uses `now.getTime()` to compare against `startsAt`, `deadline`, `personalDeadline`

The contest status shown to the user may not match the DB-sourced time used by API routes.

**Verification:** Confirmed by code inspection. The fix is straightforward: use `getDbNow()`.

---

### MEDIUM 1 — Anti-cheat event timestamps are inconsistent with DB time

**Confidence:** HIGH
**Evidence:** The anti-cheat route fetches DB time at line 63 for boundary checks, but uses `new Date()` for `createdAt` at lines 110 and 128.

**Verification:** Confirmed by code inspection.

---

### MEDIUM 2 — Sidebar active contest detection uses app-server time

**Confidence:** MEDIUM
**Evidence:** `getActiveTimedAssignmentsForSidebar` defaults to `new Date()` (line 44).

**Verification:** Confirmed by code inspection.

---

## Final verification sweep

The following previously-reported issues were verified as FIXED:
- Contest detail page clock-skew: FIXED (uses `getDbNow()`)
- Problem detail page clock-skew: FIXED (uses `getDbNow()`)
- Quick-create contest clock-skew: FIXED (uses `getDbNowUncached()`)
- SSE non-null assertion: FIXED (viewerId captured before closure)
- Access code deadline check: FIXED (uses DB time in transaction)

The following previously-reported issues remain DEFERRED:
- `submittedAt: new Date()` in submission insert: DEFERRED (cosmetic, not security-relevant)
- Display-only `new Date()` in groups page, student dashboard, contests page: DEFERRED (cosmetic)
