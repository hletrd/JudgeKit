# Architect — Cycle 29

**Date:** 2026-05-09
**Cycle:** 29 of 100
**Base commit:** 81c5daa8
**Current HEAD:** 81c5daa8 (clean working tree)

---

## New Findings

### C29-ARCH-1: Recruiting token validation — missing bounded input architecture

- **File:** `src/lib/auth/config.ts:208`
- **Severity:** Medium
- **Confidence:** High
- **Description:** The auth layer lacks a centralized input validation utility with bounds checking. Each endpoint defines its own validation ad-hoc. The recruiting token regex omission is a symptom of this architectural gap.
- **Recommendation:** Consider a `BoundedString` schema helper or centralized input size limits (e.g., max 4096 bytes for any credential field) applied before route handlers.

---

## Carry-Forward Findings

### AR-26-1: Transaction wrapper inconsistency
- **File:** `src/app/api/v1/judge/poll/route.ts:77,136`
- **Status:** Still present. 9+ cycles deferred.

### C27 findings
- **Status:** Still present (Docker inspect, prompt sanitization, DELETE audit).

---

## Verified Architecture

- **API Layer:** `createApiHandler` middleware stack intact
- **Database Layer:** Drizzle ORM with raw query helpers. Parameterization verified.
- **Auth Layer:** JWT + cookie. Token invalidation verified.
- **Judge Layer:** Atomic claim via CTE with SKIP LOCKED. Proper.
- **Client Layer:** apiFetch/apiFetchJson wrappers intact.

## Coupling Check

- No circular dependencies
- Clean separation between API routes and business logic
- Rust/TS interop clean

## Final Sweep

No new architectural risks.
