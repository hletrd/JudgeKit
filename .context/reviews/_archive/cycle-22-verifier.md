# Verifier — Cycle 22 (Fresh)

**Date:** 2026-04-20
**Base commit:** e80d2746

## Findings

### V-1: Chat widget admin-config.tsx and chat-widget.tsx bypass centralized apiFetch [MEDIUM/HIGH]

**Files:** `src/lib/plugins/chat-widget/admin-config.tsx:89-92`, `src/lib/plugins/chat-widget/chat-widget.tsx:154`
**Description:** Verified that these two files use raw `fetch()` with manually set `X-Requested-With: XMLHttpRequest` instead of `apiFetch`. The cycle-21 H1 fix explicitly targeted "admin components" but the chat widget plugin is in `src/lib/plugins/`, not in `src/app/(dashboard)/dashboard/admin/`. This is a confirmed gap in the migration.
**Evidence:** Grep for `X-Requested-With` in `src/` shows only `apiFetch` (correct), `csrf.ts` (docs), and these two chat widget files (incorrect).
**Fix:** Replace with `apiFetch()`.
**Confidence:** HIGH

### V-2: Cycle-21 M4 (ConfirmAction discriminated union) marked PENDING but appears DONE in code [INFO/HIGH]

**File:** `plans/open/2026-04-20-rpf-cycle-21-review-remediation.md:124`
**Description:** The plan shows M4 status as PENDING, but commit `c89d7432` ("fix(admin): harden language config table with apiFetch, error handling, accessibility (H1/H2/M1/M4)") explicitly includes M4 in the commit message. The code change is present in `language-config-table.tsx`.
**Fix:** Update M4 status to DONE in the plan.
**Confidence:** HIGH

## Verified Safe

- All `getDbNowUncached()` usages confirmed in API routes for temporal consistency.
- `formatScore` confirmed to use `formatNumber` internally.
- Korean letter-spacing conditional classes are present and correct in all inspected components.
- AppSidebar no longer has dead code from submissions removal (verified clean).
- Navigation items are centralized in `public-nav.ts` and consistently used by both layouts.
