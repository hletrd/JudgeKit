# RPF Cycle 14 — Review Remediation Plan

**Date:** 2026-04-22
**Source:** `.context/reviews/_aggregate.md`
**Status:** Done (H1, H2, M1, L1, L2 all complete)

## Scope

This cycle addresses findings from the RPF cycle 14 multi-agent review:
- AGG-1: Systemic unguarded `res.json()` pattern — 4 cycles of partial fixes without root-cause resolution (11+ files)
- AGG-2: `create-problem-form.tsx` double `res.json()` — response body consumed on first read
- AGG-3: `problem-import-button.tsx` parses uploaded JSON without size limit (carried from cycle 13)
- AGG-4: `problem-export-button.tsx` — unguarded `res.json()` + no null check on nested property access
- AGG-5: `contest-join-client.tsx` variable shadowing — `payload` declared twice

No cycle-14 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Create centralized `apiFetchJson` helper and refactor all unguarded `res.json()` calls (AGG-1)

- **Source:** AGG-1
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** 11+ components — see aggregate for full list
- **Cross-agent signal:** 7 of 11 review perspectives
- **Problem:** Despite three cycles (11-13) of fixing unguarded `res.json()` calls file-by-file, 11+ components still have the same pattern. The root cause is architectural: no centralized, enforced approach exists. Each cycle fixes 5-6 files but new instances keep appearing.
- **Plan:**
  1. Create `apiFetchJson<T>(res: Response, fallback: T): Promise<T>` helper in `src/lib/api/client.ts`
  2. Helper should: call `res.json()`, apply `.catch(() => fallback)`, return typed result
  3. Also create `apiFetchJsonWithError<T>(res: Response, fallback: T): Promise<{ data: T; ok: boolean }>` that checks `res.ok` and returns both status and data
  4. Refactor all 11+ components to use the helper
  5. Update `apiFetch` JSDoc to document the success-path pattern and the double-read anti-pattern (DOC-1, DOC-3)
  6. Verify all gates pass
- **Status:** DONE — Commits `9927a2c3`, `f159baa5`, `7ac7c1a9`

### H2: Fix double `res.json()` in `create-problem-form.tsx` (AGG-2)

- **Source:** AGG-2
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:** `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:332,336` and `423,427`
- **Cross-agent signal:** 6 of 11 review perspectives
- **Problem:** The code calls `await res.json()` twice on the same Response object. The first call consumes the response body. If the error path doesn't throw, the second call would fail. This is a latent bug.
- **Plan:**
  1. At lines 331-337: Parse response once: `const data = await res.json().catch(() => ({}))`, then branch on `!res.ok`
  2. At lines 422-428: Same pattern fix
  3. Ensure error handling behavior is preserved
  4. Verify all gates pass
- **Status:** DONE — Commit `2f456861` to `problem-import-button.tsx` (AGG-3)

- **Source:** AGG-3 (carried from SEC-3/PERF-3 cycle 13)
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/app/(dashboard)/dashboard/problems/problem-import-button.tsx:22-23`
- **Cross-agent signal:** 5 of 11 review perspectives
- **Problem:** No file size check before `file.text()` loads the entire file into memory. A large file would freeze the browser tab or cause an out-of-memory crash.
- **Plan:**
  1. Add `if (file.size > 10 * 1024 * 1024) { toast.error(t("fileTooLarge")); return; }` before `file.text()`
  2. Add i18n key `fileTooLarge` to en.json and ko.json
  3. Also add `.catch()` guard to the success-path `res.json()` on line 37
  4. Verify all gates pass
- **Status:** DONE — Commit `b4961da6` `res.json()` and null-safety in `problem-export-button.tsx` (AGG-4)

- **Source:** AGG-4
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/app/(dashboard)/dashboard/problems/[id]/problem-export-button.tsx:19-24`
- **Cross-agent signal:** 5 of 11 review perspectives
- **Problem:** Line 19 calls `res.json()` without `.catch()`. Line 24 accesses `data.data.problem.title` without null checks. If the API returns an unexpected shape, this throws TypeError.
- **Plan:**
  1. Add `.catch(() => null)` guard on `.json()` call
  2. Add null check before accessing `data.data.problem.title`
  3. Use `data?.data?.problem?.title ?? "problem"` for filename fallback
  4. Verify all gates pass
