# Architect — Cycle 7 (RPF Loop)

**Reviewer:** architect
**Date:** 2026-05-15
**Scope:** Architectural/design risks, coupling, layering
**Base commit:** f1510a07

---

## Methodology

- Reviewed cross-cutting concerns: time-source discipline, auth patterns, DB access.
- Checked coupling between layers (API routes → lib → DB).
- Examined the SSE route divergence from `createApiHandler` pattern.
- Verified the clock-skew migration completeness.

---

## Verification of Previous Findings

### Old cycle-7 HIGH — Inconsistent time-source discipline

**Status: RESOLVED.** The `tokenInvalidatedAt` migration to DB time was the last major gap. All security-relevant timestamps now use DB time:
- Session revocation: `tokenInvalidatedAt` uses DB time
- Contest status: uses `getDbNow()`
- Anti-cheat events: uses DB `NOW()`
- Invite timestamps: uses `getDbNowUncached()`

### ARCH-1 — `createApiHandler` generic 500 error

**Status: Deferred.** The generic 500 is intentional to avoid leaking error details to API callers. Logging captures the actual error. Acceptable design trade-off.

### ARCH-2 — Judge worker dual token system

**Status: Deferred.** The dual token (worker ID + secret token + shared `JUDGE_AUTH_TOKEN` fallback) is intentional defense-in-depth for gradual migration.

---

## New Findings

### No new architectural issues found.

The architecture remains sound:
- Next.js App Router with server components
- `createApiHandler` middleware factory for consistent API handling
- Drizzle ORM with PostgreSQL
- Rust sidecars for compute-intensive work (compiler, judge)
- Proper separation of concerns between app server and worker

---

## Conclusion

Cycle 7 is a verification-only cycle. The time-source discipline migration is complete. No new architectural risks identified.

**New findings this cycle: 0**
