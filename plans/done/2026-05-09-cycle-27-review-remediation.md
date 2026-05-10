# Cycle 27 Review Remediation Plan

**Date:** 2026-05-09
**Based on:** `.context/reviews/_aggregate.md` (Cycle 27)
**HEAD:** 5771402a

---

## Active Tasks

### C27-1: Fix NaN handling in `getStaleImages` Docker stale detection

- **File:** `src/app/api/v1/admin/docker/images/route.ts:30`
- **Severity:** LOW
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer, security-reviewer, verifier (3/3)

**Problem:**
`new Date(info.Created as string).getTime()` can return `NaN` when `info.Created` is null, undefined, or an unparsable string. Any comparison with `NaN` returns `false`, so the image is never marked stale even when the Dockerfile is newer. The `as string` cast is unsafe because `inspectDockerImage` returns `Record<string, unknown>`.

**Fix:**
1. Add runtime type validation: check `typeof info.Created === "string"`
2. Add NaN validation: check `!Number.isNaN(imageCreated)` after `new Date()`
3. Return early (skip stale check) when data is invalid rather than making a false comparison

**Implementation:**
- [x] Update `getStaleImages` function with type and NaN guards
- [x] Run gates

**Exit criterion:** Invalid Docker inspect `Created` timestamps are handled gracefully instead of silently bypassing stale detection.

---

### C27-2: Add audit event for rejected DELETE Docker image operations

- **File:** `src/app/api/v1/admin/docker/images/route.ts:129-135`
- **Severity:** LOW
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer, security-reviewer, verifier (3/3)

**Problem:**
The DELETE handler does not record an audit event when `isAllowedJudgeDockerImage` rejects an image tag. The POST handler logs rejections (line 76-86), creating an asymmetric audit trail.

**Fix:**
Add `recordAuditEvent` call in the DELETE handler before returning the 400 error, matching the POST handler pattern. Include the actor ID, role, image tag, and reason.

**Implementation:**
- [x] Add `recordAuditEvent` to DELETE rejection path
- [x] Run gates

**Exit criterion:** DELETE rejections of non-judge images leave an audit trail identical in structure to POST rejections.

---

### C27-3: Fix prompt sanitization regex to catch empty injection markers

- **File:** `src/lib/judge/prompt-sanitization.ts:12`
- **Severity:** LOW
- **Confidence:** MEDIUM
- **Cross-agent agreement:** code-reviewer, security-reviewer (2/3)

**Problem:**
The pattern `/<<[^>]+>>/g` requires at least one non-`>` character between the delimiters, so `<<>>` (empty marker) is not sanitized.

**Fix:**
Change `+` to `*` in the character class repetition: `/<<[^>]*>>/g`

**Implementation:**
- [x] Update regex pattern
- [x] Add test case for `<<>>` empty marker
- [x] Run gates

**Exit criterion:** Empty `<<>>` markers are sanitized in addition to markers with content.

---

## Deferred Items

### DEFER-C27-1: Transaction wrapper inconsistency in judge/poll route
- **File+line:** `src/app/api/v1/judge/poll/route.ts:136`
- **Original finding:** C19-2 (carry-forward, 8 cycles)
- **Severity:** LOW
- **Confidence:** HIGH
- **Reason for deferral:** Low severity maintainability issue with no functional impact. Both `execTransaction` and `db.transaction` produce correct results.
- **Exit criterion:** When `execTransaction` gains behavior that `db.transaction` lacks, or during a dedicated transaction-wrapper refactor cycle.

### DEFER-C27-2: Client-side console.error usage
- **Files:** Multiple client components (22 instances)
- **Original finding:** C25-6 (carry-forward)
- **Severity:** LOW
- **Confidence:** MEDIUM
- **Reason for deferral:** Informational only. Console output in browser dev tools is not a security vulnerability.
- **Exit criterion:** When a client-side logging utility is introduced, or during a dedicated cleanup cycle.

### DEFER-C27-3: `consumedRequestKeys` WeakMap complexity
- **File+line:** `src/lib/security/api-rate-limit.ts:62-72`
- **Original finding:** C25-7 (carry-forward)
- **Severity:** LOW
- **Confidence:** MEDIUM
- **Reason for deferral:** The deduplication is best-effort and documented as such. Removing it would be a minor simplification with no functional change.
- **Exit criterion:** When the rate-limit module is refactored, or when benchmark evidence shows the WeakMap overhead is measurable.

### DEFER-C27-4: `safeJsonForScript` RegExp object creation
- **File+line:** `src/components/seo/json-ld.tsx:17-18`
- **Original finding:** C25-8 (carry-forward)
- **Severity:** LOW
- **Confidence:** LOW
- **Reason for deferral:** Micro-optimization. RegExp creation overhead is negligible for a component that renders once per page.
- **Exit criterion:** When the SEO component is refactored, or when performance profiling identifies this as a hotspot.

---

## Gate Results (Post-Implementation)

- [x] `npx eslint .` passes (0 errors)
- [x] `npx tsc --noEmit` passes
- [x] `npx next build` passes
- [x] `npx vitest run` passes — 314/315 files, 2361 tests (1 pre-existing failure: export-sanitization.test.ts requires DATABASE_URL)
- [x] `npx vitest run --config vitest.config.component.ts` passes — 68 files, 208 tests
