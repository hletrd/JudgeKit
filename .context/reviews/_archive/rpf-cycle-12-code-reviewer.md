# Code Review — Cycle 12 (HEAD: ecfa0b6c)

**Date:** 2026-05-11
**Reviewer:** code-reviewer
**Scope:** Entire repository, focusing on files modified in cycle 11 and adjacent code

---

## Findings

### C12-CR-1: apiFetch leaks timeout signals when no caller signal is provided
**Severity:** MEDIUM | **Confidence:** High
**File:** `src/lib/api/client.ts:97-98`

When `apiFetch` is called without an `init.signal`, it creates a timeout signal via `createTimeoutSignal(30_000)` (line 97) and returns the fetch promise directly (line 98). Unlike the branch above (lines 91-94) where `withTimeout` is used and `cleanupWithTimeout` is called in `.finally()`, this branch never cleans up the timeout signal.

The `createTimeoutSignal` function uses `setTimeout(() => controller.abort(), ms)` (src/lib/abort.ts:11). When the fetch completes successfully before the timeout, the timer is never cleared, causing a dangling timer until it fires. With high-frequency apiFetch calls (e.g., polling, auto-refresh), this accumulates timers and causes memory pressure.

**Fix:** Add `.finally(() => cleanupWithTimeout(signal))` to the return statement on line 98, or refactor to always use `withTimeout` with a synthetic never-aborting signal.

---

### C12-CR-2: normalizeSubmission still contains redundant and unsafe as casts
**Severity:** LOW | **Confidence:** High
**File:** `src/hooks/use-submission-polling.ts:48, 50, 52, 75, 77, 79, 82, 257`

Cycle 11 replaced some `as` casts with runtime narrowing but left several in place:
- Line 48: `const record: Record<string, unknown> = result;` — result is `unknown` from map callback, this is an implicit cast.
- Lines 50, 52: `(rawTestCase as Record<string, unknown>)` — after null/type check, still casts.
- Lines 75, 77, 79, 82: Same pattern for `user` and `problem`.
- Line 257: `(await response.json().catch(() => ({ data: null }))) as { data?: Record<string, unknown> | null };` — unsafe cast after JSON parse.

These casts mask potential runtime type mismatches. The cycle 11 refactor was incomplete.

**Fix:** Replace remaining `as` casts with runtime narrowing (typeof checks) or proper Zod schema validation.

---

### C12-CR-3: countdown-timer.tsx retains unsafe as cast in syncTime
**Severity:** LOW | **Confidence:** High
**File:** `src/components/exam/countdown-timer.tsx:89`

Line 89: `return res.json().catch(() => null) as Promise<{ timestamp: number } | null>;`

The `catch(() => null)` returns `null` which is not a `Promise<{ timestamp: number } | null>`. The `as` cast masks this type error. While the `.then()` on line 91 handles the null case, the cast is still unsafe.

**Fix:** Remove the `as` cast and properly type the chain, or use runtime validation of the parsed JSON shape.

---

### C12-CR-4: Compiler execute.ts has unsafe as cast after JSON parse
**Severity:** LOW | **Confidence:** High
**File:** `src/lib/compiler/execute.ts:567`

`const data = (await response.json().catch(() => null)) as CompilerRunResult | null;`

Same pattern as C12-CR-3: unsafe cast after catch returns null. The subsequent shape validation does runtime checks, but the cast allows any value to pass through until those checks.

**Fix:** Remove the `as` cast; the variable is already validated below.

---

### C12-CR-5: import-transfer.ts has unsafe JSON.parse as T casts
**Severity:** LOW | **Confidence:** High
**File:** `src/lib/db/import-transfer.ts:67, 89`

Both `readJsonBodyWithLimit` and `readUploadedJsonFileWithLimit` use `JSON.parse(text) as T` without any validation. Malformed or malicious JSON could cause downstream crashes.

**Fix:** Use Zod schema validation or runtime shape checking before casting.

---

### C12-CR-6: rate-limiter-client.ts unsafe casts after JSON parse
**Severity:** LOW | **Confidence:** High
**File:** `src/lib/security/rate-limiter-client.ts:83, 134, 156`

Line 83: `const data = (await response.json().catch(() => null)) as T | null;`
Lines 134, 156: `const d = data as Record<string, unknown>;` inside validators.

The cast at line 83 is particularly dangerous because `T` is a generic type parameter — the caller expects a specific shape but gets an unchecked value.

**Fix:** Remove the `as T | null` cast; validate the shape before returning.

---

## Final Sweep

Reviewed all files changed in cycle 11 plus 30+ additional source files. No other critical issues found. The dominant pattern is incomplete removal of `as` casts from cycle 11's partial refactoring.
