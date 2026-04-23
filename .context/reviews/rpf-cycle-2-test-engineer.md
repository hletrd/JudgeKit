# RPF Cycle 2 — Test Engineer

**Date:** 2026-04-22
**Base commit:** 14218f45

## Findings

### TE-1: No test coverage for `recruiting-invitations-panel.tsx` timezone-aware date `min` attribute [MEDIUM/MEDIUM]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:407`
**Description:** The custom expiry date input computes `min={new Date().toISOString().split("T")[0]}` which has a timezone bug (see CR-1, DBG-1). There is no test that validates the `min` attribute behavior across timezone offsets. This is a data-entry validation issue that could allow users to set past expiry dates (or block valid current dates) depending on their timezone.
**Fix:** Add a component test that validates the `min` attribute uses local time, not UTC. Mock `Date` to simulate different timezone scenarios.

### TE-2: No test for `workers-client.tsx` `AliasCell` error handling [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:91-101`
**Description:** The `AliasCell` component's `handleSave` function does not handle API errors (see DBG-2). There is no test for the save failure path.
**Fix:** Add a test that verifies behavior when the API returns an error status.

### TE-3: No test for `SubmissionListAutoRefresh` backoff behavior [LOW/LOW]

**File:** `src/components/submission-list-auto-refresh.tsx`
**Description:** There is no test for the auto-refresh component's behavior under server errors. Since the component currently has no error handling, this is a test-gap and implementation-gap issue.
**Fix:** First add error handling (see PERF-1), then add tests for backoff behavior.

## Verified Safe

- `access-code-manager.test.tsx` test name was fixed in cycle 1 to match actual behavior
- `compiler-client` keyboard shortcut tests exist and pass
- `use-source-draft.test.ts` covers localStorage edge cases
