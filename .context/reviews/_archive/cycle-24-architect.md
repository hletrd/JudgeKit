# Cycle 24 Architectural Review

**Date:** 2026-05-09
**HEAD:** c86576a1
**Scope:** Architectural risks, coupling, and layering

---

## New Findings

### A-1: [LOW] secrets.ts creates fan-in dependency pattern

**Files:** `src/lib/security/secrets.ts`
**Confidence:** LOW

The centralized secrets registry is a positive architectural change. However, `secrets.ts` is now imported by:
- `src/lib/db/export.ts` (export redaction)
- `src/lib/logger.ts` (log redaction)
- `src/app/api/v1/admin/settings/route.ts` (API redaction)

This creates a fan-in dependency pattern where many modules depend on secrets.ts. If secrets.ts grows to include runtime configuration or database-dependent logic, it could create circular dependencies or load-order issues.

**Current state is fine** - secrets.ts only exports constants. Risk is low.

**Mitigation:** Keep secrets.ts as a pure constants module. Never add runtime dependencies (db, env vars beyond static exports) to it.

---

### A-2: [LOW] contestAccessTokens expiry logic duplicated across 6+ files

**Files:** Multiple
**Confidence:** MEDIUM

The expiry check `(expires_at IS NULL OR expires_at > NOW())` is duplicated in:
- `src/lib/assignments/contests.ts` (2 occurrences in SQL)
- `src/lib/platform-mode-context.ts` (3 occurrences in SQL)
- `src/app/api/v1/contests/[assignmentId]/*/route.ts` (5 route handlers)

This is a small SQL fragment, but if the expiry logic needs to change (e.g., add grace period, change timezone handling), all occurrences must be updated.

**Fix:** Extract a shared SQL fragment or helper function for the contest access token validity check. Alternatively, use a Drizzle expression builder.

---

## Areas Verified (No Issues Found)

- Layer boundaries respected: components don't import from lib/db directly
- API handlers use createApiHandler consistently
- Auth middleware is centralized
- Platform mode resolution is centralized in platform-mode-context.ts
- Database time abstraction (getDbNowMs/getDbNowUncached) used consistently
- Transaction boundaries are explicit and well-scoped
