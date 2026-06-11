# Cycle 23 Aggregate Review

**Date:** 2026-04-20
**Base commit:** bb6f3fc2
**Review artifacts:** `cycle-23-code-reviewer.md`, `cycle-23-security-reviewer.md`, `cycle-23-perf-reviewer.md`, `cycle-23-architect.md`, `cycle-23-critic.md`, `cycle-23-debugger.md`, `cycle-23-designer.md`, `cycle-23-verifier.md`, `cycle-23-test-engineer.md`, `cycle-23-tracer.md`, `cycle-23-document-specialist.md`

## Deduped Findings (sorted by severity then signal)

### AGG-1: `countdown-timer.tsx` uses raw `fetch()` instead of `apiFetch` [MEDIUM/HIGH]

**Flagged by:** code-reviewer (CR-1), security-reviewer (SEC-1), critic (CRI-1), debugger (DBG-1), verifier (V-1), tracer (TR-1)
**Files:** `src/components/exam/countdown-timer.tsx:76`
**Description:** The `CountdownTimer` component calls `fetch("/api/v1/time", ...)` directly instead of using the centralized `apiFetch` wrapper. This is the last remaining client-side raw `fetch()` in a `.tsx` file. The cycle-22 H1 fix migrated all admin and plugin `fetch()` calls but missed this exam component because the audit was directory-scoped. While the target endpoint is GET (not CSRF-gated), the centralized `apiFetch` wrapper exists so all client-side fetch calls go through a single choke point for future security enhancements.
**Concrete failure scenario:** A future security hardening adds a `X-CSRF-Token` header to `apiFetch`. This call site is missed. Alternatively, a developer uses this raw `fetch` pattern as a template for new POST calls.
**Fix:** Replace `fetch("/api/v1/time", ...)` with `apiFetch("/api/v1/time", ...)` and add the import.
**Cross-agent signal:** 6 of 11 agents flagged this independently -- very high signal.

### AGG-2: `contest-quick-stats.tsx` silently swallows fetch errors [LOW/MEDIUM]

**Flagged by:** code-reviewer (CR-2), critic (CRI-2), debugger (DBG-2), verifier (V-2), tracer (TR-2), document-specialist (DOC-1)
**Files:** `src/components/contest/contest-quick-stats.tsx:76-78`
**Description:** The `fetchStats` callback has a `catch` block that contains only `// ignore`. This violates the documented convention in `src/lib/api/client.ts` which states "Never silently swallow errors -- always surface them to the user." Other contest components (clarifications, announcements) properly show toast errors on fetch failure.
**Concrete failure scenario:** A contest admin's network has intermittent issues. Quick stats silently show stale/zero values with no indication data may be outdated.
**Fix:** Add `toast.error(t("fetchError"))` in the catch block, matching the pattern in sibling contest components.
**Cross-agent signal:** 6 of 11 agents flagged this independently -- very high signal.

### AGG-3: Inconsistent polling patterns across components -- no shared hook [MEDIUM/MEDIUM]

**Flagged by:** architect (ARCH-1), perf-reviewer (PERF-1), test-engineer (TE-2)
**Files:** `src/components/contest/leaderboard-table.tsx:243-256`, and 5 other polling components
**Description:** At least 6 components implement polling with visibility-aware pausing, each with slightly different implementations. The leaderboard uses the "fire but skip" anti-pattern (interval always fires, checks visibility in callback). The others properly pause/resume the interval. A shared `useVisibilityAwarePolling` hook would ensure consistency and make future enhancements (backoff, stale-while-revalidate) trivial.
**Concrete failure scenario:** A bug in the visibility-based pausing logic must be fixed in 6 separate places. One component is missed during the fix.
**Fix:** Extract a `useVisibilityAwarePolling(callback, intervalMs)` custom hook. Migrate all 6 components.
**Cross-agent signal:** 3 of 11 agents flagged this.

### AGG-4: AppSidebar "Learning" group has only one item [LOW/LOW]

