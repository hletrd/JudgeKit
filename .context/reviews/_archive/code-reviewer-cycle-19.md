# Code Review — Cycle 19/100

**Reviewer:** code-reviewer (manual — no agents registered)
**Date:** 2026-05-09
**Base commit:** 75d82a17
**Current HEAD:** def9d906

---

## Scope

Reviewed all files changed since cycle 18 aggregate (75d82a17..def9d906):
- 90+ source files across src/app, src/components, src/hooks, src/lib
- 24 test files
- Focus on correctness, edge cases, error handling, and maintainability

---

## Findings

### No new MEDIUM or HIGH findings identified.

The codebase maintains strong correctness posture after 18+ cycles of remediation.
All gates pass: eslint (0 errors), tsc --noEmit, next build, vitest run (314 files, 2352 tests), vitest component (66 files, 179 tests).

### Minor Observations (LOW / informational)

1. **`src/hooks/use-keyboard-shortcuts.ts` — modifier key interference**
   - The handler fires on `e.key` match without checking if modifier keys (Ctrl, Meta, Alt) are pressed. A shortcut mapped to "s" will fire on Ctrl+S, potentially conflicting with browser shortcuts.
   - Confidence: LOW. The calling code currently maps only navigation keys (Esc, Arrow keys) that don't overlap with browser shortcuts.
   - Suggestion: Add an explicit check for `e.ctrlKey || e.metaKey || e.altKey` before firing non-modifier shortcuts.

2. **`src/app/api/v1/judge/poll/route.ts` — inconsistent transaction wrapper**
   - In-progress status update (line 77) uses `execTransaction`, while final status update (line 136) uses `db.transaction` directly. `execTransaction` has build-phase fallback semantics; mixing the two could confuse future readers.
   - Confidence: LOW. Both paths are correct at runtime; this is a consistency/readability concern.
   - Suggestion: Use `execTransaction` for both paths.

3. **`src/components/code/compiler-client.tsx` — `handleRemoveActiveTestCase` dependency on mutable array**
   - The `useCallback` at line 230 includes `testCases` in its dependency array. Since `testCases` changes on every add/remove, the memoization is effectively defeated.
   - Confidence: LOW. Performance impact is negligible for the typical number of test cases (1-10).
   - Suggestion: Use a ref or callback ref pattern to avoid the full-array dependency.

---

## Previously Fixed (Verified)

| Finding | Status | Evidence |
|---------|--------|----------|
| C18-1 Plugin secret plaintext fallback | FIXED | `decryptPluginSecret` now has production guard at `src/lib/plugins/secrets.ts:52-74` |
| C18-2 Recruiting context caching | FIXED | JSDoc updated; React `cache()` + AsyncLocalStorage confirmed at `src/lib/recruiting/access.ts:34-119` |
| C18-3 Rate limit consolidation | FIXED | Shared `rate-limit-core.ts` extracted; both modules delegate to it |
| C18-4 Unhandled promise in auto-review | FIXED | `Promise.resolve(triggerAutoCodeReview(...)).catch(...)` at `src/app/api/v1/judge/poll/route.ts:207-209` |
| C18-5 Path traversal in `resolveStoredPath` | FIXED | Strict allowlist regex `^[a-zA-Z0-9][a-zA-Z0-9._-]+$` at `src/lib/files/storage.ts:18` |
| C18-6 Prune route repository validation | FIXED | `isAllowedJudgeDockerImage` check at `src/app/api/v1/admin/docker/images/prune/route.ts:21` |

---

## Verdict

Zero blocking findings. Code quality remains high. The three observations above are all LOW severity and can be deferred or addressed opportunistically.
