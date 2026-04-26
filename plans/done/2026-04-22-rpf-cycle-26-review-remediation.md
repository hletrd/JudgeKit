# RPF Cycle 26 — Review Remediation Plan

**Date:** 2026-04-22
**Source:** `.context/reviews/_aggregate.md`, `.context/reviews/{code-reviewer,perf-reviewer,security-reviewer,architect,critic,verifier,debugger,test-engineer,tracer,designer,document-specialist}.md`
**Status:** ALL LANES COMPLETE

## Scope

This cycle addresses new findings from the multi-agent review at commit f55836d0. All prior cycle-25 findings have been verified as fixed.

No review finding is silently dropped. All findings are either scheduled for implementation or explicitly recorded as deferred.

---

## Implementation Lanes

### H1: Fix double `.json()` anti-pattern in 3 files (AGG-1)

- **Source:** AGG-1 (10-agent signal: CR-1, CR-2, CR-3, SEC-1, CRI-1, V-1, DBG-1, ARCH-1, TR-1, PERF-1, TE-1)
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:**
  - `src/app/(dashboard)/dashboard/groups/[id]/assignment-form-dialog.tsx:273+277`
  - `src/app/(dashboard)/dashboard/groups/create-group-dialog.tsx:67+71`
  - `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:335+339`
- **Problem:** Three files still use the error-first double `.json()` anti-pattern where `response.json()` is called once in the `if (!response.ok)` branch and once in the success branch. While the `throw` after the error branch prevents the second `.json()` from running, this is the anti-pattern explicitly documented as "DO NOT USE" in `src/lib/api/client.ts`. Previous cycles 23-24 fixed this same pattern in other files but missed these three.
- **Plan:**
  1. `assignment-form-dialog.tsx`: Parse body once before `if (!response.ok)`, then branch on `response.ok`
  2. `create-group-dialog.tsx`: Same pattern fix
  3. `create-problem-form.tsx`: Same pattern fix (in `handleImageUpload`)
  4. Verify all gates pass
- **Status:** DONE (commit c51ce8bf)

---

### M1: Fix `compiler-client.tsx` catch block raw `error.message` in inline display (AGG-2)

- **Source:** AGG-2 (5-agent signal: CR-5, SEC-2, CRI-2, V-3, TR-2)
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/components/code/compiler-client.tsx:292-296`
- **Problem:** The `handleRun` catch block constructs `errorMessage = err instanceof Error ? err.message : "Network error"` for the inline error display. While the toast correctly uses `t("networkError")`, the inline display still shows raw `error.message`. This is inconsistent with the spirit of the cycle-25 AGG-1 fix.
- **Plan:**
  1. Replace `err instanceof Error ? err.message : "Network error"` with `t("networkError")` for the inline error display
  2. Log the raw error to console for debugging
  3. Verify all gates pass
- **Status:** DONE (commit 9296016e)

---

### M2: Add `fetchAll()` to `handleResetAccountPassword` for consistency (AGG-3)

- **Source:** AGG-3 (3-agent signal: CR-4, ARCH-2, DBG-2)
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/components/contest/recruiting-invitations-panel.tsx:282-301`
- **Problem:** `handleRevoke` and `handleDelete` both call `fetchAll()` after success. `handleResetAccountPassword` does not. While a password reset doesn't change visible invitation fields today, the inconsistency suggests an omission.
- **Plan:**
  1. Add `await fetchAll()` after the success toast in `handleResetAccountPassword`
  2. Verify all gates pass
- **Status:** DONE (commit bfbae295)

---

### M3: Remove redundant `!` non-null assertions in `contest-quick-stats.tsx` (AGG-4)

- **Source:** AGG-4 (2-agent signal: CRI-3, PERF-2)
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/components/contest/contest-quick-stats.tsx:65-68`
- **Problem:** The `typeof` guard already ensures the value is a number, making the `!` non-null assertion redundant. This was left over from the cycle-25 AGG-3 fix.
- **Plan:**
  1. Replace `data.data!.participantCount` with `data.data.participantCount` (and same for other fields) where the `typeof` guard already ensures the value exists
  2. Verify all gates pass
- **Status:** DONE (commit a6e8d885)

---

## Deferred Items

### DEFER-56: Replace `setInterval` with recursive `setTimeout` in `contest-replay.tsx` (AGG-5)

- **Source:** AGG-5 (2-agent signal: CR-6, ARCH-3)
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/components/contest/contest-replay.tsx:77-87`
- **Reason for deferral:** Very low severity — drift accumulation is negligible for the short playback intervals used. The replay feature works correctly. No user-facing impact reported.
- **Exit criterion:** When replay timing issues are reported or the replay component is refactored for other reasons.

