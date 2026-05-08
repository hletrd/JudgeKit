# Cycle 8 Review Remediation Plan

**Date:** 2026-05-09
**Review source:** `.context/reviews/_aggregate.md` (cycle 8/100)
**HEAD:** main / 871de9c4
**Goal:** Fix all findings from cycle 8 code review.

---

## Items to implement this cycle

### 1. C8-1 — Validate Rust compiler runner response shape in `tryRustRunner`
- **File:** `src/lib/compiler/execute.ts` (line 563)
- **Severity:** HIGH
- **Task:** Add runtime shape validation after parsing the Rust runner JSON response. Verify that required fields (`stdout`, `stderr`, `timedOut`, `oomKilled`) have the expected types before returning the result. Return `null` (triggering local fallback) if validation fails.
- **Approach:** After the existing `!data` null check, add a type-guard check that validates `typeof data.stdout === "string"`, `typeof data.stderr === "string"`, `typeof data.timedOut === "boolean"`, and `typeof data.oomKilled === "boolean"`. Log a warning when validation fails.
- **Status:** DONE — committed in `6af20c70`

### 2. C8-2 — Validate worker JSON responses in `callWorkerJson` and call sites
- **File:** `src/lib/docker/client.ts` (line 114), plus call sites
- **Severity:** HIGH
- **Task:** Add runtime validation for worker JSON responses. Change `callWorkerJson` to accept an optional validator function (same pattern as `rate-limiter-client.ts` cycle 7 fix), and add validators at each call site.
- **Approach:**
  1. Modify `callWorkerJson<T>` signature to accept an optional `validate?: (data: unknown) => boolean` parameter.
  2. If `validate` is provided and returns false, throw an error with a generic message (the existing catch blocks will handle it).
  3. Add validators at each call site:
     - `listDockerImages`: validate array of objects with string fields
     - `inspectDockerImage`: validate object return (already `Record<string, unknown>`, minimal validation needed)
     - `buildDockerImage`: validate `typeof data.logs === "string"`
     - `getDiskUsage`: validate object with string fields
- **Status:** DONE — committed in `21e064b3`

---

## Deferred items

None — both findings are security/correctness issues that affect sidecar client contracts. They follow the same pattern as C7-1 and C7-2 which were fixed in cycle 7. Not deferrable per repo rules (CLAUDE.md defers only with explicit justification; correctness findings must be fixed).

---

## Gate results (post-fix)

- `npx eslint .` — PASS (0 errors, 0 warnings)
- `npx tsc --noEmit` — PASS
- `npx next build` — PASS
- `npx vitest run` — PASS (314 files, 2338 tests)
- `npx vitest run --config vitest.config.component.ts` — PASS (66 files, 179 tests)

## Deploy results

- **test.worv.ai** — SUCCESS (HTTP 200 verified)
- **algo.xylolabs.com** — SUCCESS (HTTP 200 verified)
