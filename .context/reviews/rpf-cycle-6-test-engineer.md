# Test Engineer — RPF Cycle 6

## Scope
Test coverage review focusing on recently changed files and carry-forward gaps.

## Findings

### TE-1: No tests for `recruiting-invitations-panel.tsx` error handling
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/components/contest/recruiting-invitations-panel.tsx`
- **Problem:** The `handleRevoke`, `handleDelete`, and `handleCreate` functions have error handling paths that are untested. Specifically:
  - `handleCreate` network error (no catch block — this is also a code bug, CR-2)
  - `handleRevoke` API error response
  - `handleDelete` API error response
  - `handleResetAccountPassword` success/error paths
- **Fix:** Add component tests covering error scenarios for all four handlers.

### TE-2: No tests for `score-timeline-chart.tsx`
- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/components/contest/score-timeline-chart.tsx`
- **Problem:** This component renders an SVG chart with participant selection. No unit tests exist for: selecting a different participant, handling empty progressions, or SVG coordinate calculation.
- **Fix:** Add basic component tests for participant switching and empty data state.

### TE-3: No tests for `filter-form.tsx` Select component integration
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/filter-form.tsx`
- **Problem:** The recently refactored Select component usage in filter-form.tsx has no tests. The hidden input synchronization (status value) is a subtle behavior worth testing.
- **Fix:** Add a test that changes the select and verifies the hidden input updates.

### TE-4: Carried from cycle 5 AGG-7 — No tests for group assignment export route, PublicHeader dropdown, leaderboard live rank
- **Status:** NOT FIXED
- **Severity:** MEDIUM

### TE-5: Carried deferred items — DEFER-7 through DEFER-12 (unit test gaps)
- **Status:** NOT FIXED
- **Severity:** MEDIUM/LOW (various)
