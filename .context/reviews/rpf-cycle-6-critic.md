# Critic — RPF Cycle 6

## Scope
Multi-perspective critique of the current codebase state, focusing on recently changed files.

## Findings

### CRIT-1: `recruiting-invitations-panel.tsx` — `handleCreate` missing catch block is a real bug
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer CR-2, security-reviewer SEC-1, architect ARCH-2
- **Problem:** All other async handlers in this component have try/catch. `handleCreate` is the only one with try/finally and no catch. This is not a style issue — it's a functional bug where network errors produce no user feedback and the error silently disappears.

### CRIT-2: `anti-cheat-dashboard.tsx` — Polling resets loaded events (perf-reviewer PERF-1 is correct and higher severity than stated)
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/components/contest/anti-cheat-dashboard.tsx:118-136`
- **Problem:** The 30-second visibility polling replaces the entire event list with only the first page. If the user has loaded more events, the expanded data disappears on every poll cycle. This is a UX regression — the instructor sees data disappear and reappear. The `offset` state is also reset, breaking the `loadMore` pagination.
- **Fix:** Either (a) only update total count on poll and keep events intact, or (b) preserve the loaded offset when polling, or (c) use a merge strategy that appends new events without resetting.

### CRIT-3: `recruiting-invitations-panel.tsx` — `createEmail` field is required but shouldn't be
- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/components/contest/recruiting-invitations-panel.tsx:484`
- **Problem:** The Create button is disabled when `!createEmail.trim()`. However, the API sends `candidateEmail: createEmail.trim() || undefined`, meaning the API treats email as optional. The UI incorrectly makes it required.
- **Fix:** Remove `!createEmail.trim()` from the disabled condition, keeping only `!createName.trim()`.

### CRIT-4: Carried from cycle 5 AGG-1 — PublicHeader dropdown role filtering
- **Status:** FIXED — capability-based filtering is now implemented in `public-nav.ts:79-86`
- **Evidence:** `getDropdownItems(capabilities)` filters items by capability. Items without a capability are always shown. This resolves the cycle 5 AGG-1 finding.

### CRIT-5: `parsePagination` silently caps at MAX_PAGE (carried from cycle 5 AGG-9)
- **Severity:** LOW
- **Confidence:** MEDIUM
- **Status:** NOT FIXED
