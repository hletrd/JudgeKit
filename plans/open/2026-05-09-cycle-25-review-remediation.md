# Cycle 25 Review Remediation Plan

**Date:** 2026-05-09
**Based on:** `.context/reviews/_aggregate.md` (Cycle 25)
**HEAD:** 75d82a17

---

## Active Tasks

### C25-1: Fix trusted registry prefix validation boundary

- **File:** `src/lib/judge/docker-image-validation.ts:1-3`
- **Severity:** MEDIUM
- **Confidence:** MEDIUM
- **Cross-agent agreement:** security-reviewer, critic, verifier

**Problem:**
`isTrustedRegistryImage` uses `startsWith` without enforcing a boundary after the prefix. If `TRUSTED_DOCKER_REGISTRIES` contains `registry.io`, a malicious image `registry.io.evil.com/judge-cpp` would pass validation.

**Fix:**
Add boundary check ensuring the character after the prefix is `/`, `:`, or end-of-string.

**Implementation:**
- [ ] Modify `isTrustedRegistryImage` in `docker-image-validation.ts`
- [ ] Verify existing tests pass
- [ ] Add test for boundary case (`registry.io` should NOT match `registry.io.evil.com/...`)
- [ ] Run gates

---

### C25-2: Replace `TABLE_MAP: Record<string, any>` with typed map

- **File:** `src/lib/db/import.ts:19`
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer, critic

**Problem:**
The import engine uses `Record<string, any>` for table references, completely bypassing TypeScript type checking in a critical data-migration path.

**Fix:**
Derive a properly typed map from `TABLE_ORDER`. Use a mapped type or `satisfies` constraint.

**Implementation:**
- [ ] Replace `Record<string, any>` with a typed construction
- [ ] Verify import functionality still works
- [ ] Run gates

---

### C25-3: Add concurrency limit to `getStaleImages`

- **File:** `src/app/api/v1/admin/docker/images/route.ts:16-38`
- **Severity:** LOW
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer, perf-reviewer, verifier

**Problem:**
`Promise.all(images.map(...))` spawns unbounded concurrent `stat` + `inspectDockerImage` calls over all Docker images (100+).

**Fix:**
Add `pLimit(5)` for the stale check mapping.

**Implementation:**
- [ ] Import `pLimit` in `route.ts`
- [ ] Wrap the `images.map(...)` with a concurrency limiter
- [ ] Run gates

---

### C25-4: Tighten `isValidImageReference` regex

- **File:** `src/lib/docker/client.ts:86-88`
- **Severity:** LOW
- **Confidence:** MEDIUM
- **Cross-agent agreement:** security-reviewer, code-reviewer

**Problem:**
The regex allows malformed references like `judge-cpp:`, `judge-/cpp`, `a/`.

**Fix:**
Add explicit validation or tighten the regex to reject empty tag components and malformed segments.

**Implementation:**
- [ ] Update `isValidImageReference` regex or add structural checks
- [ ] Add test cases for malformed references
- [ ] Run gates

---

## Deferred Items

### DEFER-C25-1: Transaction wrapper inconsistency in judge/poll route

- **File+line:** `src/app/api/v1/judge/poll/route.ts:136`
- **Severity:** LOW
- **Confidence:** HIGH
- **Original finding:** C19-2 (carry-forward, 6 cycles)
- **Reason for deferral:** Low severity maintainability issue with no functional impact. Both `execTransaction` and `db.transaction` produce correct results. The inconsistency only matters if `execTransaction` is enhanced later.
- **Exit criterion:** When `execTransaction` gains behavior that `db.transaction` lacks (e.g., retries, metrics), or during a dedicated transaction-wrapper refactor cycle.

---

### DEFER-C25-2: Client-side console.error usage

- **Files:** Multiple client components (17 instances)
- **Severity:** LOW
- **Confidence:** MEDIUM
- **Original finding:** C25-6
- **Reason for deferral:** Informational only. Console output in browser dev tools is not a security vulnerability. Replacing with a proper logger is a maintainability enhancement.
- **Exit criterion:** When a client-side logging utility is introduced, or during a dedicated cleanup cycle.

---

### DEFER-C25-3: `consumedRequestKeys` WeakMap complexity

- **File+line:** `src/lib/security/api-rate-limit.ts:62-72`
- **Severity:** LOW
- **Confidence:** MEDIUM
- **Original finding:** C25-7
- **Reason for deferral:** The deduplication is best-effort and documented as such. Removing it would be a minor simplification with no functional change.
- **Exit criterion:** When the rate-limit module is refactored, or when benchmark evidence shows the WeakMap overhead is measurable.

---

### DEFER-C25-4: `safeJsonForScript` RegExp object creation

- **File+line:** `src/components/seo/json-ld.tsx:17-18`
- **Severity:** LOW
- **Confidence:** LOW
- **Original finding:** C25-8
- **Reason for deferral:** Micro-optimization. RegExp creation overhead is negligible for a component that renders once per page.
- **Exit criterion:** When the SEO component is refactored, or when performance profiling identifies this as a hotspot.

---

## Gate Results (Baseline)

- [x] `npx eslint .` passes (0 errors)
- [x] `npx tsc --noEmit` passes
- [x] `npx next build` passes
- [x] `npx vitest run` passes
- [x] `npx vitest run --config vitest.config.component.ts` passes — 68 files, 208 tests

---

## Implementation Order

1. C25-1 (Trusted registry boundary) — security fix, add test
2. C25-4 (Image reference regex) — related validation fix
3. C25-3 (Stale images concurrency) — performance fix
4. C25-2 (TABLE_MAP typing) — type safety improvement

---

## Notes

All prior cycle fixes verified at HEAD:
- C16 apiFetch timeout bypass: FIXED
- C16 AbortSignal.timeout fallback: FIXED
- C19 useKeyboardShortcuts modifiers: FIXED
