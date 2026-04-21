# RPF Cycle 24 Review Remediation Plan

**Date:** 2026-04-20
**Source:** `.context/reviews/cycle-24-aggregate.md`
**Status:** In progress

## Scope

This cycle addresses the new cycle-24 findings from the multi-agent review:
- AGG-1: Systematic silent error swallowing across multiple components (5+ instances)
- AGG-2: Dead code — `titleKeyByMode` on hidden AppSidebar nav item
- AGG-3: `ContestsLayout` click interception issues (stopPropagation, missing scheme checks, no bug reference)
- AGG-4: `submission-overview.tsx` polling continues when tab is hidden
- AGG-5: Inconsistent error handling patterns lack architectural enforcement

No cycle-24 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Fix silent error swallowing in client-side catch blocks (AGG-1)

- **Source:** AGG-1
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:**
  - `src/components/lecture/submission-overview.tsx:101-102`
  - `src/components/contest/invite-participants.tsx:49-50`
  - `src/app/(dashboard)/dashboard/admin/plugins/chat-logs/chat-logs-client.tsx:61-62,75-76`
  - `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:223-224`
  - `src/components/contest/participant-anti-cheat-timeline.tsx:120-121`
- **Problem:** Multiple `catch { // ignore }` blocks violate the project convention documented in `src/lib/api/client.ts`: "Never silently swallow errors — always surface them to the user."
- **Plan:**
  1. `submission-overview.tsx`: Add `toast.error(...)` using the `lecture` namespace. Add `fetchError` key to i18n if missing.
  2. `invite-participants.tsx`: Add `toast.error(t("searchFailed"))`. Add `searchFailed` key to i18n if missing.
  3. `chat-logs-client.tsx`: Add `toast.error(...)` for both fetchLogs and fetchMore catches.
  4. `create-problem-form.tsx`: Add `console.warn("Tag suggestions fetch failed")` — tag suggestions are non-critical, console.warn is acceptable.
  5. `participant-anti-cheat-timeline.tsx`: Add `toast.error(...)` using the `contests.antiCheat` namespace.
  6. Verify all gates pass.
- **Status:** PENDING

### M1: Remove dead `titleKeyByMode` from AppSidebar nav item (AGG-2)

- **Source:** AGG-2
- **Severity / confidence:** LOW / HIGH
- **Citations:** `src/components/layout/app-sidebar.tsx:66-67`
- **Problem:** The "Problems" nav item has both `titleKeyByMode: { recruiting: "challenges" }` and `hiddenInModes: ["recruiting"]`, making the titleKeyByMode dead code.
- **Plan:**
  1. Remove `titleKeyByMode: { recruiting: "challenges" }` from the Problems nav item.
  2. Verify all gates pass.
- **Status:** PENDING

### M2: Fix `ContestsLayout` click interception issues (AGG-3)

- **Source:** AGG-3
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:** `src/app/(dashboard)/dashboard/contests/layout.tsx:16-28`
- **Problem:** The layout's click handler has multiple issues: stopPropagation breaks React event delegation, missing javascript:/data: scheme checks, no Next.js bug tracker reference.
- **Plan:**
  1. Remove `me.stopPropagation()` — rely only on `me.preventDefault()`.
  2. Add scheme check: skip interception if href starts with `javascript:` or `data:`.
  3. Add a comment with a Next.js GitHub issue reference (or note that one should be filed).
  4. Verify all gates pass.
- **Status:** PENDING

### M3: Add visibility-aware polling to `submission-overview.tsx` (AGG-4)

- **Source:** AGG-4
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/components/lecture/submission-overview.tsx:108-114`
- **Problem:** The submission overview's `setInterval` continues to fire when the tab is hidden, making unnecessary API calls.
- **Plan:**
  1. Add visibility-based pause/resume to the interval, matching the pattern in `leaderboard-table.tsx`.
  2. Verify all gates pass.
- **Status:** PENDING

---

## Deferred items

### DEFER-1 through DEFER-13: Carried from cycle 23

See `plans/open/2026-04-20-rpf-cycle-23-review-remediation.md` for the full deferred list. All carry forward unchanged.

### DEFER-14: Centralized error handling pattern / useApiFetch hook (new from cycle 24)

- **Source:** AGG-5 (architect ARCH-3, document-specialist DOC-1)
- **Severity / confidence:** MEDIUM / MEDIUM
- **Original severity preserved:** MEDIUM / MEDIUM
- **Citations:** Cross-cutting: `src/lib/api/client.ts`, all components using apiFetch
- **Reason for deferral:** The immediate fixes (H1) address the symptom. A centralized `useApiFetch` hook or ESLint rule is a larger refactor that should be done holistically, not piecemeal. H1 provides the immediate fixes; the shared hook is the long-term DRY improvement.
- **Exit criterion:** When a cycle has capacity for a focused refactor pass, or when a new catch-block pattern violation is found.

---

## Workspace-to-Public Migration Progress

**Current phase:** Phase 4 COMPLETE. Next: Phase 5 (Dashboard layout refinement) or remaining items.

Per the user-injected TODO, this cycle makes incremental progress on the workspace-to-public migration. The migration plan is at `plans/open/2026-04-19-workspace-to-public-migration.md`.

### Phase 3 remaining work

From the migration plan, the following Phase 3 items remain:
- Further slim down `AppSidebar` to icon-only mode or contextual sub-navigation
- Evaluate `(control)` route group merge into `(dashboard)/admin` — DONE (merged in Phase 4)

### Phase 5 (to be defined)

The migration plan currently defines Phases 1-4. Phase 5 should be defined as the next step. Potential items:
- Mobile UX audit of the unified nav
- AppSidebar slim-down to icon rail
- Lecture mode and chat widget integration into the unified layout

---

## Progress log

- 2026-04-20: Plan created from cycle-24 aggregate review.
