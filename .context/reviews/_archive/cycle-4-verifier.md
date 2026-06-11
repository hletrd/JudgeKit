# Cycle 4 Verifier Review

**Reviewer:** verifier
**Base commit:** 5086ec22

## Findings

### F1 — Contest export unbounded data loading (re-verify cycle 3 partial fix)
- **Severity:** HIGH
- **Confidence:** HIGH
- **File:** `src/app/api/v1/contests/[assignmentId]/export/route.ts:67`
- **Description:** Cycle 3 fixed the admin submissions CSV export with `.limit(10000)` (CSV-02). However, the contest export route was missed because it uses `computeContestRanking` rather than a direct Drizzle query. This route loads all contest ranking entries into memory. Verified by reading the code: `const { scoringModel, entries } = await computeContestRanking(assignmentId)` — no limit applied.
- **Evidence:** The function `computeContestRanking` is defined in `src/lib/assignments/contest-scoring.ts` and returns all entries.
- **Suggested fix:** Add a row limit or streaming.

### F2 — CSV escape divergence verified: contest export uses different formula-injection mitigation
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Files:**
  - `src/lib/csv/escape-field.ts:9-23` — tab prefix (`\t`)
  - `src/app/api/v1/contests/[assignmentId]/export/route.ts:17` — single-quote prefix (`'`)
- **Description:** Verified by comparing the two implementations side by side. The shared utility prefixes dangerous characters with `\t`; the contest export uses `'`. These produce different output for the same input.
- **Evidence:** `escapeCsvField("=CMD")` returns `"\t=CMD"`, but `escapeCsvCell("=CMD")` returns `"'=CMD"`.
- **Suggested fix:** Unify to shared utility.

### F3 — `parsePagination` uses `parseInt` instead of `parsePositiveInt`
- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/lib/api/pagination.ts:14-17`
- **Description:** Verified. The `parseInt(...) || 1` pattern works correctly today (NaN is falsy, so `NaN || 1` is `1`). However, it is inconsistent with the project-wide `parsePositiveInt` standard adopted in cycles 2-3. The risk is future refactoring that could introduce a `Math.max(1, NaN)` regression.
- **Suggested fix:** Refactor to `parsePositiveInt`.

### F4 — Verification of prior-cycle fixes (CONFIRMED)
- CSV-02 (admin submissions export limit): CONFIRMED — `.limit(MAX_EXPORT_ROWS)` at line 106
- NAFIX-02 (chat-logs and anti-cheat parseInt): CONFIRMED — both use `parsePositiveInt`
- CHAT-LOG-01 (chat-logs COUNT(*) OVER()): CONFIRMED — single query with `COUNT(*) OVER() AS total`
- WS-PHASE1 (workspace route group elimination): CONFIRMED — `(workspace)` directory no longer exists
- TEST-01 (submissions export, anti-cheat tests): CONFIRMED — test files exist

## Revalidated non-actions

- CLOSED-01: Password-complexity escalation — still invalid under repo policy
- CLOSED-02: JSON-LD script escaping — still fixed on current HEAD
- CLOSED-03: Shell-command prefix bypass — still fixed on current HEAD
