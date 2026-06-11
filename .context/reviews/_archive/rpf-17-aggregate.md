# RPF Cycle 17 — Aggregate Review

**Date:** 2026-04-20
**Base commit:** 2af713d3
**Review artifacts:** rpf-17-code-reviewer.md, rpf-17-security-reviewer.md, rpf-17-perf-reviewer.md, rpf-17-architect.md, rpf-17-test-engineer.md, rpf-17-designer.md

## Deduped Findings (sorted by severity then signal)

### AGG-1: Inconsistent client-side datetime formatting — 7+ components bypass timezone-aware utility [MEDIUM/HIGH]

**Flagged by:** code-reviewer (CR-2, CR-3, CR-4, CR-5, CR-6, CR-7), architect (ARCH-1), security-reviewer (SEC-1), test-engineer (TE-1), designer (DES-1)
**Files:**
- `src/components/contest/participant-anti-cheat-timeline.tsx:150`
- `src/components/contest/anti-cheat-dashboard.tsx:257`
- `src/components/contest/code-timeline-panel.tsx:76-80`
- `src/app/(dashboard)/dashboard/admin/plugins/chat-logs/chat-logs-client.tsx:111,155`
- `src/app/(public)/practice/problems/[id]/page.tsx:555`
- `src/app/(public)/practice/page.tsx:697`
- `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:284`

**Description:** These components use raw `toLocaleString(locale)` / `toLocaleDateString(locale)` / `toLocaleTimeString(locale)` without specifying the `timeZone` option. The app has a `formatDateTimeInTimeZone` utility that properly applies the system-configured timezone, but 7+ components bypass it. This causes timestamps to display in the user's browser timezone instead of the system-configured timezone (default: Asia/Seoul).

**Root cause (architectural):** There is no client-side timezone context. Server components can call `getResolvedSystemTimeZone()` and pass it down, but client components lack a shared mechanism for accessing the system timezone.

**Concrete failure scenario:** A proctor in New York (UTC-5) monitoring an anti-cheat dashboard for a contest in Seoul (UTC+9) sees event timestamps in their local timezone, not the contest timezone. They report a "suspicious event at 3:00 AM" but the server logs show it at 5:00 PM Seoul time — 14 hours off.

**Fix:**
1. Create a `SystemTimezoneProvider` context that makes the system timezone available to all client components.
2. Replace all raw `toLocaleString`/`toLocaleDateString`/`toLocaleTimeString` calls with `formatDateTimeInTimeZone` using the system timezone from context.
3. For server components, continue using `getResolvedSystemTimeZone()` and pass timezone as props.

**Cross-agent signal:** 5 of 6 agents flagged this independently — very high signal.

---

### AGG-2: Workers page `formatRelativeTime` uses hardcoded English instead of locale-aware utility [MEDIUM/MEDIUM]

**Flagged by:** code-reviewer (CR-1), designer (DES-1), test-engineer (TE-2)
**Files:** `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:85-95`
**Description:** The local `formatRelativeTime` function produces English-only strings ("5m ago", "2h ago"). The app has `formatRelativeTimeFromNow()` in `@/lib/datetime` which uses `Intl.RelativeTimeFormat` with proper locale support.

**Concrete failure scenario:** Korean admin sees "5m ago" instead of "5분 전" in the workers table.
**Fix:** Replace the local `formatRelativeTime` function with `formatRelativeTimeFromNow` from `@/lib/datetime`, passing the locale.

---

### AGG-3: `access-code-manager.tsx` uses native `confirm()` for destructive action — inconsistent UX and accessibility [LOW/MEDIUM]

**Flagged by:** security-reviewer (SEC-2), designer (DES-2), test-engineer (TE-3)
**Files:** `src/components/contest/access-code-manager.tsx:88`
**Description:** `handleRevoke` uses `if (!confirm(t("revokeConfirm"))) return;` — the browser's native dialog. All other destructive actions in the app use `AlertDialog` components. The native `confirm()` is inconsistent, untestable, lacks ARIA attributes, and cannot be styled.

**Fix:** Replace `confirm()` with an `AlertDialog` component matching the pattern used in `recruiting-invitations-panel.tsx`.

---

### AGG-4: Public problem detail page makes 7+ sequential DB queries — performance opportunity [MEDIUM/MEDIUM]

**Flagged by:** perf-reviewer (PERF-1)
**Files:** `src/app/(public)/practice/problems/[id]/page.tsx:99-214`
**Description:** After the problem lookup, queries for system settings, languages, discussion threads, editorials, stats, similar problems, and user submissions all run sequentially despite being independent. They could be parallelized with `Promise.all`.

**Fix:** Group independent queries into `Promise.all` calls after the problem lookup.

---

### AGG-5: `generateMetadata` and page component fetch problem data with different column selections — `React.cache()` cannot deduplicate [LOW/MEDIUM]

**Flagged by:** perf-reviewer (PERF-2)
**Files:** `src/app/(public)/practice/problems/[id]/page.tsx:40,112`
**Description:** `generateMetadata` uses `columns: { title, description, visibility, ... }` while the page component fetches all columns (no `columns` restriction). Since the query parameters differ, `React.cache()` cannot deduplicate them, resulting in 2 DB queries for the same problem on every page load.

**Fix:** Use a shared cached problem lookup function, or align the column selections.

---

### AGG-6: Workers page polls every 10 seconds unconditionally — wastes resources when tab is backgrounded [LOW/LOW]

**Flagged by:** perf-reviewer (PERF-3)
**Files:** `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:254`
**Description:** `setInterval(fetchData, 10_000)` runs regardless of tab visibility.

**Fix:** Use `visibilitychange` event to pause/resume polling.

---

### AGG-7: PublicHeader mobile menu sign-out button lacks keyboard focus indicator [LOW/LOW]

**Flagged by:** designer (DES-3)
**Files:** `src/components/layout/public-header.tsx:318-325`
**Description:** The mobile sign-out button is missing `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` that navigation links have (line 289).

**Fix:** Add the focus-visible ring styles to the sign-out button.

---

### AGG-8: `formatNumber` in submission-status-badge hardcodes "en-US" locale [LOW/LOW]

**Flagged by:** code-reviewer (CR-8)
**Files:** `src/components/submission-status-badge.tsx:44-46`
**Description:** `n.toLocaleString("en-US")` hardcodes locale for numeric formatting. Low priority since this is technical data.

**Fix:** Low priority. Consider using `Intl.NumberFormat` with the current locale.

---

### AGG-9: AppSidebar still has items that duplicate PublicHeader dropdown — Phase 4 migration incomplete [LOW/MEDIUM]

**Flagged by:** architect (ARCH-3)
**Files:** `src/components/layout/app-sidebar.tsx:62-77`
**Description:** The AppSidebar "Learning" group still shows Problems and Submissions which have counterparts in the PublicHeader dropdown. The Phase 4 migration plan calls for removing these duplicates.

**Fix:** Continue Phase 4 of the workspace-to-public migration plan by removing Problems and Submissions from the AppSidebar.

---

## Previously Deferred Items (Carried Forward)

From cycle-27 aggregate and prior cycles:
- DEFER-1: Migrate raw route handlers to `createApiHandler` (22 routes)
- DEFER-2: SSE connection tracking eviction optimization
- DEFER-3: SSE connection cleanup test coverage

From earlier cycles (still active):
- D1: JWT authenticatedAt clock skew with DB tokenInvalidatedAt (MEDIUM)
- D2: JWT callback DB query on every request — add TTL cache (MEDIUM)
- A19: `new Date()` clock skew risk in remaining routes (LOW)

## Agent Failures

None. All review perspectives completed successfully.
