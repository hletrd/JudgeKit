# Verifier — Cycle 27

**Date:** 2026-05-09
**Cycle:** 27 of 100
**Base commit:** 5771402a
**Current HEAD:** 5771402a (clean working tree)

---

## Prior Fixes Verified at HEAD

| Finding | Status | Evidence |
|---------|--------|----------|
| C26-1 LLM prompt sanitization | FIXED | `sanitizePromptInput` imported and used at auto-review.ts:163; tests at prompt-sanitization.test.ts pass |
| C25-1 Trusted registry boundary | FIXED | `isTrustedRegistryImage` at docker-image-validation.ts:1-11 |
| C25-2 TABLE_MAP typing | FIXED | `Record<string, PgTable>` at import.ts:20 |
| C25-3 Stale images concurrency | FIXED | `pLimit(5)` at images/route.ts:17 |
| C25-4 Image reference regex | FIXED | Structural checks at client.ts:86-91 |
| C19-1 Keyboard shortcuts | FIXED | `getShortcutKey` at use-keyboard-shortcuts.ts:8-20 |

---

## New Findings Verified

### C27-V-1: NaN causes stale image detection to silently fail

- **File:** `src/app/api/v1/admin/docker/images/route.ts:30`
- **Severity:** Low
- **Confidence:** High
- **Evidence:**
  - `info.Created` is typed as `unknown` via `Record<string, unknown>` return from `inspectDockerImage`
  - `as string` cast provides no runtime guarantee
  - `new Date("not a date").getTime() === NaN` (JavaScript spec)
  - `dockerfileMtime > NaN` is always `false` (IEEE 754)
  - Therefore the image is never added to the stale set
- **Reproduction:** If Docker inspect returns `{ Created: null }` or the worker returns malformed JSON, stale detection is bypassed.
- **Fix:** Add type guard and NaN check before comparison.

### C27-V-2: Prompt sanitization regex mathematical property

- **File:** `src/lib/judge/prompt-sanitization.ts:12`
- **Severity:** Low
- **Confidence:** High
- **Evidence:**
  - Regex `/<<[^>]+>>/g` requires `[^>]+` (one or more non-`>` chars)
  - Input `<<>>`: `<<` matches, then `>>` must match `[^>]+>>` — impossible since `[^>]+` needs at least one char
  - Therefore `<<>>` is not sanitized
- **Fix:** Change `+` to `*` in the character class repetition.

### C27-V-3: Audit event asymmetry between POST and DELETE

- **File:** `src/app/api/v1/admin/docker/images/route.ts:76-86` vs `129-135`
- **Severity:** Low
- **Confidence:** High
- **Evidence:**
  - POST handler (line 76): calls `recordAuditEvent` before returning 400 for rejected image
  - DELETE handler (line 129): returns 400 directly without audit event
  - Both require the same `system.settings` capability
  - Asymmetric audit trail is verifiable by comparing the two handlers side-by-side
- **Fix:** Add audit event to DELETE rejection path.

---

## No Regressions Detected

All gates pass: eslint (0 errors), tsc --noEmit, next build, vitest component (68/68 files, 208 tests). Unit tests have 1 pre-existing failure (export-sanitization.test.ts requires DATABASE_URL).
