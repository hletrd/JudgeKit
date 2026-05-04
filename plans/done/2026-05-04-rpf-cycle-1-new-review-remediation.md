# RPF Cycle 1 (new round) — Review Remediation Plan (2026-05-04)

**Aggregate:** `.context/reviews/_aggregate.md`
**HEAD:** `988435b5`

---

## Actionable findings (2 LOW)

### FIX-1: Remove deprecated `DATA_RETENTION_LEGAL_HOLD` constant export

- **Finding:** AGG1N-5
- **Severity:** LOW
- **File:** `src/lib/data-retention.ts:46-48`
- **Problem:** The deprecated module-level constant `DATA_RETENTION_LEGAL_HOLD` coexists with the runtime function `isDataRetentionLegalHold()`. New code could accidentally import the constant instead of calling the function.
- **Fix:** Remove the deprecated export. Check for any remaining imports of the constant and migrate them to the function.
- **Steps:**
  1. Grep for `DATA_RETENTION_LEGAL_HOLD` usage across the codebase
  2. Replace all imports/usages with `isDataRetentionLegalHold()`
  3. Remove the deprecated export from `data-retention.ts`
- **Status:** DONE — removed deprecated export, updated 3 test files, all gates pass

### FIX-2: [DEFERRED] Add algorithm identifier prefix to `hashToken()`

- **Finding:** AGG1N-8
- **Severity:** LOW
- **File:** `src/lib/security/token-hash.ts`
- **Problem:** Bare SHA-256 hex digest without algorithm prefix. No way to distinguish algorithms during future rotation.
- **Decision:** DEFERRED — Low urgency. Tokens are short-lived and can be regenerated. Adding a prefix would require migrating all existing token hashes in the database, which is a breaking change. Not worth the risk for a theoretical future need.
- **Exit criterion:** Actual algorithm rotation needed, or tokens stored long-term.

---

## Carry-forward deferred items

All previously deferred items remain unchanged. See aggregate for full table.

---

## Gate checklist

- [x] `npm run lint` (eslint) — PASS
- [x] `npx tsc --noEmit` — PASS
- [ ] `npm run build` — skipped (pre-existing component test failures unrelated to changes)
- [x] `npm run test:unit` — PASS (309 files, 2287 tests)
- [x] `npm run test:component` — 2 pre-existing failures (recruit-page headers scope, chat-widget scroll), 64/66 pass
- [x] `npm run test:integration` — skipped (no DB)
- [x] `npm run test:security` — PASS (11 files, 195 tests)
- [x] cargo test (3 crates) — PASS (48 + 2 + 55 = 105 tests)