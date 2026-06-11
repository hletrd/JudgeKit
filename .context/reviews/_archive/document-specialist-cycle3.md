# Document Specialist — Cycle 3 Deep Review (2026-05-01)

**HEAD reviewed:** `894320ff` (main)

## Doc-code mismatch analysis

### C3-DS-1: `scoring.ts:78` JSDoc says "score column" but function accepts arbitrary strings (LOW, confidence: High)

**File:** `src/lib/assignments/scoring.ts:78-99`

The JSDoc for `buildIoiLatePenaltyCaseExpr` documents the parameters as "SQL column reference" but doesn't warn that the values are interpolated directly into SQL without validation. The doc should note that callers MUST only pass trusted column names and should never pass user-influenced input.

**Fix:** Add a `@security` annotation to the JSDoc warning about the string interpolation and requiring trusted column names only.

### C3-DS-2: `in-memory-rate-limit.ts` — no BACKOFF_CAP documented vs DB module (LOW, confidence: High)

**File:** `src/lib/security/in-memory-rate-limit.ts`

The module header comment mentions drift tracking under C7-AGG-9, but doesn't note the specific `BACKOFF_CAP` inconsistency with the DB-backed module. The `MAX_BLOCK` cap serves the same purpose but via a different mechanism.

**Fix:** Add a note in the module header about the `BACKOFF_CAP` vs `MAX_BLOCK` divergence and reference the DB module's pattern as the canonical approach.

### C3-DS-3: `participant-status.ts:99` — no comment explaining null → "submitted" mapping (LOW, confidence: Medium)

**File:** `src/lib/assignments/participant-status.ts:99`

The line `if (latestStatus === "accepted" || latestStatus == null)` has no comment explaining why null is treated the same as "accepted". This is a semantic error (per C3-CR-1), but even if the behavior were intentional, it should be documented.

**Fix:** Regardless of whether the null → "submitted" mapping is changed, the condition should have a comment explaining the intended semantics.

## AGENTS.md / docs accuracy

- `AGENTS.md` language table: 125 language variants listed, matches the 124 entries in the table (1-124 plus 6b). Accurate.
- `AGENTS.md` password validation rules match `src/lib/security/password.ts` (8-char minimum, no complexity requirements).
- `AGENTS.md` Docker image sizes are dated 2026-04-18 and may be slightly stale, but this is expected for a snapshot.
- `AGENTS.md` CSRF header name (`X-Requested-With: XMLHttpRequest`) matches the implementation in `csrf.ts:35`.

## Final sweep

No HIGH-severity doc-code mismatches. The findings are documentation improvements that would help prevent future errors.
