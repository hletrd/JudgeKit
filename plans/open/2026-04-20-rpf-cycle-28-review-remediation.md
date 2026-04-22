# RPF Cycle 28 Review Remediation Plan

**Date:** 2026-04-20
**Source:** `.context/reviews/cycle-28-aggregate.md`
**Status:** In progress

## Scope

This cycle addresses cycle-28 findings from the multi-agent review:
- AGG-1: localStorage.setItem crashes in private browsing (compiler-client, submission-detail-client)
- AGG-2: Contest clarifications show raw userId instead of username
- AGG-3: compiler-client uses redundant defaultValue on t() calls
- AGG-4: Duplicated visibility-aware polling pattern (deferred from prior cycles)

No cycle-28 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Add try/catch around localStorage.setItem in compiler-client.tsx (AGG-1)

- **Source:** AGG-1
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:** `src/components/code/compiler-client.tsx:183`
- **Problem:** `localStorage.setItem("compiler:language", language)` in a useEffect will throw `QuotaExceededError` in Safari private browsing mode. All other localStorage write operations in the codebase are wrapped in try/catch.
- **Plan:**
  1. Wrap the `localStorage.setItem` call in a try/catch block.
  2. Verify all gates pass.
- **Status:** TODO

### H2: Add try/catch around localStorage.setItem in submission-detail-client.tsx (AGG-1)

- **Source:** AGG-1
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:** `src/app/(dashboard)/dashboard/submissions/[id]/submission-detail-client.tsx:94`
- **Problem:** `localStorage.setItem(key, JSON.stringify(payload))` in `handleResubmit` will throw in Safari private browsing. This blocks the resubmit navigation entirely since `router.push()` comes after the failing write.
- **Plan:**
  1. Wrap the `localStorage.setItem` call in a try/catch block.
  2. Ensure `router.push(problemHref)` executes regardless of draft save success.
  3. Verify all gates pass.
- **Status:** TODO

### M1: Remove redundant defaultValue parameters from compiler-client.tsx t() calls (AGG-3)

- **Source:** AGG-3
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/components/code/compiler-client.tsx` (multiple lines)
- **Problem:** The compiler client uses `t("key", { defaultValue: "English fallback" })` extensively. All `compiler.*` keys are confirmed present in both `en.json` and `ko.json` (lines 2391-2417). The `defaultValue` parameters are redundant and inconsistent with the rest of the codebase.
- **Plan:**
  1. Remove all `{ defaultValue: "..." }` parameters from `t()` calls in compiler-client.tsx.
  2. Verify all gates pass.
- **Status:** TODO

---

## Deferred items

### DEFER-1 through DEFER-19: Carried from cycle 27

See `plans/open/2026-04-20-rpf-cycle-27-review-remediation.md` for the full deferred list. All carry forward unchanged.

### DEFER-20: Contest clarifications show raw userId instead of username (from AGG-2)

- **Source:** AGG-2 (designer DES-2, tracer Flow 3, critic CRIT-2)
- **Severity / confidence:** LOW / MEDIUM
- **Original severity preserved:** LOW / MEDIUM
- **Citations:** `src/components/contest/contest-clarifications.tsx:257`
- **Reason for deferral:** Fixing this requires a backend API change to include `userName` in the clarifications response (`/api/v1/contests/${assignmentId}/clarifications`). The frontend currently only has `userId` available. This is a larger-scope change that involves both the API route handler and the database query. The current behavior (showing userId) is functional but not ideal UX.
- **Exit criterion:** When a cycle has capacity for a focused API enhancement pass, or when the clarifications API is being modified for another reason.

### DEFER-21: Duplicated visibility-aware polling pattern (from AGG-4, previously DEFER-11)

- **Source:** AGG-4 (code-reviewer CR-3, architect ARCH-1, perf-reviewer PERF-1)
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/components/contest/contest-announcements.tsx:71-95`, `src/components/contest/contest-clarifications.tsx:87-111`, `src/components/contest/participant-anti-cheat-timeline.tsx:89-95`
- **Reason for deferral:** The existing polling code works correctly. Extracting a shared hook is a maintainability improvement with no functional impact. Previously noted as DEFER-11 in earlier cycles.
- **Exit criterion:** When a cycle has capacity for a focused DRY refactor pass, or when a bug is found in the polling pattern that needs fixing in all consumers.

---

## Workspace-to-Public Migration Progress

**Current phase:** Phase 5 COMPLETE. All phases (1-5) of the workspace-to-public migration are done.

No further migration work is needed. The migration plan can be archived if desired.

---

## Progress log

- 2026-04-20: Plan created from cycle-28 aggregate review. Four findings (AGG-1 through AGG-4). AGG-1 is the highest priority (localStorage crashes). AGG-2 and AGG-4 are deferred. AGG-3 is a cleanup task.
