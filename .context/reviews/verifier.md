# Verifier — Cycle 29

**Date:** 2026-05-09
**Cycle:** 29 of 100
**Base commit:** 81c5daa8
**Current HEAD:** 81c5daa8 (clean working tree)

---

## Prior Fixes Verified at HEAD

| Finding | Status | Evidence |
|---------|--------|----------|
| C28 localStorage try/catch | FIXED | compiler-client.tsx:186, submission-detail-client.tsx:94 both wrapped |
| C26-1 LLM prompt sanitization | FIXED | sanitizePromptInput at auto-review.ts:163 |
| C25-1 Trusted registry boundary | FIXED | docker-image-validation.ts |
| C25-2 TABLE_MAP typing | FIXED | Record<string, PgTable> at import.ts:20 |
| C25-3 Stale images concurrency | FIXED | pLimit(5) at images/route.ts:17 |
| C25-4 Image reference regex | FIXED | client.ts:86-91 |
| C19-1 Keyboard shortcuts | FIXED | use-keyboard-shortcuts.ts:8-20 |

---

## New Findings Verified

### C29-V-1: Recruiting token regex lacks upper bound

- **File:** `src/lib/auth/config.ts:208`
- **Severity:** Medium
- **Confidence:** High
- **Evidence:**
  - Regex `/^[-A-Za-z0-9_]{16,}$/` quantifier `{16,}` has no upper bound
  - JavaScript `RegExp.prototype.test()` allocates the full input string before evaluation
  - Node.js default max string length is ~512MB (V8 heap limit)
  - An attacker can POST a multi-megabyte recruitToken before the regex rejects it
  - The token also flows to `recordLoginEvent({ attemptedIdentifier: "recruitToken" })` — could be logged
- **Reproduction:** Send a 10MB recruitToken to /api/auth/callback/credentials
- **Fix:** Change regex to `/^[-A-Za-z0-9_]{16,128}$/`

### C29-V-2: Test infrastructure failure verified

- **File:** `tests/unit/db/export-sanitization.test.ts`
- **Severity:** Low
- **Confidence:** High
- **Evidence:**
  - Running `vitest run` produces: `Error: DATABASE_URL is required` at src/lib/db/index.ts:36
  - The test file imports `src/lib/db/export.ts` which imports `src/lib/db/index.ts`
  - No mock is configured for the db module in this test
- **Fix:** Mock db or add test DATABASE_URL

---

## No Regressions Detected

All gates pass: eslint (0 errors), tsc --noEmit, next build, vitest component (68/68 files, 208 tests). Unit tests: 314 passed, 1 pre-existing failure.
