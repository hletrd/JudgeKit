# RPF Cycle 16 — Review Remediation Plan

**Date:** 2026-04-24
**Source:** `.context/reviews/_aggregate.md`
**Status:** Done (H1-H2, L1-L4 all done)

## Scope

This cycle addresses findings from the RPF cycle 16 multi-agent review:
- AGG-1: Stale column references in export sanitization (schema-export drift)
- AGG-2: `judgeWorkers.secretToken` column still exists in schema (re-escalated from DEFER-66)
- AGG-3: Audit event `claimTokenPresent: true` is always true
- AGG-4: DRY violation — duplicated `isExpired` SQL expression
- AGG-5: No test for export sanitization column validity
- AGG-6: Missing boundary tests for `truncateObject`

No cycle-16 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Fix stale column references in export sanitization (AGG-1)

- **Source:** AGG-1 (CR-1, CR-2, S-1, S-2, A-1, D-1, D-2, V-2)
- **Severity / confidence:** HIGH / HIGH
- **Citations:** `src/lib/db/export.ts:251-252`
- **Cross-agent signal:** 8 of 8 review perspectives
- **Problem:** Two entries in `SANITIZED_COLUMNS` reference columns that no longer exist:
  1. `recruitingInvitations.token` — dropped in cycle 15
  2. `contestAccessTokens.token` — never existed in current schema
- **Plan:**
  1. Remove `"token"` from the `recruitingInvitations` entry in `SANITIZED_COLUMNS`
  2. Remove the entire `contestAccessTokens` entry from `SANITIZED_COLUMNS`
  3. Verify all gates pass
- **Status:** DONE — Commit `260939cc`

### H2: Drop `judgeWorkers.secretToken` column (AGG-2 / DEFER-66)

- **Source:** AGG-2 (CR-3, S-3, C-2), carries DEFER-66
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/lib/db/schema.pg.ts:418`, `src/lib/db/export.ts:250,258`, `src/lib/logger.ts:18`
- **Cross-agent signal:** 3 of 8 review perspectives
- **Problem:** The `judgeWorkers.secretToken` column still exists despite being deprecated. New registrations set it to `null`, and auth rejects workers without `secretTokenHash`. Legacy rows with plaintext tokens are exposed in a DB compromise.
- **Plan:**
  1. Verify no code path reads `judgeWorkers.secretToken` from the DB (grep for all references)
  2. Remove `secretToken` column definition from `src/lib/db/schema.pg.ts`
  3. Create a Drizzle migration for the column drop
  4. Remove `secretToken` from `SANITIZED_COLUMNS` and `ALWAYS_REDACT` in `src/lib/db/export.ts`
  5. Remove `secretToken` from `REDACT_PATHS` in `src/lib/logger.ts`
  6. Verify all gates pass
- **Status:** DONE — Commit `2fc519f1`

### L1: Remove misleading `claimTokenPresent` from audit details (AGG-3)

- **Source:** AGG-3 (CR-4, D-3)
- **Severity / confidence:** LOW / HIGH
- **Citations:** `src/app/api/v1/judge/poll/route.ts:118`
- **Cross-agent signal:** 2 of 8 review perspectives
- **Problem:** The `claimTokenPresent: true` field in the audit details is always true because the code path is only reached after the claim token is validated. It's misleading.
- **Plan:**
  1. Remove `claimTokenPresent: true` from the in-progress audit event details
  2. Verify all gates pass
- **Status:** DONE — Commit `ee62edc7`

### L2: Extract `isExpired` SQL expression into shared fragment (AGG-4)

- **Source:** AGG-4 (CR-5, A-4, C-3)
- **Severity / confidence:** LOW / HIGH
- **Citations:** `src/lib/assignments/recruiting-invitations.ts:128,153,177,284`
- **Cross-agent signal:** 3 of 8 review perspectives
- **Problem:** The `isExpired` SQL expression is duplicated 4 times.
- **Plan:**
  1. Extract the SQL expression into a reusable function/fragment in `recruiting-invitations.ts`
  2. Replace all 4 occurrences with the shared fragment
  3. Verify all gates pass
- **Status:** DONE — Commit `09aa6209`

### L3: Add test for export sanitization column validity (AGG-5)

- **Source:** AGG-5 (T-1)
- **Severity / confidence:** LOW / HIGH
- **Citations:** `src/lib/db/export.ts:245-253`
- **Cross-agent signal:** 1 of 8 review perspectives
- **Problem:** No automated test validates `SANITIZED_COLUMNS` entries against actual schema columns.
- **Plan:**
  1. Add a unit test that imports the schema and `SANITIZED_COLUMNS`
  2. For each table in `SANITIZED_COLUMNS`, assert every listed column exists in the corresponding schema table
  3. Verify the test catches the stale references (before H1 fixes them)
  4. Verify all gates pass
- **Status:** DONE — Commit `4df4a5e8`

### L4: Add boundary tests for `truncateObject` (AGG-6)

- **Source:** AGG-6 (T-2)
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/lib/audit/events.ts:54-90`, `tests/unit/audit/serialize-details.test.ts`
- **Cross-agent signal:** 1 of 8 review perspectives
- **Problem:** Missing boundary conditions for `truncateObject`.
- **Plan:**
  1. Add tests for: nested objects that individually fit but together exceed budget, empty arrays/objects, non-ASCII strings, `undefined` values in arrays
  2. Verify all gates pass
- **Status:** DONE — Commit `359986b0`

---

## Deferred items

### Carried from prior cycle plans

All DEFER-61 through DEFER-70 from the cycle 15 plan carry forward unchanged, except DEFER-66 which is now resolved.

### DEFER-66 resolved

DEFER-66 (`judgeWorkers.secretToken` column) is resolved by H2 above.

---

## Progress log

- 2026-04-24: Plan created from RPF cycle 16 aggregate review. 6 new tasks (H1, H2, L1-L4). DEFER-66 is being resolved this cycle.
- 2026-04-24: H1 DONE (260939cc — remove stale SANITIZED_COLUMNS references), H2 DONE (2fc519f1 — drop judgeWorkers.secretToken column + Drizzle migration), L1 DONE (ee62edc7 — remove claimTokenPresent from audit), L2 DONE (09aa6209 — extract isExpiredExpr), L3 DONE (4df4a5e8 — export sanitization column validity test), L4 DONE (359986b0 — truncateObject boundary tests). All gates pass: eslint (0 errors), tsc (0 errors), vitest (298/298 files, 2136/2136 tests), next build (success).
