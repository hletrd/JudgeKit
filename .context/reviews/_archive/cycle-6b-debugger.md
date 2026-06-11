# Debugger — Cycle 6b Deep Review

**Date:** 2026-04-19
**Base commit:** 64f02d4d

## Findings

### D1: Files GET route `countResult.count` may be string, causing `apiPaginated` to receive wrong type
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/app/api/v1/files/route.ts:188`
- **Issue:** `countResult.count` from `sql<number>\`count(*)\`` is typed as `number` but Drizzle/PG can return it as a string. The users route correctly wraps with `Number()`. The files route passes it raw to `apiPaginated(rows, page, limit, countResult.count)`. If the value arrives as a string, the `total` field in the response will be `"42"` instead of `42`, breaking API consumers that expect a number.
- **Concrete failure:** Client-side pagination math (`Math.ceil(total / limit)`) would produce `NaN` if `total` is a string.
- **Fix:** Change to `Number(countResult.count)`.

### D2: Group assignment export `String(score)` converts null-safe value unnecessarily
- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts:72`
- **Issue:** `const score = row.bestTotalScore ?? ""` already null-guards, then `String(score)` is applied. When `bestTotalScore` is a number, `String(42)` gives `"42"`. When null, `String("")` gives `""`. Functionally correct but the `String()` wrapper is redundant since `escapeCsvField` already handles strings.
- **Fix:** Remove `String()` wrapper — `row.bestTotalScore ?? ""` is already a string-or-number that `escapeCsvField` handles.

### D3: SSE onPollResult closure captures `closed` variable that may be stale
- **Severity:** LOW
- **Confidence:** LOW
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:302`
- **Issue:** The `onPollResult` callback checks `if (closed) return;` but `closed` is a local variable in the `start` callback, not a ref. Since JavaScript closures capture the variable (not the value), and `close()` sets `closed = true`, this actually works correctly. Flagged for awareness only — no bug.
- **Fix:** None needed. The closure correctly shares the mutable variable.