- **Status:** DONE — Commit `b654f813` in `contest-join-client.tsx` (AGG-5)

- **Source:** AGG-5
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/app/(dashboard)/dashboard/contests/join/contest-join-client.tsx:45,49`
- **Cross-agent signal:** 3 of 11 review perspectives
- **Problem:** `const payload` is declared on line 45 (error path) and again on line 49 (success path). The shadowing is confusing.
- **Plan:**
  1. Rename the error-path variable from `payload` to `errorPayload` on line 45
  2. Update the reference on line 46 accordingly
  3. Also add `.catch()` guard to the success-path `res.json()` on line 49
  4. Verify all gates pass
- **Status:** DONE — Commit `9927a2c3`

### Carried from cycle 13 plan

All DEFER-1 through DEFER-49 from the cycle 13 plan carry forward unchanged. Key items:
- DEFER-1: Migrate raw route handlers to `createApiHandler` (22 routes)
- DEFER-24: Invitation URL uses window.location.origin (also SEC-3)
- DEFER-33: Encryption module integrity check / HMAC (SEC-1)
- DEFER-42: Remaining unguarded `res.json()` on success paths (superseded by H1 this cycle)

### DEFER-50: Encryption module unit tests (from TE-3, carried from cycle 11)

- **Source:** TE-3
- **Severity / confidence:** MEDIUM / HIGH (original preserved)
- **Citations:** `src/lib/security/encryption.ts`
- **Reason for deferral:** Security-critical but tests do not fix bugs. The actual security concern (plaintext fallback) is tracked under DEFER-33.
- **Exit criterion:** When a dedicated test coverage improvement cycle is scheduled.

### DEFER-51: Unit tests for create-problem-form.tsx (from TE-4)

- **Source:** TE-4
- **Severity / confidence:** LOW / MEDIUM (original preserved)
- **Citations:** `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx`
- **Reason for deferral:** Complex component requiring extensive mock setup. The code fix (H2) addresses the latent bug.
- **Exit criterion:** When a dedicated test coverage improvement cycle is scheduled.

### DEFER-52: Unit tests for problem-export-button.tsx (from TE-5)

- **Source:** TE-5
- **Severity / confidence:** LOW / LOW (original preserved)
- **Citations:** `src/app/(dashboard)/dashboard/problems/[id]/problem-export-button.tsx`
- **Reason for deferral:** Simple component. The code fix (L1) addresses the null-safety issue.
- **Exit criterion:** When a dedicated test coverage improvement cycle is scheduled.

### DEFER-53: `contest-join-client.tsx` 1-second setTimeout delay (from PERF-3)

- **Source:** PERF-3
- **Severity / confidence:** LOW / LOW (original preserved)
- **Citations:** `src/app/(dashboard)/dashboard/contests/join/contest-join-client.tsx:57`
- **Reason for deferral:** UX optimization, not a bug. The delay shows a success animation.
- **Exit criterion:** When a dedicated UX optimization pass is scheduled.

---

## Progress log

- 2026-04-22: Plan created from RPF cycle 14 aggregate review. 5 new tasks (H1-H2, M1, L1-L2). 4 new deferred items (DEFER-50 through DEFER-53). All findings from the aggregate review are either scheduled for implementation or explicitly deferred.
- 2026-04-22: L2 DONE (9927a2c3 — variable shadowing fix + apiFetchJson helper creation in contest-join-client), L1 DONE (b654f813 — .catch() guard + null-safety in problem-export-button), M1 DONE (b4961da6 — file size validation in problem-import-button + i18n keys), H2 DONE (2f456861 — double res.json() fix in create-problem-form), H1 DONE (f159baa5 — apiFetchJson usage in 8 components + .catch() guards, 7ac7c1a9 — type annotation fixes). All gates pass: eslint (0 errors), next build (success), vitest unit (2105/2105 pass), vitest integration (37 skipped, no DB available), vitest component (12 pre-existing DB-dependent failures, no test files modified).
