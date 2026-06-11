# RPF Cycle 15 — Tracer

**Date:** 2026-04-20
**Base commit:** f0bef9cb

## Findings

### TR-1: Recruiting invitation `expiryDate` → `expiresAt` flow allows bypass of `expiryDays` max constraint [MEDIUM/MEDIUM]

**Trace path:**
1. Client sends `POST /api/v1/contests/{id}/recruiting-invitations` with `expiryDate: "2099-12-31"`
2. Zod schema at `src/lib/validators/recruiting-invitations.ts:10` validates format only (`/^\d{4}-\d{2}-\d{2}$/`)
3. Route handler at `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:72-79`:
   - Line 75: `expiresAt = new Date("2099-12-31T23:59:59Z")` — computed
   - Line 78: `expiresAt <= dbNow` — false (it's far in the future)
   - No upper-bound check exists
4. `createRecruitingInvitation()` at `src/lib/assignments/recruiting-invitations.ts:53` stores `expiresAt` as-is
5. The invitation is created with `expiresAt` in 2099 — effectively never expires
6. `isExpired` SQL at line 130: `expiresAt < NOW()` — will be false for ~73 years

**Competing hypothesis 1:** This is intentional — admins should be able to set any date. **Rejected:** The `expiryDays: max(3650)` constraint shows the design intent is to limit expiry to ~10 years.

**Competing hypothesis 2:** This is an oversight from the rpf-14 H1 fix. **Accepted:** The `expiryDays` field got the Zod constraint but `expiryDate` was added without an equivalent server-side upper bound.

**Fix:** Add upper-bound validation on the computed `expiresAt` in the route handler.

**Confidence:** MEDIUM

### TR-2: Duplicate `getDbNowUncached()` in single-create route (same as CR-1) [LOW/MEDIUM]

**Trace path:**
1. Request enters POST handler at `route.ts:33`
2. If `body.expiryDays` is set: `getDbNowUncached()` called at line 70
3. If `body.expiryDate` is set: `getDbNowUncached()` called at line 77 (different call site)
4. Both calls return `SELECT NOW()` from PostgreSQL
5. Under normal conditions: both return nearly identical values
6. Under NTP clock step: values may differ by seconds

The bulk route (`bulk/route.ts:29`) and API keys route (`api-keys/route.ts:76`) both fetch once. This is the only route with the duplicate pattern.

**Fix:** Fetch once, reuse across branches.

**Confidence:** MEDIUM

## Verified Safe

- `handleCopyLink` in recruiting invitations panel: traced to unhandled `navigator.clipboard.writeText()` — same as CR-3. Not a data flow issue but a runtime error path.
