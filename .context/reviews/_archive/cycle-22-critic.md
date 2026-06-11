# Critic — Cycle 22 (Fresh)

**Date:** 2026-04-20
**Base commit:** e80d2746

## Findings

### CRI-1: Chat widget plugin was missed by the apiFetch migration -- incomplete audit [MEDIUM/MEDIUM]

**Files:** `src/lib/plugins/chat-widget/admin-config.tsx:89-92`, `src/lib/plugins/chat-widget/chat-widget.tsx:154`
**Description:** The cycle-21 H1 fix migrated 11 raw `fetch()` calls in admin components to `apiFetch`, but the audit missed the chat widget plugin which has 2 more. This suggests the original audit was scoped to `src/app/(dashboard)/dashboard/admin/` and did not include `src/lib/plugins/`. Plugin code runs with the same CSRF requirements as admin code and should have been included.
**Fix:** Replace with `apiFetch()`. Also verify no other `fetch()` calls with manual `X-Requested-With` headers exist outside the admin directory.
**Confidence:** HIGH

### CRI-2: Deferred item pile-up -- 9 deferred items with no clear trigger for action [LOW/MEDIUM]

**File:** `plans/open/2026-04-20-rpf-cycle-21-review-remediation.md` (DEFER-1 through DEFER-9)
**Description:** The cycle-21 plan has 9 deferred items, most carried forward from cycles 18-20. The exit criteria for these items are vague (e.g., "problem count exceeds 5,000", "users report difficulty tapping"). Without concrete timelines or metrics tracking, these items may remain deferred indefinitely.
**Fix:** Consider adding a maximum deferral age (e.g., 10 cycles). If a deferred item is older than the threshold, it should be either implemented or explicitly accepted as permanent.
**Confidence:** MEDIUM

## Verified Safe

- Korean letter-spacing is consistently handled with locale-conditional tracking classes.
- All formatting utilities are centralized and use locale-aware formatting.
- Navigation structure is well-organized with shared config modules.
- Test coverage exists for key formatting utilities (`formatNumber`, `formatBytes`, `formatScore`).
