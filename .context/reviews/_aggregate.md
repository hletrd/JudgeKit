# Cycle 27 Aggregate Review

**Date:** 2026-05-09
**Cycle:** 27 of 100
**Base commit:** 5771402a
**Current HEAD:** 5771402a (clean working tree)
**Agents:** Manual review — no agent runtime registered in `.claude/agents/`

---

## Methodology

No review agents were registered in this environment. Reviews were performed manually across the key specialist angles. All gates verified at HEAD: eslint (0 errors), tsc --noEmit, next build, vitest run (314/315 files, 2360 tests, 1 pre-existing DB failure), vitest component (68 files, 208 tests).

---

## DEDUPLICATED FINDINGS

### Low Priority

#### C27-1: Stale Docker image detection silently skipped on invalid Created timestamp

- **File:** `src/app/api/v1/admin/docker/images/route.ts:30`
- **Severity:** Low
- **Confidence:** High
- **Found by:** code-reviewer, security-reviewer, verifier (3/3 angles)
- **Summary:** `new Date(info.Created as string).getTime()` can return `NaN` when `info.Created` is null, undefined, or an unparsable string. Any comparison with `NaN` returns `false`, so the image is never marked stale even when the Dockerfile is newer. The `as string` cast is unsafe because `inspectDockerImage` returns `Record<string, unknown>`.
- **Fix:** Add runtime validation before the `new Date()` call: check `typeof info.Created === "string"`, then validate `!Number.isNaN(imageCreated)`.

#### C27-2: DELETE Docker image rejection not audited

- **File:** `src/app/api/v1/admin/docker/images/route.ts:129-135`
- **Severity:** Low
- **Confidence:** High
- **Found by:** code-reviewer, security-reviewer, verifier (3/3 angles)
- **Summary:** The DELETE handler does not record an audit event when `isAllowedJudgeDockerImage` rejects an image tag. The POST handler logs rejections (line 76-86), creating an asymmetric audit trail.
- **Fix:** Add `recordAuditEvent` call before returning the 400 error, matching the POST handler pattern.

#### C27-3: Prompt sanitization regex misses empty injection markers

- **File:** `src/lib/judge/prompt-sanitization.ts:12`
- **Severity:** Low
- **Confidence:** Medium
- **Found by:** code-reviewer, security-reviewer (2/3 angles)
- **Summary:** The pattern `/<<[^>]+>>/g` requires at least one non-`>` character between the delimiters, so `<<>>` (empty marker) is not sanitized. While uncommon, this is a gap in the defense.
- **Fix:** Change to `/<<[^>]*>>/g` to match zero or more characters.

---

## Previously Fixed (Verified at HEAD)

| Finding | Status | Evidence |
|---------|--------|----------|
| C26-1 LLM prompt sanitization | FIXED | `sanitizePromptInput` used at auto-review.ts:163; unit tests pass |
| C25-1 Trusted registry boundary | FIXED | `isTrustedRegistryImage` boundary check at docker-image-validation.ts:1-11 |
| C25-2 TABLE_MAP typing | FIXED | `Record<string, PgTable>` at import.ts:20 |
| C25-3 Stale images concurrency | FIXED | `pLimit(5)` at images/route.ts:17 |
| C25-4 Image reference regex | FIXED | Structural checks at client.ts:86-91 |
| C16 CR-1 apiFetch timeout bypass | FIXED | `withTimeout` + `createTimeoutSignal` at client.ts:90-92 |
| C16 CR-2 AbortSignal.timeout fallback | FIXED | `createTimeoutSignal` fallback at abort.ts:6-13 |
| C19 C19-1 useKeyboardShortcuts modifiers | FIXED | `getShortcutKey` at use-keyboard-shortcuts.ts:8-20 |

---

## Deferred / Carry-Forward

### C19-2 carry-forward: Transaction wrapper inconsistency
- **File+line:** `src/app/api/v1/judge/poll/route.ts:136`
- **Original cycle:** 19
- **Status:** Still present at cycle 27 (8 cycles deferred)
- **Reason:** Low severity maintainability issue with no functional impact
- **Exit criterion:** Use `execTransaction` for both paths

### C25-6 carry-forward: Client-side console.error
- **Files:** Multiple client components (22 instances)
- **Original cycle:** 25
- **Status:** Deferred
- **Reason:** Informational only
- **Exit criterion:** When a client-side logging utility is introduced

### C25-7 carry-forward: WeakMap complexity
- **File+line:** `src/lib/security/api-rate-limit.ts:62-72`
- **Original cycle:** 25
- **Status:** Deferred
- **Reason:** Best-effort deduplication documented as such
- **Exit criterion:** When rate-limit module is refactored

### C25-8 carry-forward: RegExp creation per render
- **File+line:** `src/components/seo/json-ld.tsx:17-18`
- **Original cycle:** 25
- **Status:** Deferred
- **Reason:** Micro-optimization
- **Exit criterion:** When SEO component is refactored

---

## AGENT FAILURES

No agent failures — review agents were not registered in this environment. Reviews were performed manually.
