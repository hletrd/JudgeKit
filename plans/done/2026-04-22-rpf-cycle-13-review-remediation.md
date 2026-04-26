# RPF Cycle 13 — Review Remediation Plan

**Date:** 2026-04-22
**Source:** `.context/reviews/_aggregate.md`
**Status:** Done (H1, H2, L1, L2 all complete)

## Scope

This cycle addresses findings from the RPF cycle 13 multi-agent review:
- AGG-1: `workers-client.tsx` icon-only buttons missing `aria-label` — WCAG 4.1.2 (6 instances)
- AGG-2: `chat-logs-client.tsx` — API calls without `res.ok` check, processes error responses as data
- AGG-3: `group-instructors-manager.tsx` remove instructor button missing `aria-label`
- AGG-4: Multiple components have unguarded `res.json()` on success paths (10+ files)

No cycle-13 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Add `aria-label` to icon-only buttons in `workers-client.tsx` (AGG-1)

- **Source:** AGG-1
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:120,123,133-140,187-194,201-208,372`
- **Cross-agent signal:** 7 of 11 review perspectives
- **Problem:** Six icon-only buttons in the workers admin page lack `aria-label` attributes. This is the same class of WCAG 4.1.2 issue fixed in cycle 12 for language-config-table. Screen readers announce "button" with no description.
- **Plan:**
  1. Line 120: Add `aria-label={t("save")}` to Save (Check) button
  2. Line 123: Add `aria-label={t("cancel")}` to Cancel (X) button
  3. Lines 133-140: Add `aria-label={t("editAlias")}` to Edit (Pencil) button
  4. Lines 187-194: Add `aria-label={t("copyDockerCommand")}` to Copy docker command button
  5. Lines 201-208: Add `aria-label={t("copyDeployScript")}` to Copy deploy script button
  6. Line 372: Add `aria-label={t("removeWorker")}` to Delete (Trash2) button
  7. Verify i18n keys exist in admin.workers namespace
  8. Verify all gates pass
- **Status:** DONE — Commit `e03c621e`

### H2: Add `res.ok` check and `.catch()` guards to `chat-logs-client.tsx` (AGG-2)

- **Source:** AGG-2
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:** `src/app/(dashboard)/dashboard/admin/plugins/chat-logs/chat-logs-client.tsx:58,73`
- **Cross-agent signal:** 6 of 11 review perspectives
- **Problem:** Both `fetchSessions` and `fetchMessages` call `await res.json()` without first checking `res.ok`. If the server returns an error status, the error response body is parsed and the code tries to access fields that would be undefined. The `?? []` and `?? 0` fallbacks prevent crashes but mask authentication failures — users see empty data instead of error messages.
- **Plan:**
  1. In `fetchSessions`: Add `if (!res.ok) { toast.error(t("fetchError")); return; }` before `.json()`, and add `.catch(() => ({ sessions: [], total: 0 }))` guard
  2. In `fetchMessages`: Add `if (!res.ok) { toast.error(t("fetchError")); return; }` before `.json()`, and add `.catch(() => ({ messages: [] }))` guard
  3. Verify all gates pass
- **Status:** DONE — Commit `c1ee7712`

### L1: Add `aria-label` to remove instructor button in `group-instructors-manager.tsx` (AGG-3)

- **Source:** AGG-3
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/app/(dashboard)/dashboard/groups/[id]/group-instructors-manager.tsx:191-196`
- **Cross-agent signal:** 4 of 11 review perspectives
- **Problem:** The remove instructor button contains only a Trash2 icon with no text. It uses `size="sm"` but is effectively icon-only. No `aria-label` is present.
- **Plan:**
  1. Add `aria-label={t("removeInstructor")}` to the Button
  2. Verify all gates pass
- **Status:** DONE — Commit `0525a79d`

### L2: Add `.catch()` guards to unguarded `res.json()` on success paths in contest components (AGG-4, partial)

- **Source:** AGG-4
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** Multiple files — see deferred list for complete enumeration
- **Cross-agent signal:** 5 of 11 review perspectives
- **Problem:** Several components call `await res.json()` on the success path without a `.catch()` guard. If the server returns a non-JSON 200 body, this throws SyntaxError.
- **Plan:** Fix the most impactful files this cycle:
  1. `src/components/contest/recruiter-candidates-panel.tsx:54` — add `.catch(() => [])`
  2. `src/components/contest/quick-create-contest-form.tsx:80` — add `.catch(() => ({}))`
  3. `src/components/contest/code-timeline-panel.tsx:57` — add `.catch(() => ({ data: [] }))`
  4. `src/components/contest/invite-participants.tsx:46` — add `.catch(() => ({}))`
  5. `src/components/lecture/submission-overview.tsx:87` — add `.catch(() => ({ data: {} }))`
  6. `src/components/contest/contest-quick-stats.tsx:52` — add `.catch(() => ({}))`
  7. Verify all gates pass
- **Status:** DONE — Commit `4ea3f23d`

---

## Deferred items

### Carried from cycle 12 plan

All DEFER-1 through DEFER-41 from the cycle 12 plan carry forward unchanged. Key items:
- DEFER-1: Migrate raw route handlers to `createApiHandler` (22 routes)
- DEFER-24: Invitation URL uses window.location.origin (also SEC-2)
- DEFER-33: Encryption module integrity check / HMAC (SEC-1)
- DEFER-35: Add `.catch()` guards to unguarded `response.json()` on success paths where result IS used (AGG-5, carried)
- DEFER-41: Problem import button file size validation (from PERF-2)

