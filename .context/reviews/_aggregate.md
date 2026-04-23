# RPF Cycle 18 — Aggregate Review

**Date:** 2026-04-22
**Base commit:** d32f2517
**Review artifacts:** code-reviewer.md, perf-reviewer.md, security-reviewer.md, architect.md, critic.md, verifier.md, debugger.md, test-engineer.md, tracer.md, designer.md, document-specialist.md

## Previously Fixed Items (Verified in Current Code)

All cycle-16/17 aggregate findings have been addressed:
- AGG-1 (last unguarded `res.json()` in compiler-client): Fixed — `.catch()` added
- AGG-2 (incomplete `apiFetchJson` adoption): Substantially fixed — 5 more components migrated
- AGG-3 (invite-participants AbortController): Fixed — AbortController added
- AGG-4 (test-connection 500 for malformed JSON): Fixed — returns 400
- AGG-5 (file-management aria-label): Fixed — `aria-label` added
- AGG-6 (anti-cheat privacy notice Dialog): Fixed — uses Dialog component
- AGG-7 (countdown-timer aria-live): Fixed — uses `polite` for non-1-minute thresholds

## Deduped Findings (sorted by severity then signal)

### AGG-1: `participant-anti-cheat-timeline.tsx` `formatDetailsJson` hardcoded English strings — i18n violation [MEDIUM/HIGH]

**Flagged by:** code-reviewer (CR-4), architect (ARCH-3), critic (CRI-1), verifier (V-3), document-specialist (DOC-1), tracer (partial — TR-3 related)
**Signal strength:** 5 of 11 review perspectives

**File:** `src/components/contest/participant-anti-cheat-timeline.tsx:45-63`

**Description:** The `formatDetailsJson` helper function returns hardcoded English strings ("Target: Code editor", "Target: Problem description") in a component that otherwise uses `useTranslations`. The function is defined outside the component scope and cannot access the `t()` function.

**Concrete failure scenario:** A Korean locale user expands anti-cheat event details and sees "Target: Code editor" in English instead of the localized Korean string.

**Fix:** Convert to a component method that uses `t()`, or pass `t` as a parameter. Move the labels mapping to i18n keys.

---

### AGG-2: `recruiter-candidates-panel.tsx` fetches full export endpoint for display — no pagination, no server-side filtering [MEDIUM/MEDIUM]

**Flagged by:** code-reviewer (CR-1), perf-reviewer (PERF-1), critic (CRI-4)
**Signal strength:** 3 of 11 review perspectives

**File:** `src/components/contest/recruiter-candidates-panel.tsx:50-53`

**Description:** The component fetches the full export endpoint (`/api/v1/contests/${assignmentId}/export?format=json`) for display purposes. The export endpoint is designed for bulk data download, not for paginated display. All candidates are loaded into browser memory, then searched and sorted client-side.

**Concrete failure scenario:** A contest with 5000+ candidates causes a large JSON payload download, full in-memory sort on every search keystroke, and no way to paginate.

**Fix:** Create a dedicated server-side paginated endpoint with search and sort parameters. Previously identified as DEFER-29.

---

### AGG-3: `participant-anti-cheat-timeline.tsx` polling offset drift causes duplicate or missing events [MEDIUM/MEDIUM]

**Flagged by:** debugger (DBG-1), verifier (V-1), tracer (TR-1)
**Signal strength:** 3 of 11 review perspectives

**File:** `src/components/contest/participant-anti-cheat-timeline.tsx:96-114`

**Description:** When polling refreshes the first page of events, the code preserves events beyond `PAGE_SIZE` from previous `loadMore` calls. If new events are created server-side between polls, the boundary between the fresh first page and the preserved second page may overlap (duplicates) or have a gap (missing events).

**Concrete failure scenario:** 5 new anti-cheat events are created between polls. The user has loaded 2 pages (100 events). The refreshed first 50 events overlap with the previous first 50 events at the boundary. Events at positions 51-60 on the server are missing from the display.

**Fix:** On poll refresh, reset to just the first page and invalidate the `loadMore` offset, or deduplicate by event ID.

---