**Flagged by:** architect (ARCH-2), designer (DES-1)
**Files:** `src/components/layout/app-sidebar.tsx:56-70`
**Description:** After the workspace-to-public migration removed items from the sidebar, the "Learning" group contains only "Problems". A single-item group with a heading label adds visual noise.
**Fix:** Remove the "Learning" group label or merge "Problems" into "Manage".
**Cross-agent signal:** 2 of 11 agents flagged this.

### AGG-5: Workspace-to-public migration Phase 4 remaining items lack concrete enumeration [INFO/MEDIUM]

**Flagged by:** critic (CRI-3), document-specialist (DOC-2)
**Files:** `plans/open/2026-04-19-workspace-to-public-migration.md:251-254`
**Description:** The migration plan's Phase 4 remaining work says "Remove redundant page components under `(dashboard)` where public counterparts exist" but does not enumerate which specific components remain. After redirects for rankings/languages/compiler, it is unclear what dashboard pages still have public counterparts that could be removed.
**Fix:** Audit remaining dashboard routes against public routes; enumerate remaining removals or mark Phase 4 as complete.
**Cross-agent signal:** 2 of 11 agents flagged this.

### AGG-6: No tests for `CountdownTimer` component [LOW/MEDIUM]

**Flagged by:** test-engineer (TE-1)
**Files:** `src/components/exam/countdown-timer.tsx`
**Description:** The `CountdownTimer` has complex state logic (server time sync, threshold-based toasts, interval-based countdown, expired state) but no unit tests. Exam timers are critical for test integrity.
**Fix:** Add unit tests for `CountdownTimer`: verify countdown display, threshold toast triggers, expired state, and server time offset calculation.
**Cross-agent signal:** 1 of 11 agents flagged this.

### AGG-7: Practice page Path B progress filter (carried from cycle 18) [MEDIUM/MEDIUM]

**Flagged by:** perf-reviewer (PERF-2)
**Files:** `src/app/(public)/practice/page.tsx:412-449`
**Description:** Carried forward from cycle 18 (DEFER-1). When a progress filter is active, Path B fetches ALL matching problem IDs and ALL user submissions into memory. This is a scale concern, not an immediate bug.
**Exit criterion:** Problem count exceeds 5,000 or a performance benchmark shows >2s page load time.
**Cross-agent signal:** 1 of 11 agents flagged this (recurring from prior cycles).

### AGG-8: `anti-cheat-monitor.tsx` localStorage is client-controlled and tamperable [LOW/LOW]

**Flagged by:** security-reviewer (SEC-2)
**Files:** `src/components/exam/anti-cheat-monitor.tsx:27-46`
**Description:** Pending anti-cheat events stored in localStorage have no integrity check. A student can delete pending events via DevTools. This is an inherent limitation of client-side anti-cheat.
**Fix:** Document the limitation. Server-side detection is the real mitigation.
**Cross-agent signal:** 1 of 11 agents flagged this.

## Verified Safe / No Regression Found

- Auth flow is robust with Argon2id, timing-safe dummy hash, rate limiting, and proper token invalidation.
- HTML sanitization uses DOMPurify with strict tag/attribute allowlists, URI regexp blocking, auto-rel=noopener.
- JSON-LD uses `safeJsonForScript` to prevent `</script>` breakout.
- All SQL uses parameterized queries via Drizzle ORM.
- No `innerHTML` assignments, `as any` casts, or `@ts-ignore` directives.
- Korean letter-spacing is comprehensively conditional throughout all components.
- Workspace-to-public migration is correctly executed: no `/workspace` references, `(control)` group merged.
- Navigation is centralized via shared `public-nav.ts` with capability-based filtering.
- `apiFetch` has unit tests (cycle 22 M3).
- Workers page visibility polling works correctly (cycle 22 M4).
- All contest components (except leaderboard) use visibility-aware polling.
- `SubmissionListAutoRefresh` checks `document.visibilityState` before refreshing.
- Public problem detail page parallelizes independent queries with `Promise.all`.
- All clipboard operations have proper error handling.
- `formatNumber` deprecated re-export has been removed.

## Agent Failures

None. All 11 review perspectives completed successfully.