### DEFER-42: Remaining unguarded `res.json()` on success paths (from AGG-4, remainder)

- **Source:** AGG-4 (remainder)
- **Severity / confidence:** LOW / MEDIUM (original preserved)
- **Citations:**
  - `src/components/contest/analytics-charts.tsx:542`
  - `src/components/contest/leaderboard-table.tsx:231`
  - `src/components/contest/anti-cheat-dashboard.tsx:124,161`
  - `src/app/(dashboard)/dashboard/submissions/[id]/submission-detail-client.tsx:105`
  - `src/app/(dashboard)/dashboard/admin/plugins/chat-logs/chat-logs-client.tsx:58,73` (covered by H2)
  - `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:141,177`
- **Reason for deferral:** L2 addresses the most impactful files. Remaining files have the same pattern but are less frequently hit. Fixing all in one cycle would create a large diff. The outer catch blocks handle the SyntaxError gracefully.
- **Exit criterion:** When a dedicated API error handling consistency pass is scheduled.

### DEFER-43: Anti-cheat dashboard polling optimization (from PERF-1)

- **Source:** PERF-1
- **Severity / confidence:** MEDIUM / LOW (original preserved)
- **Citations:** `src/components/contest/anti-cheat-dashboard.tsx:118-152`, `src/components/contest/participant-anti-cheat-timeline.tsx:90-122`
- **Reason for deferral:** Performance optimization, not a bug. The current polling behavior works correctly — it just replaces data on every tick. Adding conditional re-rendering or ETag support would require API changes.
- **Exit criterion:** When a dedicated performance optimization pass is scheduled or when anti-cheat tables show measurable jank.

### DEFER-44: Unit tests for workers-client.tsx (from TE-1)

- **Source:** TE-1
- **Severity / confidence:** LOW / MEDIUM (original preserved)
- **Citations:** `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx`
- **Reason for deferral:** Admin-only component. The code fix (H1) addresses the immediate accessibility bug. Adding comprehensive unit tests is a larger effort.
- **Exit criterion:** When a dedicated test coverage improvement cycle is scheduled.

### DEFER-45: Unit tests for chat-logs-client.tsx (from TE-2)

- **Source:** TE-2
- **Severity / confidence:** LOW / MEDIUM (original preserved)
- **Citations:** `src/app/(dashboard)/dashboard/admin/plugins/chat-logs/chat-logs-client.tsx`
- **Reason for deferral:** Admin-only plugin component. The code fix (H2) addresses the immediate bug.
- **Exit criterion:** When a dedicated test coverage improvement cycle is scheduled.

### DEFER-46: Unit tests for recruiter-candidates-panel.tsx (from TE-4)

- **Source:** TE-4
- **Severity / confidence:** LOW / LOW (original preserved)
- **Citations:** `src/components/contest/recruiter-candidates-panel.tsx`
- **Reason for deferral:** Low-impact component. Adding tests is a separate effort.
- **Exit criterion:** When a dedicated test coverage improvement cycle is scheduled.

### DEFER-47: `apiFetch` JSDoc success-path `.json()` guidance (from DOC-1)

- **Source:** DOC-1
- **Severity / confidence:** LOW / MEDIUM (original preserved)
- **Citations:** `src/lib/api/client.ts`
- **Reason for deferral:** Documentation improvement. The code fixes (H2, L2) address the immediate bugs.
- **Exit criterion:** When the centralized API client pattern is established (see ARCH-1).

### DEFER-48: Encryption module migration guidance (from DOC-2)

- **Source:** DOC-2
- **Severity / confidence:** LOW / LOW (original preserved)
- **Citations:** `src/lib/security/encryption.ts:73-76`
- **Reason for deferral:** Documentation improvement for a backward-compatibility feature. The actual security fix is tracked under DEFER-33.
- **Exit criterion:** When the encryption module integrity check (DEFER-33) is implemented.

### DEFER-49: Workers admin page `window.location.origin` for JUDGE_BASE_URL (from DES-3)

- **Source:** DES-3
- **Severity / confidence:** LOW / LOW (original preserved)
- **Citations:** `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:147`
- **Reason for deferral:** Overlaps with DEFER-24 (window.location.origin usage). Same fix — use server-provided appUrl.
- **Exit criterion:** When DEFER-24 is implemented.

---

## Progress log

- 2026-04-22: Plan created from RPF cycle 13 aggregate review. 4 new tasks (H1-H2, L1-L2). 8 new deferred items (DEFER-42 through DEFER-49). All findings from the aggregate review are either scheduled for implementation or explicitly deferred.
- 2026-04-22: H1 DONE (e03c621e — aria-label for 6 icon buttons in workers-client.tsx), H2 DONE (c1ee7712 — res.ok check and .catch() in chat-logs-client.tsx), L1 DONE (0525a79d — aria-label for remove instructor button), L2 DONE (4ea3f23d — .catch() guards on success paths in 6 components). All gates pass: eslint (0 errors, 14 pre-existing warnings in untracked scripts), next build (success), vitest unit (2105/2105 pass), vitest component (12 pre-existing DB-dependent failures, no test files modified), vitest integration (37 skipped, no DB available).
