# RPF Cycle 2 — Aggregate Review

**Date:** 2026-04-22
**Base commit:** 14218f45
**Review artifacts:** rpf-cycle-2-code-reviewer.md, rpf-cycle-2-security-reviewer.md, rpf-cycle-2-perf-reviewer.md, rpf-cycle-2-architect.md, rpf-cycle-2-debugger.md, rpf-cycle-2-verifier.md, rpf-cycle-2-designer.md, rpf-cycle-2-test-engineer.md, rpf-cycle-2-tracer.md, rpf-cycle-2-critic.md

## Deduped Findings (sorted by severity then signal)

### AGG-1: `recruiting-invitations-panel.tsx` custom expiry date `min` attribute uses UTC instead of local time — blocks valid dates for Korean users [MEDIUM/HIGH]

**Flagged by:** code-reviewer (CR-1), debugger (DBG-1), verifier (V-1), tracer (TR-2), test-engineer (TE-1), critic (CRI-1)
**Files:** `src/components/contest/recruiting-invitations-panel.tsx:407`

**Description:** The `min` attribute on the custom expiry date input is computed as `new Date().toISOString().split("T")[0]`, which produces a UTC date. The native `<input type="date">` renders and compares in the user's local timezone. This creates a mismatch that affects users in timezones ahead of UTC (e.g., Korean users at UTC+9) between midnight and 9 AM local time — they would be blocked from selecting the current local date as the minimum.

**Concrete failure scenario:** A Korean contest organizer at 2 AM local time on April 22 tries to set a custom expiry date. `new Date().toISOString()` returns `2026-04-21T17:00:00.000Z`, so `min` is set to `2026-04-21`. The date picker shows April 22 as the current date in local time, but the `min` constraint allows selecting April 21 — which is yesterday. However, the reverse is also problematic: a user in UTC-5 at 11 PM on April 21 gets `min=2026-04-22` (UTC), which blocks April 21 even though it's still their current date.

**Fix:** Use local date formatting: `new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split("T")[0]` or `new Date().toLocaleDateString("sv-SE")`.

---

### AGG-2: `SubmissionListAutoRefresh` lacks error-state backoff — compounding load during server stress [MEDIUM/MEDIUM]

**Flagged by:** code-reviewer (CR-2), perf-reviewer (PERF-1), test-engineer (TE-3)
**Files:** `src/components/submission-list-auto-refresh.tsx:24-28`

**Description:** The auto-refresh component calls `router.refresh()` on a fixed interval (5s active, 10s idle) with no error handling or exponential backoff. During server overload, every client continues polling at the same rate, creating a compounding load problem. The submission detail polling in `use-submission-polling.ts` correctly implements exponential backoff, but this list component does not.

**Concrete failure scenario:** During a large contest with 200 participants viewing the submission list, the server starts returning errors. All 200 clients continue polling at 5-second intervals, generating 40 req/s of useless traffic that delays recovery.

**Fix:** Add error-state tracking and exponential backoff, similar to `initFetchPolling` in `use-submission-polling.ts`.

---

### AGG-3: `workers-client.tsx` `AliasCell` does not show error feedback on save failure — silent data loss [LOW/MEDIUM]

**Flagged by:** debugger (DBG-2), test-engineer (TE-2), critic (CRI-2)
**Files:** `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:91-101`

**Description:** The `handleSave` function in `AliasCell` calls `apiFetch` to update the alias but only checks `res.ok` to close the editing state. When the request fails, the edit UI closes and the old alias is shown, but no error feedback is given. The admin might assume the save succeeded.

**Concrete failure scenario:** Admin edits a worker alias, presses Enter, the API returns 403. The editing UI closes, the old alias is displayed, and no error toast is shown. The admin assumes the rename worked.

**Fix:** Add an `else` branch with `toast.error()` for save failure.

---

### AGG-4: `contest-clarifications.tsx` shows raw `userId` instead of username — poor UX for participants [LOW/MEDIUM]

**Flagged by:** code-reviewer (CR-3), designer (DES-1)
**Files:** `src/components/contest/contest-clarifications.tsx:257`

**Description:** When displaying who asked a clarification, the component shows `clarification.userId` (a raw UUID) for other users' questions. This was deferred as DEFER-20 in cycle 28. Re-flagged because it was also found in this fresh review.

**Fix:** Backend API needs to include `userName` in the clarifications response. Frontend should display the resolved name.

---

### AGG-5: `contest-clarifications.tsx` uses native `<select>` instead of project's `Select` component — inconsistent styling [LOW/LOW]

**Flagged by:** designer (DES-2), critic (CRI-3)
**Files:** `src/components/contest/contest-clarifications.tsx:204-217`

**Description:** The problem selector in the clarification form uses a native `<select>` element with Tailwind classes instead of the project's `Select`/`SelectTrigger`/`SelectContent`/`SelectItem` components. This creates visual inconsistency.

**Fix:** Replace the native `<select>` with the project's `Select` component family.

---

### AGG-6: `recruiting-invitations-panel.tsx` date input has no `aria-label` [LOW/LOW]

**Flagged by:** designer (DES-3)
**Files:** `src/components/contest/recruiting-invitations-panel.tsx:403-408`

