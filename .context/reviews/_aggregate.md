# Aggregate Review — Cycle 16

## Meta
- Reviewers: code-reviewer, security-reviewer, perf-reviewer, architect, test-engineer, debugger, verifier, critic
- Date: 2026-04-24
- Total findings: 15 (deduplicated to 6)

---

## Deduplicated Findings (sorted by severity)

### AGG-1: [HIGH] Stale Column References in Export Sanitization — Schema-Export Drift
**Sources:** CR-1, CR-2, S-1, S-2, A-1, D-1, D-2, V-2 | **Confidence:** High
**Cross-agent signal:** 8 of 8 review perspectives

Two entries in `SANITIZED_COLUMNS` (`src/lib/db/export.ts:251-252`) reference columns that no longer exist:

1. `recruitingInvitations.token` — dropped in cycle 15 (commit `7cd2c983`) but the export sanitization was not updated
2. `contestAccessTokens.token` — this column never existed in the current schema

The root cause is that `SANITIZED_COLUMNS` is manually maintained and not validated against the schema, creating a systemic drift risk with every migration.

**Concrete failure scenario:** An operator runs a sanitized export expecting sensitive columns to be redacted. The column names don't match any actual column, so `indexOf()` returns -1 and redaction is silently skipped. If a future migration re-adds a column with the same name, the redaction would resume without anyone noticing the gap.

**Fix:**
1. Remove `"token"` from the `recruitingInvitations` entry in `SANITIZED_COLUMNS`
2. Remove the entire `contestAccessTokens` entry (the table has no sensitive columns)
3. Add a unit test that validates `SANITIZED_COLUMNS` entries against actual schema columns
4. Long-term: derive `SANITIZED_COLUMNS` from Drizzle schema types for compile-time safety

---

### AGG-2: [MEDIUM] `judgeWorkers.secretToken` Column Still Exists in Schema
**Sources:** CR-3, S-3, C-2 | **Confidence:** High
**Cross-agent signal:** 3 of 8 review perspectives

The `judgeWorkers.secretToken` column (schema.pg.ts:418) still exists despite being deprecated in favor of `secretTokenHash`. New registrations set it to `null` (register/route.ts:56), and auth rejects workers without `secretTokenHash` (judge/auth.ts:76-81). The column is listed in `SANITIZED_COLUMNS` and `ALWAYS_REDACT` (export.ts:250, 258), indicating awareness of the risk.

Legacy rows with plaintext tokens are exposed in a DB compromise. This is tracked as DEFER-66 but re-escalated due to the same pattern as the successfully-dropped `recruitingInvitations.token` in cycle 15.

**Fix:**
1. Drop `secretToken` column from schema
2. Create a Drizzle migration
3. Remove from `SANITIZED_COLUMNS` and `ALWAYS_REDACT` in export.ts
4. Remove from logger `REDACT_PATHS` in logger.ts

---

### AGG-3: [LOW] Audit Event `claimTokenPresent: true` is Always True
**Sources:** CR-4, D-3 | **Confidence:** High
**Cross-agent signal:** 2 of 8 review perspectives

In `src/app/api/v1/judge/poll/route.ts:118`, the audit event includes `claimTokenPresent: true`. This field is always `true` because the code path is only reached after the claim token is validated. Not a bug or security issue — just a misleading audit trail entry.

**Fix:** Remove the `claimTokenPresent` field from the audit details.

---

### AGG-4: [LOW] DRY Violation — Duplicated `isExpired` SQL Expression
**Sources:** CR-5, A-4, C-3 | **Confidence:** High
**Cross-agent signal:** 3 of 8 review perspectives

The `isExpired` SQL expression appears verbatim 4 times in `src/lib/assignments/recruiting-invitations.ts` (lines 128, 153, 177, 284). If the business logic changes, all 4 must be updated in lockstep.

**Fix:** Extract into a shared Drizzle SQL fragment.

---

### AGG-5: [LOW] No Test for Export Sanitization Column Validity
**Sources:** T-1 | **Confidence:** High
**Cross-agent signal:** 1 of 8 review perspectives

There is no automated test that validates `SANITIZED_COLUMNS` entries against actual schema columns. This is how AGG-1 went undetected.

**Fix:** Add a test that imports the schema and `SANITIZED_COLUMNS`, then asserts every listed column exists in the corresponding schema table.

---

### AGG-6: [LOW] Missing Boundary Tests for `truncateObject`
**Sources:** T-2 | **Confidence:** Medium
**Cross-agent signal:** 1 of 8 review perspectives

The `truncateObject` function (added in cycle 15) has 7 unit tests but is missing boundary conditions: nested objects that individually fit but together exceed budget, empty arrays/objects, non-ASCII strings, `undefined` values in arrays.

**Fix:** Add boundary case tests.

---

## Deferred Items (by policy — security/correctness findings are NOT deferrable)

All findings above are High, Medium, or Low severity. The High finding (AGG-1) should be implemented this cycle. The Medium finding (AGG-2) is a carry-over from DEFER-66 but re-escalated; implementing it is recommended. The Low findings can be addressed incrementally.

Carry-forward deferrals from prior cycles: DEFER-61 through DEFER-70 remain unchanged.

## Positive Observations

The codebase continues to demonstrate strong engineering practices:
- Cycle 15 fixes were correctly implemented and verified
- Timing-safe comparison used consistently
- Atomic SQL claims prevent TOCTOU races
- DOMPurify with strict allowlist for HTML sanitization
- Proper AES-256-GCM encryption with auth tags
- DB server time used for temporal consistency
- Comprehensive audit logging with redaction

## No Agent Failures

All 8 review agents completed successfully.