### AGG-4: `api-keys-client.tsx` not migrated to `apiFetchJson` — last raw-pattern admin component [MEDIUM/MEDIUM]

**Flagged by:** code-reviewer (CR-2), architect (ARCH-1), verifier (V-2)
**Signal strength:** 3 of 11 review perspectives

**File:** `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:137-191`

**Description:** The API keys admin component is the last remaining admin component using raw `apiFetch` + `res.json().catch()` for both GET and POST patterns. All other admin components have been migrated to `apiFetchJson`. This creates a maintenance hazard.

**Fix:** Migrate `fetchKeys` and `handleCreate` to use `apiFetchJson`.

---

### AGG-5: `window.location.origin` used for invitation/URL construction — may be incorrect behind reverse proxy [MEDIUM/MEDIUM]

**Flagged by:** security-reviewer (SEC-1, SEC-2)
**Signal strength:** 2 of 11 review perspectives (carried from DEFER-24)

**Files:**
- `src/components/contest/access-code-manager.tsx:137`
- `src/components/contest/recruiting-invitations-panel.tsx:99`

**Description:** Both components construct invitation URLs using `window.location.origin`. If the app is accessed through a reverse proxy that rewrites the Host header, the origin may differ from the intended public URL. Carried from DEFER-24.

**Fix:** Use a server-provided public URL or a configurable base URL for invitation links.

---

### AGG-6: `active-timed-assignment-sidebar-panel.tsx` timer lacks visibility awareness — continues ticking in background [LOW/MEDIUM]

**Flagged by:** perf-reviewer (PERF-3), debugger (DBG-2)
**Signal strength:** 2 of 11 review perspectives

**File:** `src/components/layout/active-timed-assignment-sidebar-panel.tsx:72-84`

**Description:** The sidebar timer uses `window.setInterval` with 1-second ticks without visibility awareness. Unlike `countdown-timer.tsx` which recalculates on `visibilitychange`, this timer continues firing when the tab is hidden. This wastes CPU cycles and may show stale values on tab return.

**Fix:** Add a `visibilitychange` listener to pause/resume the interval and immediately recalculate on tab return.

---

### AGG-7: Duplicate `formatDuration` function in two components — should be shared utility [LOW/MEDIUM]

**Flagged by:** architect (ARCH-4), critic (CRI-2)
**Signal strength:** 2 of 11 review perspectives

**Files:**
- `src/components/exam/countdown-timer.tsx:17-24`
- `src/components/layout/active-timed-assignment-sidebar-panel.tsx:16-23`

**Description:** Two identical `formatDuration` functions exist. The `formatting.ts` module already centralizes `formatNumber`, `formatScore`, `formatBytes`, `formatDifficulty` — `formatDuration` should live there too.

**Fix:** Move `formatDuration` to `src/lib/formatting.ts` and import it in both components.

---

### AGG-8: `code-timeline-panel.tsx` mini-timeline buttons lack `aria-label` [LOW/MEDIUM]

**Flagged by:** code-reviewer (CR-3), designer (DES-1)
**Signal strength:** 2 of 11 review perspectives

**File:** `src/components/contest/code-timeline-panel.tsx:170-179`

**Description:** The snapshot mini-timeline uses `<button>` elements with only `title` attributes. Screen readers do not reliably announce `title` attributes. Each dot should have an `aria-label` describing which snapshot it represents.

**Fix:** Add `aria-label` to each timeline dot button.

---

### AGG-9: `quick-create-contest-form.tsx` success path silently fails when `assignmentId` is missing [LOW/MEDIUM]

**Flagged by:** debugger (DBG-3), tracer (TR-3)
**Signal strength:** 2 of 11 review perspectives

**File:** `src/components/contest/quick-create-contest-form.tsx:79-84`

**Description:** After a successful API response, if `json.data?.assignmentId` is undefined (malformed success response), the user sees a "createSuccess" toast but is not redirected to the contest page. No error feedback is shown.

**Fix:** If `assignmentId` is missing on a success response, show an error toast or redirect to the contests list.

---

### AGG-10: `participant-anti-cheat-timeline.tsx` expand/collapse buttons lack `aria-controls` [LOW/LOW]

**Flagged by:** designer (DES-2)
**Signal strength:** 1 of 11 review perspectives

