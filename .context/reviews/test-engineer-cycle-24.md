# Test Engineer — Cycle 24

**Date:** 2026-04-24
**Reviewer:** test-engineer
**Scope:** Test coverage gaps, flaky tests, TDD opportunities

---

## Findings

### TE-1: [MEDIUM] No Tests for `validateZipDecompressedSize` ZIP Bomb Prevention

**Confidence:** HIGH
**Citations:** `src/lib/files/validation.ts:55-85`

The `validateZipDecompressedSize` function implements critical security logic to prevent ZIP bombs, but there are no unit tests for it. The function handles:
- Total decompressed size exceeding the limit
- Single entry exceeding the per-entry cap
- Entry count exceeding 10,000
- Invalid/corrupt ZIP files

Without tests, regressions in ZIP bomb protection could be introduced silently.

**Fix:** Add a unit test file `tests/unit/files/zip-validation.test.ts` that tests:
1. A valid ZIP under the limit passes
2. A ZIP exceeding total decompressed size is rejected
3. A ZIP with a single entry exceeding the per-entry cap is rejected
4. A corrupt ZIP is rejected
5. An empty ZIP passes

---

### TE-2: [LOW] No Tests for `getRetentionCutoff` Clock Skew Behavior

**Confidence:** MEDIUM
**Citations:** `src/lib/data-retention.ts:38-40`

`getRetentionCutoff` uses `Date.now()` by default but accepts an optional `now` parameter. There are no tests verifying that:
1. The cutoff date is computed correctly
2. The `now` parameter override works

**Fix:** Add a simple unit test that verifies the cutoff date with a known `now` value.

---

### TE-3: [LOW] No Tests for `contentDispositionAttachment` RFC 5987 Encoding

**Confidence:** MEDIUM
**Citations:** `src/lib/http/content-disposition.ts:35-48`

The `contentDispositionAttachment` function produces RFC 5987 `filename*` encoding for Unicode filenames. While the implementation looks correct, there are no tests verifying:
1. ASCII-only filenames produce a valid header
2. Korean/CJK filenames are correctly percent-encoded
3. Special characters (quotes, semicolons) are handled safely

**Fix:** Add a unit test file `tests/unit/http/content-disposition.test.ts`.

---

## Files Reviewed

- `src/lib/files/validation.ts` (full)
- `src/lib/data-retention.ts` (full)
- `src/lib/http/content-disposition.ts` (full)
- `tests/unit/` (directory scan for existing test coverage)
