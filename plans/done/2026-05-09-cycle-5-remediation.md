# Cycle 5 Review Remediation Plan

**Created:** 2026-05-09
**Review Head:** 6fc4a4a2
**Findings Source:** `.context/reviews/_aggregate.md`

---

## Items to implement this cycle

### 1. C5-AGG-1 — Remove redundant Promise.race timeout in auto-review [LOW]
- **File:** `src/lib/judge/auto-review.ts:174-199`
- **Task:** Remove the custom `Promise.race` with `timeoutController` and rely on the provider's existing `AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS)`. The provider timeout (25s) always fires before the custom timeout (30s), making the custom timeout dead code. Removing it eliminates the abort listener leak (C5-AGG-1) and simplifies the code.
- **Status:** TODO

### 2. C5-AGG-3 — Add defensive guard for SSE timeout configuration [LOW]
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:367-372`
- **Task:** Validate `sseConfig.sseTimeoutMs` before passing to `setTimeout`. Ensure the value is finite and at least 1000ms. Fall back to the default `300_000` if invalid.
- **Status:** TODO

### 3. C5-AGG-4 — Strengthen backup ZIP path-traversal check [LOW]
- **File:** `src/lib/db/export-with-files.ts:258-260`
- **Task:** Replace the manual character-check with `path.normalize()` before validating the stored name, or use a stricter whitelist pattern.
- **Status:** TODO

---

## Deferred items

| ID | Severity | File+line | Status | Exit criterion |
|---|---|---|---|---|
| C5-AGG-1 listener leak only | LOW | `src/lib/judge/auto-review.ts:192` | DEFERRED (superseded by C5-AGG-2 fix) | The leak is fixed when the redundant Promise.race is removed (item 1 above). |

No other deferred items. All findings are actionable and will be implemented this cycle.

---

## Gate Results (pre-fix)

- `npx eslint .`: PASS (no errors, no warnings)
- `npx tsc --noEmit`: PASS
- `npx next build`: PASS
- `npx vitest run`: PASS (314 files, 2338 tests)
- `npx vitest run --config vitest.config.component.ts`: PASS (66 files, 179 tests)

---

## Implementation order

1. C5-AGG-2 (remove redundant Promise.race) — simplest fix, removes dead code
2. C5-AGG-3 (SSE timeout guard) — defensive validation
3. C5-AGG-4 (backup ZIP path traversal) — strengthen existing check

---

## Gate Results (post-fix)

- `npx eslint .`: PASS (no errors, no warnings)
- `npx tsc --noEmit`: PASS
- `npx next build`: PASS
- `npx vitest run`: PASS (314 files, 2338 tests)
- `npx vitest run --config vitest.config.component.ts`: PASS (66 files, 179 tests)

---

## Deploy Results

- **test.worv.ai**: SUCCESS (2026-05-09)
- **algo.xylolabs.com**: SUCCESS (2026-05-09)
  - App image built and running
  - Database migrations: no changes detected
  - Pre-deploy backup saved
  - All containers healthy
  - Nginx configured and reloaded
  - HTTPS endpoint verified (HTTP 200)
