# Cycle 9 Review Remediation Plan

**Date:** 2026-05-09
**Review source:** `.context/reviews/_aggregate.md` (cycle 9/100)
**HEAD:** main / 7f2044e4
**Goal:** Fix all findings from cycle 9 code review.

---

## Items to implement this cycle

### 1. C9-1 — Add NaN guard in `executeCompilerRun` local fallback path
- **File:** `src/lib/compiler/execute.ts` (line 630)
- **Severity:** LOW
- **Task:** Apply the same NaN guard that exists in `tryRustRunner` (line 528-529) to the local fallback path in `executeCompilerRun`.
- **Approach:** Change `const timeLimitMs = options.timeLimitMs ?? settings.compilerTimeLimitMs;` to match the pattern in `tryRustRunner`:
  ```typescript
  const rawTimeLimitMs = options.timeLimitMs ?? settings.compilerTimeLimitMs;
  const timeLimitMs = Number.isFinite(rawTimeLimitMs) && rawTimeLimitMs > 0 ? rawTimeLimitMs : 5000;
  ```
- **Status:** DONE — committed in `ee04a9a5`

### 2. C9-2 — Remove misleading `.unref()` from `stopContainer`
- **File:** `src/lib/compiler/execute.ts` (line 316)
- **Severity:** LOW
- **Task:** Remove the `.unref()` call chained after `.on("error", ...)` in `stopContainer`. `ChildProcess` does not have an `unref()` method — it is a no-op that is misleading to readers.
- **Approach:** Remove `.unref()` from the chain. The `stdio: "ignore"` already prevents the spawned process from keeping the event loop alive.
- **Status:** DONE — committed in `ee04a9a5`

---

## Deferred items

None — both findings are code-quality/consistency issues that have simple, safe fixes.

---

## Gate results (post-fix)

- `npx eslint .` — PASS (0 errors, 0 warnings)
- `npx tsc --noEmit` — PASS
- `npx next build` — PASS
- `npx vitest run` — PASS (314 files, 2338 tests)
- `npx vitest run --config vitest.config.component.ts` — PASS (66 files, 179 tests)
