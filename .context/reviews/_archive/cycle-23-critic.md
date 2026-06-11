# Cycle 23 Critic Review

**Date:** 2026-04-20
**Base commit:** bb6f3fc2

## Findings

### CRI-1: `countdown-timer.tsx` raw `fetch()` -- last holdout from apiFetch migration [MEDIUM/HIGH]

**Files:** `src/components/exam/countdown-timer.tsx:76`
**Description:** This is the same finding as CR-1/SEC-1. The exam timer's raw `fetch()` call is the only remaining client-side fetch that bypasses the centralized `apiFetch` wrapper. The cycle-22 migration covered admin and plugin components, but exam components were out of scope. This should be treated as a continuation of the cycle-22 H1 fix rather than a new finding.
**Fix:** Replace `fetch("/api/v1/time", ...)` with `apiFetch("/api/v1/time", ...)`.
**Confidence:** HIGH

### CRI-2: `contest-quick-stats.tsx` silently swallows errors -- violates project convention [LOW/MEDIUM]

**Files:** `src/components/contest/contest-quick-stats.tsx:76-78`
**Description:** Same as CR-2. The `catch { // ignore }` pattern violates the documented convention in `src/lib/api/client.ts` that errors should never be silently swallowed. Other contest components in the same feature area (clarifications, announcements) properly show toast errors.
**Fix:** Add toast error feedback.
**Confidence:** MEDIUM

### CRI-3: Workspace-to-public migration Phase 4 remaining items lack concrete next steps [INFO/MEDIUM]

**Files:** `plans/open/2026-04-19-workspace-to-public-migration.md:251-254`
**Description:** The migration plan's Phase 4 remaining work lists "Remove redundant page components under `(dashboard)` where public counterparts exist" but does not enumerate which specific page components remain to be removed. After the redirects for rankings, languages, and compiler, it is unclear what dashboard page components still have public counterparts that could be removed. The plan should explicitly list the remaining items or mark this as complete.
**Fix:** Audit the dashboard routes against public routes and either enumerate remaining removals or mark Phase 4 as complete.
**Confidence:** MEDIUM

## Verified Safe

- The codebase is in a healthy state overall with strong conventions for error handling, security, and i18n.
- Korean letter-spacing compliance is thorough and consistent.
- The workspace-to-public migration has made substantial progress across 23 cycles.
