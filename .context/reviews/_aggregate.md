# Aggregate Review — Cycle 9/100 (Current)

**Date:** 2026-05-08
**HEAD:** c5eb175b (cycle 8 close-out)
**Reviewers:** code-reviewer, debugger (orchestrator direct; no registered Agent tools)
**Scope:** Full TypeScript/TSX source review + gate execution
**Approach:** Static code analysis, pattern-based search, targeted deep dives

---

## NEW FINDINGS THIS CYCLE

| ID | Severity | Confidence | Title | Source |
|---|---|---|---|---|
| C9-CR-1 | MEDIUM | HIGH | AntiCheatMonitor heartbeat timer restarts after enabled becomes false | code-reviewer, debugger |
| C9-CR-2 | LOW | MEDIUM | OutputDiffView uses index-based React keys for diff lines | code-reviewer, debugger |
| C9-CR-3 | LOW | HIGH | FooterContentForm updateLink uses array index instead of stable id | code-reviewer |
| C9-CR-4 | LOW | LOW | Loading skeleton placeholders use index-based React keys | code-reviewer |
| C9-CR-5 | LOW | LOW | LeaderboardTable uses index-based React keys for table rows | code-reviewer |
| C9-CR-6 | LOW | LOW | AntiCheatDashboard uses index-based React keys | code-reviewer |
| C9-CR-7 | LOW | LOW | ParticipantAntiCheatTimeline uses index-based React keys | code-reviewer |
| C9-CR-8 | LOW | LOW | RecruitingInvitationsPanel uses index-based React keys | code-reviewer |
| C9-CR-9 | LOW | LOW | BulkCreateDialog uses index-based React keys for table rows | code-reviewer |
| C9-CR-10 | LOW | LOW | AnalyticsCharts uses index-based React keys for SVG elements | code-reviewer |

---

## CROSS-AGENT AGREEMENT

- **C9-CR-1 / C9-DB-1** are the same root cause: 2 lanes agree on the AntiCheatMonitor heartbeat timer race condition. debugger provides the concrete step-by-step failure scenario; code-reviewer identifies the structural issue.
- **C9-CR-2 / C9-DB-2** are the same root cause: 2 lanes agree on OutputDiffView index keys.

---

## DETAILED FINDINGS

### C9-CR-1 / C9-DB-1 — AntiCheatMonitor heartbeat timer restarts after enabled becomes false

- **File:** `src/components/exam/anti-cheat-monitor.tsx:180-188`
- **Problem:** When `enabled` prop toggles from true to false while a heartbeat request is in-flight (`await reportEventRef.current("heartbeat")` at line 183), the async setTimeout callback completes and calls `scheduleHeartbeat()` (line 186), which schedules a new timer. The cleanup effect (lines 191-197) only clears the current `heartbeatTimerRef.current` but cannot intercept an already-executing async callback.
- **Concrete failure:** User navigates away from a contest page (enabled becomes false) while a heartbeat network request is in-flight. The heartbeat completes after cleanup, schedules a new timer, and heartbeats continue indefinitely even though the component is logically disabled.
- **Fix:** Guard `scheduleHeartbeat` with an `enabledRef` or `isActiveRef` that tracks the current effect instance. Set the ref to true when the effect runs and false in cleanup; check it before scheduling the next heartbeat.

### C9-CR-2 / C9-DB-2 — OutputDiffView uses index-based React keys for diff lines

- **File:** `src/components/submissions/output-diff-view.tsx:43, 84, 111`
- **Problem:** Three separate `key={i}` uses for diff line rendering. If expected/actual outputs update while the component is mounted, React may mis-identify DOM nodes.
- **Fix:** Use composite keys based on line content + line numbers.

### C9-CR-3 — FooterContentForm updateLink uses array index instead of stable id

- **File:** `src/app/(dashboard)/dashboard/admin/settings/footer-content-form.tsx:64`
- **Problem:** `updateLink(locale, index, field, value)` updates by index even though links have stable `id` fields.
- **Fix:** Update by `id` instead of `index`.

### C9-CR-4 through C9-CR-10 — Various index-based React keys

All are LOW severity pattern violations in mostly-static contexts. See per-agent files for full citations.

---

## AGENT FAILURES

No agent failures. All review work performed directly by the orchestrator due to absence of registered Agent tools.

---

## QUALITY GATES (pre-remediation)

- `eslint .` — PASS (0 errors, 0 warnings)
- `tsc --noEmit` — PASS
- `next build` — PASS
- `vitest run` — PASS (2337 tests)
- `vitest run --config vitest.config.component.ts` — PASS (167 tests)

---

## NEW_FINDINGS COUNT: 10 (1 MEDIUM, 9 LOW)
