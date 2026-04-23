# RPF Cycle 15 — Aggregate Review

**Date:** 2026-04-22
**Base commit:** 6c07a08d
**Review artifacts:** code-reviewer.md, perf-reviewer.md, security-reviewer.md, architect.md, critic.md, verifier.md, debugger.md, test-engineer.md, tracer.md, designer.md, document-specialist.md

## Previously Fixed Items (Verified in Current Code)

All cycle 14 aggregate findings have been addressed:
- AGG-1 (systemic unguarded `res.json()` — centralized `apiFetchJson` helper): Fixed — helper created and used in 4 contest components
- AGG-2 (double `res.json()` in create-problem-form): Fixed — single parse + `.catch()` guard
- AGG-3 (problem-import-button file size validation): Fixed — 10MB limit
- AGG-4 (problem-export-button null-safety): Fixed — `.catch()` and null-safe access
- AGG-5 (contest-join-client variable shadowing): Fixed — renamed to `errorPayload`

## Deduped Findings (sorted by severity then signal)

### AGG-1: Four remaining unguarded `res.json()` calls — incomplete `apiFetchJson` adoption [MEDIUM/HIGH]

**Flagged by:** code-reviewer (CR-1), critic (CRI-1), verifier (V-1), debugger (DBG-1, DBG-2), tracer (TR-1, TR-2), architect (ARCH-1), security-reviewer (SEC-3), perf-reviewer (implicit)
**Signal strength:** 8 of 11 review perspectives

**Files:**
- `src/components/contest/recruiting-invitations-panel.tsx:137` — `const json = await invRes.json();` — no `.catch()`
- `src/components/contest/recruiting-invitations-panel.tsx:152` — `const json = await statsRes.json();` — no `.catch()`
- `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:235` — `const wd = await workersRes.json();` — no `.catch()`
- `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:241` — `const sd = await statsRes.json();` — no `.catch()`

**Description:** The cycle 14 `apiFetchJson` refactor addressed the root cause of the recurring unguarded `.json()` pattern by creating a centralized helper. However, the refactor was incomplete — 4 calls in 2 files were missed. The `recruiting-invitations-panel.tsx` is particularly notable because it's in the same feature area as the 4 refactored contest components, creating an inconsistency where adjacent components use different patterns.

**Fix:** Migrate both files to use `apiFetchJson`:
- `recruiting-invitations-panel.tsx`: Use `apiFetchJson` for `fetchInvitations` and `fetchStats`
- `workers-client.tsx`: Use `apiFetchJson` for workers and stats endpoints

---

### AGG-2: `recruiting-invitations-panel.tsx` metadata remove button missing `aria-label` [LOW/MEDIUM]

**Flagged by:** code-reviewer (CR-4), critic (CRI-2), verifier (V-2), debugger (DBG-3), designer (DES-1)
**Signal strength:** 5 of 11 review perspectives

**File:** `src/components/contest/recruiting-invitations-panel.tsx:479-485`

**Description:** The "remove metadata field" button renders a `Trash2` icon with no visible text and no `aria-label`. While this uses `size="sm"` instead of `size="icon"`, it is functionally an icon-only button. This is the same class of accessibility issue that was fixed in cycles 11-13 for `size="icon"` buttons. The prior fix scope did not cover `size="sm"` icon-only buttons.

**Fix:** Add `aria-label={t("removeField")}` and add the i18n key to en.json and ko.json.

---

### AGG-3: Anti-cheat dashboard polling re-renders on every tick without data comparison — carried from AGG-PERF-1 (cycle 13) [MEDIUM/LOW]

**Flagged by:** perf-reviewer (PERF-1), critic (CRI-3)
**Signal strength:** 2 of 11 review perspectives

**File:** `src/components/contest/anti-cheat-dashboard.tsx:128-136`

**Description:** Carried from cycle 13. The polling callback always creates a new events array via `setEvents()`, causing unnecessary React re-renders every 30 seconds even when the server data is identical.

**Fix:** Add shallow comparison in the `setEvents` updater to skip updates when data is unchanged.

---

## Security Findings (from security-reviewer)

### SEC-1: Plaintext fallback in encryption module — carried from SEC-2 (cycle 11) [MEDIUM/HIGH]

**File:** `src/lib/security/encryption.ts:78-81`

**Fix:** Add integrity check or HMAC. Monitor plaintext fallback hits in production.

### SEC-2: `window.location.origin` for URL construction — carried from DEFER-24 [MEDIUM/MEDIUM]

**Files:** recruiting-invitations-panel.tsx:99, access-code-manager.tsx:134, file-management-client.tsx:96, workers-client.tsx:148

---

## Performance Findings (from perf-reviewer)

### PERF-1: Anti-cheat dashboard polling replaces all data on every tick — covered by AGG-3 above

### PERF-2: `recruiting-invitations-panel.tsx` fetches invitations and stats via `Promise.all` — stats latency blocks invitations rendering [LOW/LOW]

### PERF-3: `contest-join-client.tsx` 1-second setTimeout delay before navigation — carried from PERF-3 (cycle 14) [LOW/LOW]

---

## Architectural Findings (from architect)

### ARCH-1: Incomplete `apiFetchJson` adoption — covered by AGG-1 above [MEDIUM/MEDIUM]

### ARCH-2: `language-config-table.tsx` is 688 lines — should be decomposed — carried from ARCH-3 (cycle 14) [LOW/LOW]

---

## Test Coverage Gaps (from test-engineer)

### TE-1: No unit tests for `workers-client.tsx` — carried from TE-1 (cycle 14) [LOW/MEDIUM]

### TE-2: No unit tests for `chat-logs-client.tsx` — carried from TE-2 (cycle 14) [LOW/MEDIUM]

### TE-3: Encryption module still untested — carried from TE-3 (cycle 11) [MEDIUM/HIGH]

### TE-4: No unit tests for `apiFetchJson` helper — new [LOW/MEDIUM]

### TE-5: No unit tests for `recruiting-invitations-panel.tsx` — new [LOW/MEDIUM]

---

## Documentation Findings (from document-specialist)

### DOC-1: `apiFetchJson` JSDoc could document `signal` option for abort support [LOW/LOW]

### DOC-2: `encryption.ts` plaintext fallback lacks migration guidance — carried from DOC-2 (cycle 14) [LOW/LOW]

---

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
- DEFER-24: Invitation URL uses window.location.origin
- DEFER-25: Duplicate formatTimestamp utility
- DEFER-1 (cycle 1): Add unit tests for useVisibilityPolling, SubmissionListAutoRefresh, and stats endpoint
- DEFER-2 (cycle 1): Standardize error handling pattern in useVisibilityPolling
- DEFER-26: Unit tests for create-group-dialog.tsx and bulk-create-dialog.tsx
- DEFER-27: Unit tests for comment-section.tsx
- DEFER-28: Unit tests for participant-anti-cheat-timeline.tsx polling behavior
- DEFER-29: Add dedicated candidates summary endpoint for recruiter-candidates-panel
- DEFER-30: Remove unnecessary `router.refresh()` from discussion-vote-buttons
- ARCH-1: Centralized error-to-i18n mapping utility (refactor suggestion)
- DEFER-50: Encryption module unit tests (from TE-3)
- DEFER-51: Unit tests for create-problem-form.tsx (from TE-4)
- DEFER-52: Unit tests for problem-export-button.tsx (from TE-5)
- DEFER-53: `contest-join-client.tsx` 1-second setTimeout delay (from PERF-3)

## Agent Failures

None. All 11 review perspectives completed successfully.