### DEFER-57: Fix `active-timed-assignment-sidebar-panel.tsx` interval re-entry issue (AGG-6)

- **Source:** AGG-6 (1-agent signal: PERF-3)
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/components/layout/active-timed-assignment-sidebar-panel.tsx:63-75`
- **Reason for deferral:** Very low severity — the scenario (new assignment added while sidebar is mounted and all existing assignments have expired) is unlikely because the sidebar panel data comes from server-side props that would trigger a re-render. No user-facing impact reported.
- **Exit criterion:** When the sidebar panel is modified for other reasons or the re-entry issue causes a visible bug.

### DEFER-58: Quick-stats cards loading skeleton (DES-1)

- **Source:** DES-1 (1-agent signal)
- **Severity / confidence:** LOW / MEDIUM
- **Original severity preserved:** LOW / MEDIUM
- **Citations:** `src/components/contest/contest-quick-stats.tsx:86-124`
- **Reason for deferral:** UX enhancement — not a bug. The current behavior (showing "0" briefly) is functional but suboptimal. Skeleton/shimmer loading states are a broader design system effort.
- **Exit criterion:** When a design system loading pattern is established across the app.

### DEFER-59: Disable create invitation form fields during creation (DES-2)

- **Source:** DES-2 (1-agent signal)
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/components/contest/recruiting-invitations-panel.tsx:410-521`
- **Reason for deferral:** Very low severity — the creation is fast enough that the race condition is unlikely to be encountered in practice.
- **Exit criterion:** When the invitations panel is modified for other reasons.

### DEFER-60: Contest replay slider step markers (DES-3)

- **Source:** DES-3 (1-agent signal)
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/components/contest/contest-replay.tsx:159-168`
- **Reason for deferral:** Enhancement, not a bug. Requires design work for the marker visualization.
- **Exit criterion:** When replay UX is prioritized.

### DEFER-61: `apiFetchJson` JSDoc migration note (DOC-1)

- **Source:** DOC-1 (1-agent signal)
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/lib/api/client.ts:87-128`
- **Reason for deferral:** Documentation-only. The existing JSDoc is sufficient. The anti-pattern is already documented in the comments.
- **Exit criterion:** When documentation pass is undertaken.

### DEFER-62: `handleResetAccountPassword` missing `fetchAll()` comment (DOC-2)

- **Source:** DOC-2 (1-agent signal)
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/components/contest/recruiting-invitations-panel.tsx:282-301`
- **Reason for deferral:** Will be addressed by M2 implementation which adds `fetchAll()`.
- **Exit criterion:** When M2 is implemented.

### DEFER-63: Test coverage for double `.json()` anti-pattern (TE-1)

- **Source:** TE-1 (1-agent signal)
- **Severity / confidence:** MEDIUM / MEDIUM
- **Original severity preserved:** MEDIUM / MEDIUM
- **Citations:** Multiple files
- **Reason for deferral:** Test writing is important but time-consuming. The code fixes in H1 address the immediate correctness concern. The structural fix (parse once, branch) makes the anti-pattern impossible by construction.
- **Exit criterion:** Unit tests added for the three fixed files.

### DEFER-64: Test coverage for `handleResetAccountPassword` (TE-2)

- **Source:** TE-2 (1-agent signal)
- **Severity / confidence:** LOW / MEDIUM
- **Original severity preserved:** LOW / MEDIUM
- **Citations:** `src/components/contest/recruiting-invitations-panel.tsx`
- **Reason for deferral:** Test writing is important but time-consuming. The code fix in M2 addresses the immediate consistency concern.
- **Exit criterion:** Integration tests added for the password reset flow.

---

## Previously Deferred Items (Carried Forward)

All previously deferred items from prior cycle plans remain in effect:
- DEFER-1 through DEFER-5 (from cycle 1 plan)
- DEFER-20 through DEFER-25 (from cycle 2 plan)
- D1, D2, A19 (from earlier cycles)
- DEFER-26 through DEFER-55 (from RPF cycle 28 and cycle 24/25 plans)

---

## Progress Log

- 2026-04-22: Plan created from multi-agent review at commit f55836d0. 6 aggregate findings. 4 scheduled for implementation (H1, M1-M3). 9 deferred (DEFER-56 through DEFER-64). All prior cycle-25 findings verified as fixed.
- 2026-04-22: H1 DONE — fix double .json() anti-pattern in 3 files (commit c51ce8bf)
- 2026-04-22: M1 DONE — fix compiler-client catch block raw error.message (commit 9296016e)
- 2026-04-22: M2 DONE — add fetchAll() after password reset (commit bfbae295)
- 2026-04-22: M3 DONE — remove redundant non-null assertions in quick-stats (commit a6e8d885)
- 2026-04-22: All implementation lanes complete. All gates passed.
