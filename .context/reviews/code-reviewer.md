# Code Review — Cycle 9

**Reviewer:** code-reviewer (orchestrator direct)
**Date:** 2026-05-08
**HEAD:** c5eb175b (cycle 8 close-out)
**Scope:** Full TypeScript/TSX source review focusing on logic bugs, React correctness, and maintainability in areas not touched by prior cycles.

---

## NEW FINDINGS

### C9-CR-1 — AntiCheatMonitor heartbeat timer restarts after enabled becomes false

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/components/exam/anti-cheat-monitor.tsx:180-188`
- **Problem:** When `enabled` prop toggles from true to false while a heartbeat request is in-flight (`await reportEventRef.current("heartbeat")` at line 183), the async setTimeout callback completes and calls `scheduleHeartbeat()` (line 186), which schedules a new timer. The cleanup effect (lines 191-197) only clears the current `heartbeatTimerRef.current` but cannot intercept an already-executing async callback.
- **Concrete failure:** User navigates away from a contest page (enabled becomes false) while a heartbeat network request is in-flight. The heartbeat completes after cleanup, schedules a new timer, and heartbeats continue indefinitely even though the component is logically disabled.
- **Fix:** Guard `scheduleHeartbeat` with an `enabledRef` that tracks the current effect instance, or check `enabled` inside the setTimeout callback before scheduling the next iteration.

### C9-CR-2 — OutputDiffView uses index-based React keys for diff lines

- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/components/submissions/output-diff-view.tsx:43, 84, 111`
- **Problem:** Three separate `key={i}` uses for diff line rendering (UnifiedDiffView line 43, SideBySideDiffView left column line 84, right column line 111). Diff outputs could shift if expected/actual outputs update while the component is mounted (e.g., auto-refresh on submission detail).
- **Fix:** Use a composite key based on line content + line numbers, or generate stable IDs from the diff data.

### C9-CR-3 — FooterContentForm updateLink uses array index instead of stable id

- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/app/(dashboard)/dashboard/admin/settings/footer-content-form.tsx:64`
- **Problem:** `updateLink(locale, index, field, value)` updates `links[index]` even though links now have stable `id` fields (added in cycle 8 fix). Index-based updates are fragile against future reordering or insertion features.
- **Fix:** Change signature to `updateLink(locale, id, field, value)` and find the link by `id` instead of `index`.

### C9-CR-4 — Loading skeleton placeholders use index-based React keys

- **Severity:** LOW
- **Confidence:** LOW
- **Files:**
  - `src/app/(dashboard)/dashboard/admin/loading.tsx:9`
  - `src/app/(dashboard)/dashboard/admin/submissions/loading.tsx:9`
  - `src/app/(dashboard)/dashboard/admin/users/loading.tsx:9`
  - `src/app/(public)/problems/loading.tsx:9`
  - `src/app/(public)/groups/loading.tsx:9`
  - `src/app/(public)/contests/manage/loading.tsx:9`
  - `src/app/(public)/contests/manage/[assignmentId]/participant/loading.tsx:18,24`
- **Problem:** Static skeleton placeholders use `key={i}`. Not actively harmful since items never reorder, but pattern violation.
- **Fix:** Use a static array of IDs or omit key since the list is constant length.

### C9-CR-5 — LeaderboardTable uses index-based React keys for table rows

- **Severity:** LOW
- **Confidence:** LOW
- **File:** `src/components/contest/leaderboard-table.tsx:132, 140`
- **Problem:** Table headers and rows use `key={i}`. Headers are static; rows might reorder if live leaderboard updates.
- **Fix:** Use participant userId or rank as key for rows.

### C9-CR-6 — AntiCheatDashboard uses index-based React keys

- **Severity:** LOW
- **Confidence:** LOW
- **File:** `src/components/contest/anti-cheat-dashboard.tsx:482`
- **Problem:** Event frequency bars use `key={i}`.
- **Fix:** Use event type + index as composite key.

### C9-CR-7 — ParticipantAntiCheatTimeline uses index-based React keys

- **Severity:** LOW
- **Confidence:** LOW
- **File:** `src/components/contest/participant-anti-cheat-timeline.tsx:219`
- **Problem:** Timeline event items use `key={i}`.
- **Fix:** Use event timestamp + type as composite key.

### C9-CR-8 — RecruitingInvitationsPanel uses index-based React keys

- **Severity:** LOW
- **Confidence:** LOW
- **File:** `src/components/contest/recruiting-invitations-panel.tsx:472`
- **Problem:** Invitation list items use `key={i}`.
- **Fix:** Use invitation ID as key.

### C9-CR-9 — BulkCreateDialog uses index-based React keys for table rows

- **Severity:** LOW
- **Confidence:** LOW
- **File:** `src/app/(dashboard)/dashboard/admin/users/bulk-create-dialog.tsx:347`
- **Problem:** Preview table rows use `key={i}`.
- **Fix:** Use email or row index + email as composite key.

### C9-CR-10 — AnalyticsCharts uses index-based React keys for SVG elements

- **Severity:** LOW
- **Confidence:** LOW
- **File:** `src/components/contest/analytics-charts.tsx:97`
- **Problem:** SVG bar chart elements use `key={i}`.
- **Fix:** Use score bucket value as key.

---

## CARRY-FORWARD DEFERRED ITEMS

All previously deferred items remain unchanged and are not re-reported here per cycle instructions.

---

## AGENT FAILURES

No agent failures. Review performed directly by orchestrator due to absence of registered Agent tools.
