# Code Reviewer — Cycle 27

**Date:** 2026-05-09
**Cycle:** 27 of 100
**Base commit:** 5771402a
**Current HEAD:** 5771402a (clean working tree)

---

## New Findings

### C27-CR-1: Stale Docker image detection silently skipped on invalid Created timestamp

- **File:** `src/app/api/v1/admin/docker/images/route.ts:30`
- **Severity:** Low
- **Confidence:** High
- **Summary:** `new Date(info.Created as string).getTime()` can return `NaN` when `info.Created` is null, undefined, or an unparsable string. Any comparison with `NaN` returns `false`, so the image is never marked stale even when the Dockerfile is newer. The `as string` cast is unsafe because `inspectDockerImage` returns `Record<string, unknown>`.
- **Fix:** Add runtime validation: `const createdRaw = info.Created; if (typeof createdRaw !== "string") return; const imageCreated = new Date(createdRaw).getTime(); if (Number.isNaN(imageCreated)) return;`

### C27-CR-2: Prompt sanitization regex misses empty injection markers

- **File:** `src/lib/judge/prompt-sanitization.ts:12`
- **Severity:** Low
- **Confidence:** Medium
- **Summary:** The pattern `/<<[^>]+>>/g` requires at least one non-`>` character between the delimiters, so `<<>>` (empty marker) is not sanitized. While uncommon, this is a gap in the defense.
- **Fix:** Change to `/<<[^>]*>>/g` to match zero or more characters.

### C27-CR-3: DELETE handler audit gap

- **File:** `src/app/api/v1/admin/docker/images/route.ts:129-135`
- **Severity:** Low
- **Confidence:** High
- **Summary:** The DELETE handler does not record an audit event when `isAllowedJudgeDockerImage` rejects an image tag. The POST handler does log rejections (line 76-86), creating an asymmetric audit trail.
- **Fix:** Add `recordAuditEvent` call before returning the 400 error, matching the POST pattern.

---

## Carry-Forward Findings (no change at HEAD)

### C26-CR-2: Transaction wrapper inconsistency (8 cycles deferred)
- **File:** `src/app/api/v1/judge/poll/route.ts:77,136`
- **Severity:** Low
- **Confidence:** High
- **Status:** Still present. In-progress uses `execTransaction`, final uses `db.transaction`.

### C26-CR-3: Client-side console.error (22 instances)
- **Files:** Multiple client components
- **Severity:** Low
- **Confidence:** Medium
- **Status:** Deferred.

### C26-CR-4: RegExp creation per render in json-ld.tsx
- **File:** `src/components/seo/json-ld.tsx:17-18`
- **Severity:** Low
- **Confidence:** Low
- **Status:** Deferred.

### C26-CR-5: WeakMap complexity in api-rate-limit.ts
- **File:** `src/lib/security/api-rate-limit.ts:62-72`
- **Severity:** Low
- **Confidence:** Medium
- **Status:** Deferred.

---

## Prior Fixes Verified at HEAD

| Finding | Status | Evidence |
|---------|--------|----------|
| C26-1 LLM prompt sanitization | FIXED | `sanitizePromptInput` used at auto-review.ts:163; unit tests pass |
| C25-1 Trusted registry boundary | FIXED | `isTrustedRegistryImage` at docker-image-validation.ts:1-11 |
| C25-2 TABLE_MAP typing | FIXED | `Record<string, PgTable>` at import.ts:20 |
| C25-3 Stale images concurrency | FIXED | `pLimit(5)` at images/route.ts:17 |
| C25-4 Image reference regex | FIXED | Structural checks at client.ts:86-91 |
| C19-1 Keyboard shortcuts | FIXED | `getShortcutKey` at use-keyboard-shortcuts.ts:8-20 |
