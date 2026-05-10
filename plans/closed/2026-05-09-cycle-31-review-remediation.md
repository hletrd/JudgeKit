# Cycle 31 Review Remediation Plan

**Date:** 2026-05-09
**Based on:** `.context/reviews/_aggregate.md` (Cycle 31)
**HEAD:** 975179c4

---

## Active Tasks

### C31-1: Remove `res.statusText` from error fallback in compiler-client

- **File:** `src/components/code/compiler-client.tsx:268`
- **Severity:** LOW
- **Confidence:** LOW
- **Original finding:** C31-21

**Problem:**
```ts
const rawError = data.error || data.message || res.statusText || t("requestFailed");
```
`res.statusText` is always in English (e.g., "Not Found", "Internal Server Error"). If displayed to Korean users in the test case error state, it shows untranslated English text. The toast already uses `t("runFailed")`, but the `errorMessage` stored in test case state may render the English statusText.

**Fix:**
Remove `res.statusText` from the fallback chain. Use only translated strings:
```ts
const rawError = data.error || data.message || t("requestFailed");
```

**Implementation:**
- [x] Update error fallback chain in compiler-client.tsx
- [x] Run gates

**Exit criterion:** `res.statusText` is no longer used as a user-visible error fallback.

---

### C31-2: Extract RegExp constants to module level in json-ld

- **File:** `src/components/seo/json-ld.tsx:17-18`
- **Severity:** LOW
- **Confidence:** LOW
- **Original finding:** C31-22 / C25-8

**Problem:**
```ts
.replace(new RegExp(String.fromCharCode(0x2028), "g"), "\\u2028")
.replace(new RegExp(String.fromCharCode(0x2029), "g"), "\\u2029");
```
Creates `new RegExp(...)` on every `safeJsonForScript` invocation. These RegExp objects are identical on every call and can be module-level constants.

**Fix:**
Extract to module-level constants:
```ts
const U2028_REGEX = new RegExp(String.fromCharCode(0x2028), "g");
const U2029_REGEX = new RegExp(String.fromCharCode(0x2029), "g");
```
Then use `.replace(U2028_REGEX, "\\u2028")` and `.replace(U2029_REGEX, "\\u2029")`.

**Implementation:**
- [x] Extract RegExp objects to module-level constants
- [x] Run gates

**Exit criterion:** RegExp objects are created once at module load time, not per function call.

---

## Carry-Forward Deferred Items (unchanged)

- **DEFER-C30-4:** Remaining `.json()` before `.ok` in non-critical components (11 files) — MEDIUM
- **DEFER-C30-5:** Raw API error strings without i18n translation (7+ instances) — MEDIUM
- **DEFER-C30-6:** `as { error?: string }` unsafe type assertions (22+ instances) — MEDIUM
- **C19-2:** Transaction wrapper inconsistency (`judge/poll/route.ts:136`) — LOW, 11 cycles deferred
- **C25-6:** Client-side console.error (8 remaining instances) — LOW, deferred
- **C25-7:** WeakMap complexity (`api-rate-limit.ts:62-72`) — LOW, deferred
- **C29 AGG-10:** Admin routes bypass createApiHandler (15 routes) — MEDIUM, deferred
- **C29 AGG-12:** Recruiting validate endpoint token brute-force — MEDIUM, deferred
- **C29 AGG-13:** files/[id] GET selects storedName — LOW, deferred
- **C29 AGG-14:** Admin settings page exposes DB host/port — LOW, deferred
- **C29 AGG-15:** Missing error boundaries — MEDIUM, deferred
- **C29 AGG-17:** Hardcoded English in throw new Error (`permissions.ts`) — LOW, deferred
- **C29 AGG-18:** Hardcoded English fallback strings in code-editor.tsx — LOW, deferred
- **C29 AGG-19:** formData.get() cast assertions without validation — LOW, deferred

---

## Gate Results (Post-Implementation)

- [x] `npx eslint .` passes (0 errors)
- [x] `npx tsc --noEmit` passes
- [x] `npx next build` passes
- [x] `npx vitest run` passes — 315 files, 2382 tests (all pass)
- [x] `npx vitest run --config vitest.config.component.ts` passes — 68 files, 208 tests (all pass)
