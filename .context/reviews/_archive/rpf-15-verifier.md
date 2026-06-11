# RPF Cycle 15 — Verifier

**Date:** 2026-04-20
**Base commit:** f0bef9cb

## Findings

### VER-1: Duplicate `getDbNowUncached()` in recruiting invitations POST (same as CR-1) [LOW/MEDIUM]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:70,77`

Verified that the API keys route (`src/app/api/v1/admin/api-keys/route.ts:76`) correctly fetches `dbNow` once. Verified that the bulk route (`src/app/api/v1/contests/[assignmentId]/recruiting-invitations/bulk/route.ts:29`) correctly fetches once. The single-create route is the only one with the duplicate fetch pattern.

**Fix:** Consistent with CR-1 — fetch once before branching.

**Confidence:** MEDIUM

### VER-2: `expiryDate` validation gap confirmed (same as SEC-1, CR-6) [MEDIUM/MEDIUM]

**File:** `src/lib/validators/recruiting-invitations.ts:10`

Verified that `expiryDays` has `max(3650)` but `expiryDate` has no range constraint. The route handler at line 78 only checks `expiresAt <= dbNow` (past-date check) but not for unreasonably far-future dates. This is a validation gap that allows creating invitations with effectively infinite expiry through the `expiryDate` field.

**Fix:** Add upper-bound validation.

**Confidence:** MEDIUM

## Verified Safe

- All rpf-14 remediation items verified as correctly implemented:
  - H1: API key and recruiting invitation creation accepts `expiryDays`/`expiryDate` instead of `expiresAt` — verified.
  - H2: `withUpdatedAt()` requires `now: Date` parameter — verified (all 15 callers pass it explicitly).
  - M1: Custom date uses end-of-day UTC — verified (`new Date("YYYY-MM-DDT23:59:59Z")`).
  - M2: `useEffect` cleanup timer uses `[]` dependency — verified.
  - M3: Submissions page uses `getDbNow()` — verified.
  - L1: User profile heatmap uses `getDbNow()` — verified.
- Prior rpf-13 fixes intact — verified.
- Backup download filename uses `Content-Disposition` header — verified.
- API key status badges use server-computed `isExpired` — verified.
- Recruiting invitation status badges use server-computed `isExpired` — verified.
- `streamDatabaseExport` accepts `dbNow` parameter — verified.