**File:** `src/components/contest/participant-anti-cheat-timeline.tsx:275-292`

**Description:** The expand/collapse buttons use `aria-expanded` but don't have `aria-controls` pointing to the panel they control.

**Fix:** Add an `id` to the expanded `<pre>` element and reference it via `aria-controls`.

---

## Security Findings (from security-reviewer)

### SEC-1/SEC-2: `window.location.origin` for URL construction — covered by AGG-5 above
### SEC-3: Gemini model name interpolation into URL path — defense-in-depth concern [LOW/MEDIUM]
### SEC-4: Plaintext fallback in encryption module — carried from SEC-2 (cycle 11) [MEDIUM/MEDIUM]

## Performance Findings (from perf-reviewer)

### PERF-1: `recruiter-candidates-panel.tsx` full export fetch — covered by AGG-2 above
### PERF-2: Practice page Path B progress filter — carried from cycle 18/19 AGG-5 [MEDIUM/MEDIUM]
### PERF-3: Sidebar timer visibility awareness — covered by AGG-6 above
### PERF-4: Code timeline all snapshots fetch — LOW/MEDIUM, no immediate action needed

## Test Coverage Gaps (from test-engineer)

### TE-1: No unit tests for `formatDetailsJson` — new [LOW/MEDIUM]
### TE-2: No unit tests for `formatDuration` — new (add when consolidating) [LOW/MEDIUM]
### TE-3: No component tests for `quick-create-contest-form.tsx` — new [LOW/MEDIUM]
### TE-4: No component tests for `api-keys-client.tsx` — new [LOW/MEDIUM]
### TE-5: `apiFetchJson` helper untested — carried from DEFER-56 [LOW/MEDIUM]
### TE-6: Encryption module untested — carried from DEFER-50 [MEDIUM/HIGH]

## Documentation Findings (from document-specialist)

### DOC-1: `formatDetailsJson` labels not documented for localization — covered by AGG-1 above

## Previously Deferred Items (Carried Forward)

- DEFER-1: Migrate raw route handlers to `createApiHandler` (22 routes)
- DEFER-2: SSE connection tracking eviction optimization
- DEFER-3: SSE connection cleanup test coverage
- D1: JWT authenticatedAt clock skew with DB tokenInvalidatedAt (MEDIUM)
- D2: JWT callback DB query on every request — add TTL cache (MEDIUM)
- A19: `new Date()` clock skew risk in remaining routes (LOW)
- DEFER-20: Contest clarifications show raw userId instead of username
- DEFER-21: Duplicated visibility-aware polling pattern (partially addressed)
- DEFER-22: copyToClipboard dynamic import inconsistency
- DEFER-23: Practice page Path B progress filter
- DEFER-24: Invitation URL uses window.location.origin (same as AGG-5)
- DEFER-25: Duplicate formatTimestamp utility
- DEFER-26: Unit tests for create-group-dialog.tsx and bulk-create-dialog.tsx
- DEFER-27: Unit tests for comment-section.tsx
- DEFER-28: Unit tests for participant-anti-cheat-timeline.tsx polling behavior
- DEFER-29: Add dedicated candidates summary endpoint for recruiter-candidates-panel (same as AGG-2)
- DEFER-30: Remove unnecessary `router.refresh()` from discussion-vote-buttons
- ARCH-1: Centralized error-to-i18n mapping utility (refactor suggestion)
- DEFER-50: Encryption module unit tests (from TE-3)
- DEFER-51: Unit tests for create-problem-form.tsx (from TE-4)
- DEFER-52: Unit tests for problem-export-button.tsx (from TE-5)
- DEFER-53: `contest-join-client.tsx` 1-second setTimeout delay (from PERF-3)
- DEFER-54: Anti-cheat dashboard polling full shallow comparison for multi-page data
- DEFER-55: `recruiting-invitations-panel.tsx` Promise.all vs Promise.allSettled
- DEFER-56: Unit tests for apiFetchJson helper (from TE-4)
- DEFER-57: Unit tests for recruiting-invitations-panel.tsx (from TE-5)

## Agent Failures

None. All 11 review perspectives completed successfully.
