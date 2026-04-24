# RPF Cycle 16 — Architect

**Date:** 2026-04-24
**HEAD:** bbc1ef67

## Scope

Reviewed architectural risks, coupling, and layering:
- Schema migrations and their downstream effects
- Export engine's coupling to schema column names
- Rate limiting architecture (dual systems)
- Proxy middleware responsibilities
- Auth flow architecture

## Findings

### A-1: [HIGH] Schema-Export Coupling — Stale Column References Cause Runtime Errors
**Confidence:** High
**Citations:** `src/lib/db/export.ts:245-253`

The export engine's `SANITIZED_COLUMNS` is a manually-maintained mapping of table names to column names that should be redacted. It is NOT derived from the schema definition, creating a coupling gap:

1. `recruitingInvitations.token` — dropped in cycle 15 but still listed
2. `contestAccessTokens.token` — never existed in the current schema

This is a systemic issue: any schema migration that drops or renames a sensitive column must also update `SANITIZED_COLUMNS`. There is no automated check or type-level enforcement.

**Fix:**
- Short-term: Remove the stale references (CR-1, CR-2, S-1, S-2).
- Long-term: Derive `SANITIZED_COLUMNS` from the Drizzle schema types so that referencing a non-existent column is a compile-time error.

---

### A-2: [MEDIUM] Dual Rate Limiting Systems Without Unified Interface
**Confidence:** Medium

Already tracked as DEFER-62. No new findings on this topic.

---

### A-3: [MEDIUM] Proxy Mixing Auth, CSP, Locale, and Caching Logic
**Confidence:** Medium

Already tracked as DEFER-63. No new findings on this topic.

---

### A-4: [LOW] Duplicated isExpired SQL Expression in Recruiting Invitations
**Confidence:** High
**Citations:** `src/lib/assignments/recruiting-invitations.ts:128, 153, 177, 284`

Same as CR-5. The `isExpired` SQL expression is duplicated 4 times. If the business logic changes, all 4 must be updated in lockstep.

**Fix:** Extract into a shared Drizzle SQL fragment.

---

## Architectural Stability

No new module introductions or boundary crossings since cycle 15. The schema migration for dropping `recruitingInvitations.token` was clean — all code paths now use `tokenHash`. The export sanitization gap (A-1) is the only architectural concern introduced by the migration.
