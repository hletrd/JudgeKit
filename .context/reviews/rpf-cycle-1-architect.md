# Architect Review — RPF Cycle 1 (2026-05-01)

**Reviewer:** architect
**HEAD reviewed:** `894320ff`

---

## Architectural observations

### API handler standardization

134 of 218 API route handlers use `createApiHandler`. The remaining 84 are raw route handlers that manually implement auth, CSRF, and rate limiting. This is the ARCH-CARRY-1 deferred item. The `createApiHandler` wrapper is well-designed with proper middleware chaining (rate limit -> auth -> CSRF -> body validation -> handler). The raw routes should be migrated over time.

### Layering

`lib/` -> `db/`, `auth/`, `security/`, `compiler/`, `judge/` etc. No reverse coupling from `lib/` into `app/` or `components/`. Correct.

### Route group hierarchy

`(auth)`, `(public)`, `(dashboard)` is clean. No architectural drift.

---

## Findings

### C1-AR-1: [LOW] `rateLimits` table overloaded for SSE connection tracking

- **File:** `src/lib/realtime/realtime-coordination.ts:75-137`
- **Confidence:** MEDIUM
- **Description:** The `rateLimits` table is used both for actual rate limiting (login, API) and for SSE connection slot tracking. The `blockedUntil` column is repurposed as an "expires at" timestamp for SSE slots. While functionally correct, this conflation makes the table harder to reason about and query for analytics. Already tracked as ARCH-CARRY-2.
- **Fix:** Defer; track under ARCH-CARRY-2.

### C1-AR-2: [LOW] `import.ts` uses `any` types bypassing compile-time safety

- **File:** `src/lib/db/import.ts:19-24`
- **Confidence:** MEDIUM (same as C1-CR-2)
- **Description:** `TABLE_MAP: Record<string, any>` bypasses type safety for the entire import pipeline.
- **Fix:** Use discriminated unions or `unknown` with type guards.
