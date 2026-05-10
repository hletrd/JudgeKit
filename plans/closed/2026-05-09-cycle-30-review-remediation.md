# Cycle 30 Review Remediation Plan

**Date:** 2026-05-09
**Based on:** `.context/reviews/_aggregate.md` (Cycle 30)
**HEAD:** 22623e07

---

## Active Tasks

### C30-1: Fix inconsistent `EXTRACT(EPOCH)` casting in judge claim route

- **File:** `src/app/api/v1/judge/claim/route.ts:199-200`
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer, verifier, debugger (3/3)

**Problem:**
The worker path in the judge claim SQL returns `EXTRACT(EPOCH FROM s.judged_at) AS "judgedAt"` without a `::bigint` cast, while the non-worker path uses `::bigint`. PostgreSQL's `EXTRACT(EPOCH)` returns `double precision` which may come back as a string in some driver configurations, causing Zod validation to fail.

**Fix:**
Add `::bigint` cast to the worker path to match the non-worker path:
```typescript
EXTRACT(EPOCH FROM s.judged_at)::bigint AS "judgedAt",
EXTRACT(EPOCH FROM s.submitted_at)::bigint AS "submittedAt"
```

**Implementation:**
- [x] Update worker path SQL in claim route
- [x] Run gates

**Exit criterion:** Both worker and non-worker paths use consistent `::bigint` casting for epoch extraction.

---

### C30-2: Convert JSZip static imports to dynamic imports

- **Files:** `src/lib/files/validation.ts:3`, `src/lib/db/export-with-files.ts:1`
- **Severity:** LOW
- **Confidence:** HIGH
- **Cross-agent agreement:** perf-reviewer, architect (2/2)

**Problem:**
JSZip is statically imported at the module level in two server-side utility files, adding ~100KB to cold-start import overhead. The codebase already uses dynamic import pattern in `create-problem-form.tsx`.

**Fix:**
Convert static `import JSZip from "jszip"` to dynamic `const JSZip = (await import("jszip")).default` inside the functions that use it.

**Implementation:**
- [x] Update `src/lib/files/validation.ts` to use dynamic import
- [x] Update `src/lib/db/export-with-files.ts` to use dynamic import
- [x] Run gates

**Exit criterion:** JSZip is only loaded dynamically when needed, reducing module-level import overhead.

---

### C30-3: Address `.json()` before `.ok` check anti-pattern in critical client components

- **Severity:** HIGH
- **Confidence:** HIGH
- **Original finding:** Cycle 29 AGG-2

**Problem:**
Client-side components call `.json()` before checking `response.ok`. When a reverse proxy returns HTML (e.g., 502 Bad Gateway), `.json()` throws `SyntaxError`, caught by `.catch(() => ({}))` which swallows the error silently.

**Affected files (priority order):**
1. `src/components/problem/problem-submission-form.tsx` (critical user flow)
2. `src/components/submissions/submission-detail-client.tsx` (critical user flow)
3. `src/components/code/compiler-client.tsx` (critical user flow)
4. `src/components/exam/start-exam-button.tsx` (exam-critical)

**Fix:**
Create a `safeParseApiResponse<T>()` helper in `src/lib/api/client.ts` that checks `res.ok` first, then parses JSON with proper error handling. Apply to the 4 critical files above.

**Implementation:**
- [x] Create `parseApiResponse` helper (named `parseApiResponse` to align with existing `apiFetchJson` naming)
- [x] Update `compiler-client.tsx` and `problem-submission-form.tsx` (anti-pattern found and fixed; `submission-detail-client.tsx` and `start-exam-button.tsx` already used correct pattern)
- [x] Add unit tests for helper (4 test cases)
- [x] Update component test mock for `compiler-client.test.tsx`
- [x] Run gates

**Exit criterion:** Critical user-facing fetch paths handle non-JSON error responses gracefully.

---

## Deferred Items

### DEFER-C30-4: Remaining `.json()` before `.ok` instances in non-critical components
- **Files:** `invite-participants.tsx`, `recruiting-invitations-panel.tsx`, `quick-create-contest-form.tsx`, `access-code-manager.tsx`, `discussion-thread-moderation-controls.tsx`, `discussion-thread-form.tsx`, `discussion-post-delete-button.tsx`, `discussion-post-form.tsx`, `comment-section.tsx`, `lecture/submission-overview.tsx`, `problem-import-button.tsx`, `countdown-timer.tsx`
- **Original finding:** C29-AGG-2 / C30-3 extension
- **Severity:** MEDIUM (lower user impact than critical paths)
- **Confidence:** HIGH
- **Reason for deferral:** The 4 critical paths are addressed in C30-3. These remaining 12 instances are lower-impact UI components where error swallowing is less critical to user workflows. They can be batch-converted when the helper from C30-3 is applied across the full codebase.
- **Exit criterion:** When `safeParseApiResponse` helper from C30-3 is applied to all remaining components.

### DEFER-C30-5: Raw API error strings without i18n translation
- **Files:** Multiple client components (7+ instances)
- **Original finding:** C29-AGG-3
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Reason for deferral:** This requires adding translation keys for all API error responses and updating the error-handling pattern across components. It's a UI/UX improvement that doesn't affect correctness or security. Best addressed alongside C30-3/C30-4 when the API response parsing pattern is unified.
- **Exit criterion:** When a unified API error parsing helper that routes through `t()` is introduced and applied across all components.

### DEFER-C30-6: `as { error?: string }` unsafe type assertions
- **Files:** 22+ instances across client components
- **Original finding:** C29-AGG-9
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Reason for deferral:** These casts are guarded by `.catch(() => ({}))` which ensures the value is at least an object. While unsafe from a TypeScript perspective, the runtime behavior is benign (accessing `undefined.error` returns `undefined`). Best addressed alongside C30-3/C30-4 when a typed response parser is introduced.
- **Exit criterion:** When a typed `parseApiError` helper replaces all manual casts.

---

## Gate Results (Post-Implementation)

- [x] `npx eslint .` passes (0 errors)
- [x] `npx tsc --noEmit` passes
- [x] `npx next build` passes
- [x] `npx vitest run` passes — 315 files, 2382 tests (all pass; +4 new tests for parseApiResponse)
- [x] `npx vitest run --config vitest.config.component.ts` passes — 68 files, 208 tests

---

## Carry-Forward from Prior Cycles (unchanged)

- **C19-2:** Transaction wrapper inconsistency (`src/app/api/v1/judge/poll/route.ts:136`) — 11 cycles deferred
- **C25-6:** Client-side console.error (22 instances) — deferred
- **C25-7:** WeakMap complexity (`api-rate-limit.ts:62-72`) — deferred
- **C25-8:** RegExp creation per render (`json-ld.tsx:17-18`) — deferred