**Description:** The custom expiry date `<Input type="date">` has no `aria-label` or associated `<Label htmlFor>` attribute. Screen readers will announce it without context about what date it represents.

**Fix:** Add `aria-label={t("expiryDate")}` or use a `Label` with `htmlFor`.

---

### AGG-7: Visibility-aware polling pattern duplicated across 6+ components — no shared hook [LOW/MEDIUM] (carried forward)

**Flagged by:** architect (ARCH-1)
**Files:** `src/components/contest/contest-clarifications.tsx:87-111`, `src/components/contest/contest-announcements.tsx:71-95`, `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:247-270`, `src/components/contest/participant-anti-cheat-timeline.tsx:128-142`, `src/components/contest/leaderboard-table.tsx:250-265`, `src/components/contest/contest-replay.tsx:70-82`

**Description:** At least 6 components implement their own visibility-aware polling pattern. This was previously deferred as DEFER-21 in cycle 28.

**Fix:** Extract a `useVisibilityAwarePolling(fetchFn, intervalMs)` hook.

---

### AGG-8: `copyToClipboard` imported via dynamic `await import()` in 5 components but static in 2 — inconsistent import strategy [LOW/LOW]

**Flagged by:** architect (ARCH-2)
**Files:** See architect review for full list.

**Description:** After the cycle 1 clipboard consolidation, most components use dynamic `await import("@/lib/clipboard")` while `copy-code-button.tsx` uses a static import. The dynamic import is unnecessary for a tiny module.

**Fix:** Use static imports across all components.

---

### AGG-9: Practice page Path B progress filter still fetches all matching IDs + submissions into memory [MEDIUM/MEDIUM] (carried forward)

**Flagged by:** perf-reviewer (PERF-2)
**Files:** `src/app/(public)/practice/page.tsx:410-519`

**Description:** Carried forward from cycle 18 (AGG-3). When a progress filter is active, Path B fetches ALL matching problem IDs and ALL user submissions into memory, filters in JavaScript, and paginates. Scale concern, not an immediate bug.

**Fix:** Move the progress filter logic into a SQL CTE or subquery.

---

### AGG-10: `recruiting-invitations-panel.tsx` constructs invitation URL using `window.location.origin` — potential fragility [LOW/MEDIUM]

**Flagged by:** security-reviewer (SEC-1), tracer (TR-1)
**Files:** `src/components/contest/recruiting-invitations-panel.tsx:95,181,207`

**Description:** The component uses `window.location.origin` to build invitation links. In most deployments this is trustworthy, but it could be incorrect behind misconfigured proxies (the codebase already has proxy-header-related workarounds in `contests/layout.tsx`).

**Fix:** Consider using a server-provided `appUrl` config value for constructing invitation URLs.

---

### AGG-11: Duplicate `formatTimestamp` utility across `contest-clarifications.tsx` and `contest-announcements.tsx` [LOW/LOW]

**Flagged by:** code-reviewer (CR-5)
**Files:** `src/components/contest/contest-clarifications.tsx:39-47`, `src/components/contest/contest-announcements.tsx:29-37`

**Description:** Both components define identical `formatTimestamp` functions. The project has `formatDateTimeInTimeZone` in `src/lib/datetime.ts`.

**Fix:** Extract to a shared utility or use the existing `formatDateTimeInTimeZone`.

---

## Previously Deferred Items (Carried Forward)

From cycle-1 aggregate and prior cycles:
- DEFER-1: Migrate raw route handlers to `createApiHandler` (22 routes)
- DEFER-2: SSE connection tracking eviction optimization
- DEFER-3: SSE connection cleanup test coverage

From earlier cycles (still active):
- D1: JWT authenticatedAt clock skew with DB tokenInvalidatedAt (MEDIUM)
- D2: JWT callback DB query on every request — add TTL cache (MEDIUM)
- A19: `new Date()` clock skew risk in remaining routes (LOW)

From cycle-28 plan:
- DEFER-20: Contest clarifications show raw userId instead of username (AGG-4)
- DEFER-21: Duplicated visibility-aware polling pattern (AGG-7)

## Resolved Issues (from Cycle 1)

- AGG-1: Clipboard copy logic consolidated to shared utility — CONFIRMED RESOLVED
- AGG-2: Contest layout hard-navigation scoped to `data-full-navigate` — CONFIRMED RESOLVED
- AGG-3: `use-source-draft.ts` localStorage.removeItem wrapped in try/catch — CONFIRMED RESOLVED
- AGG-4: `recruiting-invitations-panel.tsx` unhandled promise rejection on clipboard failure — CONFIRMED RESOLVED (via shared clipboard utility)
- AGG-5: `compiler-client.tsx` remaining `defaultValue` fallbacks — CONFIRMED RESOLVED
- AGG-6: `submission-detail-client.tsx` score display uses `formatScore` — CONFIRMED RESOLVED
- AGG-7: `compiler-client.tsx` keyboard shortcut fires in textarea — CONFIRMED RESOLVED
- AGG-10: Anti-cheat privacy notice uses `<Button>` component — CONFIRMED RESOLVED
- AGG-11: `access-code-manager.test.tsx` misleading test name — CONFIRMED RESOLVED

## Agent Failures

None. All 10 review perspectives completed successfully.
