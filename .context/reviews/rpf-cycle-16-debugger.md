# RPF Cycle 16 — Debugger

**Date:** 2026-04-24
**HEAD:** bbc1ef67

## Scope

Reviewed latent bug surface, failure modes, and regressions in:
- Recent cycle 15 changes
- Export sanitization
- Recruiting token flow
- Judge worker auth
- Rate limiting

## Findings

### D-1: [HIGH] Export Will Fail or Produce Incorrect Redaction for `recruitingInvitations.token`
**Confidence:** High
**Citations:** `src/lib/db/export.ts:251`

The `SANITIZED_COLUMNS` map references `"token"` for `recruitingInvitations`, but the column was dropped in cycle 15. Depending on how the export engine resolves column indices:

- **If column index lookup throws**: Export crashes with an error like "column 'token' not found in recruitingInvitations row", causing a denial-of-service on backup/restore.
- **If column index lookup returns -1 or undefined**: The redaction logic would either skip the column (leaving the stale reference as dead code) or attempt to redact index -1 (potentially redacting the wrong column).

The export engine uses `columns.indexOf(name)` to find the index. If the column doesn't exist, `indexOf` returns -1, and `row[-1]` is `undefined` in JS, so the redaction would be a no-op. However, the intent (sanitizing a sensitive column) is silently violated, and operators would not know.

**Failure scenario:** An operator runs a sanitized export, expecting the `token` column to be redacted. The column no longer exists, so no redaction occurs. If a future migration re-adds a `token` column, the export would start redacting it without anyone noticing the gap.

**Fix:** Remove the stale reference and add a validation test (see T-1).

---

### D-2: [MEDIUM] `contestAccessTokens.token` Reference is Phantom — Same Failure Mode as D-1
**Confidence:** High
**Citations:** `src/lib/db/export.ts:252`

Same issue as D-1 but for `contestAccessTokens.token`. This column never existed in the current schema, so it's a phantom reference. `indexOf("token")` returns -1, and redaction is silently skipped.

**Fix:** Remove the phantom reference.

---

### D-3: [LOW] Audit Event `claimTokenPresent: true` is Always True
**Confidence:** High
**Citations:** `src/app/api/v1/judge/poll/route.ts:118`

Same as CR-4. The `claimTokenPresent` field in the audit details is always `true` because the code path is only reached after the claim token is validated. Not a bug, but a misleading audit trail entry.

**Fix:** Remove the field or make it conditional.

---

## Positive Observations

- The recruiting token redeem flow uses an atomic SQL claim step that prevents TOCTOU races.
- Judge worker auth properly rejects workers without `secretTokenHash`.
- The in-memory rate limiter eviction handles capacity overflow correctly with O(1) FIFO.
