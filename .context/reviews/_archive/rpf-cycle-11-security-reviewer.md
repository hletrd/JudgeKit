# RPF Cycle 11 — Security Reviewer ( refreshed 2026-05-11 )

**Date:** 2026-05-11
**HEAD reviewed:** `b5008708`
**Scope:** Full repo; auth, API routes, file handling, encryption, recruiting, rate limiting.

---

## NEW findings

**0 HIGH, 0 MEDIUM, 0 LOW NEW.**

No new security-sensitive surface introduced. No auth bypass, CSRF gap, or injection vector found in the change surface.

## Silent-fix audit (deferred items vs. HEAD)

- **CLOSED:** AGG-1 (recruiting token `new Date()` in transaction) — fixed at HEAD. `redeemRecruitingToken` now fetches `getDbNowUncached()` once at transaction start and uses it for all timestamp writes.
- **CLOSED:** AGG-2 (export/backup `new Date()`) — fixed at HEAD. `backup/route.ts` fetches DB time and passes it through to `streamDatabaseExport` and `streamBackupWithFiles`.
- **C7-AGG-7** (encryption.ts plaintext fallback) — still deferred with doc-mitigation. JSDoc warning intact.
- **D1/D2** (JWT clock-skew, DB-per-request) — still deferred per repo policy (fixes must live outside `src/lib/auth/config.ts`).

## Carry-forward security items

| ID | Severity | Status | Notes |
|---|---|---|---|
| C7-AGG-7 | LOW | DEFERRED-with-doc-mitigation | encryption.ts plaintext fallback path |
| D1 | MEDIUM | DEFERRED | JWT clock-skew (outside config.ts) |
| D2 | MEDIUM | DEFERRED | JWT DB query per request (outside config.ts) |
| F3 | MEDIUM | DEFERRED | Candidate PII encryption at rest |

## Repo policy compliance

- `src/lib/auth/config.ts`: NOT touched. ✓
- No secrets/tokens introduced. ✓
- No new public/admin endpoints with auth gaps. ✓
- File upload validation (magic bytes + ZIP bomb protection) intact. ✓
- Rate-limit `SELECT FOR UPDATE` pattern intact. ✓

## Verdict

Nothing actionable at the security tier. All prior security fixes verified intact at HEAD.
