# RPF Cycle 22 — Review Remediation Plan

**Date:** 2026-04-22
**Source:** `.context/reviews/_aggregate.md` (cycle 22)
**Status:** In Progress

## Scope

This cycle addresses NEW findings from the RPF cycle 22 aggregate review:
- AGG-1: `create-problem-form.tsx` sequence number and difficulty inputs silently discard invalid numeric input without feedback (LOW/MEDIUM, 10-agent signal)

Carried items from previous cycles remain deferred (see Deferred section).

No cycle-22 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### L1: Add validation feedback for `create-problem-form.tsx` numeric inputs (AGG-1)

- **Source:** AGG-1
- **Severity / confidence:** LOW / MEDIUM
- **Signal:** 10 of 11 review perspectives
- **Citations:** `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:92,108,394,401,469,483`
- **Problem:** The form stores `sequenceNumber` and `difficulty` as string state. When a non-numeric value is entered (e.g., "abc"), `parseInt()` returns `NaN`, the `Number.isFinite()` check fails, and the value is silently set to `null`. No inline validation, toast, or error message informs the user that their input was discarded.
- **Plan:**
  1. In `handleSubmit`, before the API call, check if `sequenceNumber` is non-empty and `parsedSeqNum` is `null`/invalid — if so, show `toast.warning` with a descriptive message (e.g., "Invalid sequence number — value will be omitted")
  2. Similarly for `difficulty` — if `difficulty` is non-empty and `parseFloat(difficulty)` is `NaN`, show a toast.warning
  3. These are warnings, not blockers — the user can still proceed with the null value after seeing the notification
  4. Optionally add a comment on the string state variables explaining the design choice (DOC-1)
  5. Verify all gates pass
- **Status:** DONE

---

## Deferred items

### DEFER-1: Practice page progress-filter SQL CTE optimization (carried from cycle 18)

- **Source:** rpf-cycle-18 DEFER-1, rpf-cycle-19 DEFER-1, rpf-cycle-20 DEFER-1, rpf-cycle-21 DEFER-1
- **Severity / confidence:** MEDIUM / MEDIUM (original preserved)
- **Citations:** `src/app/(public)/practice/page.tsx:410-519`
- **Reason for deferral:** Significant refactoring scope. Current code works correctly for existing problem counts.
- **Exit criterion:** Problem count exceeds 5,000 or a performance benchmark shows >2s page load time with progress filters.

### DEFER-2: `window.location.origin` for URL construction (AGG-2, carried from DEFER-24)

- **Source:** AGG-2, DEFER-24
- **Severity / confidence:** MEDIUM / MEDIUM (original preserved)
- **Citations:**
  - `src/components/contest/access-code-manager.tsx:137`
  - `src/components/contest/recruiting-invitations-panel.tsx:99`
  - `src/app/(dashboard)/dashboard/admin/files/file-management-client.tsx:96`
  - `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:148`
- **Reason for deferral:** Requires server-side mechanism to provide public URL (e.g., environment variable or API endpoint). All four instances need a coordinated change.
- **Exit criterion:** When a `NEXT_PUBLIC_APP_URL` or server-provided public URL mechanism is implemented.

### DEFER-3: `contest-replay.tsx` `setInterval` without visibility awareness (AGG-4, carried from cycle 21)

- **Source:** AGG-4
- **Severity / confidence:** LOW / MEDIUM (original preserved)
- **Citations:** `src/components/contest/contest-replay.tsx:77-87`
- **Reason for deferral:** The replay is a cosmetic animation feature. When the tab is hidden, the interval may be throttled but no data is lost.
- **Exit criterion:** When a user reports replay behaving unexpectedly after tab switch, or when a shared visibility-aware interval hook is created.

### DEFER-4: `recruiter-candidates-panel.tsx` full export fetch (carried as DEFER-29)

- **Source:** PERF-1, DEFER-29
- **Severity / confidence:** MEDIUM / HIGH (original preserved)
- **Citations:** `src/components/contest/recruiter-candidates-panel.tsx:50-53`
- **Reason for deferral:** Requires new server-side endpoint with pagination, search, and sort. Significant backend change.
- **Exit criterion:** When a dedicated `/api/v1/contests/${assignmentId}/candidates` endpoint is created.

### DEFER-5: Component tests for anti-cheat-dashboard, role-editor-dialog, contest-replay, create-problem-form (TE-1 through TE-5)

- **Source:** TE-1 through TE-5 (cycles 21-22)
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** See test-engineer.md for specific file citations
- **Reason for deferral:** Test infrastructure for component-level mocking of `apiFetch` needs setup. Large scope.
- **Exit criterion:** When component test coverage pass is scheduled.

### DEFER-6: Gemini model name URL interpolation (carried from cycle 18 SEC-3)

- **Source:** SEC-3 (cycle 18)
- **Severity / confidence:** LOW / MEDIUM (original preserved)
- **Citations:** `src/app/api/v1/plugins/chat-widget/test-connection/route.ts:127`
- **Reason for deferral:** `SAFE_GEMINI_MODEL_PATTERN` already restricts to safe characters. Defense-in-depth only.
- **Exit criterion:** When the chat-widget plugin API is refactored.

### DEFER-7: Encryption plaintext fallback (carried from cycle 11)

- **Source:** SEC-4 (cycle 11)
- **Severity / confidence:** MEDIUM / MEDIUM (original preserved)
- **Reason for deferral:** Architectural decision needed on whether encryption should be mandatory.
- **Exit criterion:** When a security policy decision is made on mandatory encryption.

---

## Progress log

- 2026-04-22: Plan created from RPF cycle 22 aggregate review. 1 task (L1). 7 deferred items.
- 2026-04-22: L1 implemented (toast.warning for invalid numeric inputs + comments on string state). 2 commits pushed. All gates pass (eslint, next build, vitest unit).
