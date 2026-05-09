# Cycle 26 Review Remediation Plan

**Date:** 2026-05-09
**Based on:** `.context/reviews/_aggregate.md` (Cycle 26)
**HEAD:** 5594a074

---

## Active Tasks

### C26-1: Sanitize user source code in auto-review prompts to prevent LLM prompt injection

- **File:** `src/lib/judge/auto-review.ts:162-167`
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer, security-reviewer, critic, verifier, debugger, architect, designer (7/8 agents)

**Problem:**
User-submitted source code is embedded directly into the LLM prompt without any sanitization. A malicious user can craft source code containing prompt-control sequences (e.g., "Ignore previous instructions...", "SYSTEM OVERRIDE", "<<SYS>>") to manipulate the AI review output. The manipulated output gets stored in `submissionComments` and displayed to students.

**Fix:**
1. Create a `sanitizePromptInput()` helper that strips or escapes known prompt injection markers from user content before embedding in prompts.
2. Wrap source code in a clearly delimited code block within the prompt with explicit "this is untrusted data" framing.
3. Add output guardrails: validate LLM output length and reject empty/whitespace-only responses.

**Implementation:**
- [ ] Create `src/lib/judge/prompt-sanitization.ts` with `sanitizePromptInput()` helper
- [ ] Integrate sanitization into `auto-review.ts` before embedding source code
- [ ] Add delimiter framing in the prompt template
- [ ] Add output validation (non-empty check, length cap)
- [ ] Add unit tests for sanitization function
- [ ] Run gates

**Exit criterion:** User source code containing prompt injection markers is sanitized before reaching the LLM, and LLM output is validated before storage.

---

## Deferred Items

### DEFER-C26-1: Transaction wrapper inconsistency in judge/poll route

- **File+line:** `src/app/api/v1/judge/poll/route.ts:136`
- **Severity:** LOW
- **Confidence:** HIGH
- **Original finding:** C19-2 (carry-forward, 7 cycles)
- **Reason for deferral:** Low severity maintainability issue with no functional impact. Both `execTransaction` and `db.transaction` produce correct results. The inconsistency only matters if `execTransaction` is enhanced later.
- **Exit criterion:** When `execTransaction` gains behavior that `db.transaction` lacks (e.g., retries, metrics), or during a dedicated transaction-wrapper refactor cycle.

---

### DEFER-C26-2: Client-side console.error usage

- **Files:** Multiple client components (22 instances)
- **Severity:** LOW
- **Confidence:** MEDIUM
- **Original finding:** C25-6 (carry-forward)
- **Reason for deferral:** Informational only. Console output in browser dev tools is not a security vulnerability. Replacing with a proper logger is a maintainability enhancement.
- **Exit criterion:** When a client-side logging utility is introduced, or during a dedicated cleanup cycle.

---

### DEFER-C26-3: `consumedRequestKeys` WeakMap complexity

- **File+line:** `src/lib/security/api-rate-limit.ts:62-72`
- **Severity:** LOW
- **Confidence:** MEDIUM
- **Original finding:** C25-7 (carry-forward)
- **Reason for deferral:** The deduplication is best-effort and documented as such. Removing it would be a minor simplification with no functional change.
- **Exit criterion:** When the rate-limit module is refactored, or when benchmark evidence shows the WeakMap overhead is measurable.

---

### DEFER-C26-4: `safeJsonForScript` RegExp object creation

- **File+line:** `src/components/seo/json-ld.tsx:17-18`
- **Severity:** LOW
- **Confidence:** LOW
- **Original finding:** C25-8 (carry-forward)
- **Reason for deferral:** Micro-optimization. RegExp creation overhead is negligible for a component that renders once per page.
- **Exit criterion:** When the SEO component is refactored, or when performance profiling identifies this as a hotspot.

---

## Gate Results (Pre-Implementation)

- [x] `npx eslint .` passes (0 errors)
- [x] `npx tsc --noEmit` passes
- [x] `npx next build` passes
- [x] `npx vitest run` passes
- [x] `npx vitest run --config vitest.config.component.ts` passes
