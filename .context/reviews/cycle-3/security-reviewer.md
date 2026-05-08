# Cycle 3/3 — Security Reviewer

**HEAD:** main / c6f92a37
**Scope:** Adversarial sweep of cycles 1+2 commits since `a90a5643` for capability bypass, auth weakening, info leak, or attack-surface change.

---

## S3-01 — `getPublicNavItems` cap-aware additions are UI-only — PASS / HIGH
- **File:** `src/lib/navigation/public-nav.ts:46-76`
- Showing `/groups` and `/problem-sets` in the top nav based on `groups.view_all`, `groups.create`, `problem_sets.view`, `problem_sets.create` is purely presentation. Each route still enforces caps server-side. No bypass.
- **Confidence:** HIGH.

## S3-02 — `(dashboard)/layout.tsx` capability resolution — PASS / HIGH
- **File:** `src/app/(dashboard)/layout.tsx:32-46`
- Layout redirects unauth users to `/login`; resolves caps before rendering header. Caps are passed to `loggedInUser.capabilities` and `getPublicNavItems`. No information leak — caps already known to the user.
- **Confidence:** HIGH.

## S3-03 — `dashboard/admin/page.tsx` redirects on empty visible groups — PASS / HIGH
- **File:** `src/app/(dashboard)/dashboard/admin/page.tsx:29-31`
- A user landing on `/dashboard/admin` with zero matching capabilities is redirected to `/dashboard`. Each individual `/dashboard/admin/*` route enforces caps server-side; this landing redirect is defense in depth, not the primary control.
- **Confidence:** HIGH.

## S3-04 — `PlatformModeBadge` info disclosure — PASS / HIGH
- **File:** `src/components/layout/platform-mode-badge.tsx:19-29`
- Surfaces `effectivePlatformMode` (homework/exam/contest/recruiting) to authenticated users in the dashboard chrome. The platform mode is already discoverable from `/dashboard/admin/settings` for admins and influences user-visible behaviour everywhere; surfacing the label is not a leak.
- **Confidence:** HIGH.

## S3-05 — Capability key spelling — PASS / HIGH
- Cap keys used in `admin-nav.ts` (`users.view`, `users.manage_roles`, `submissions.view_all`, `system.audit_logs`, `system.login_logs`, `system.chat_logs`, `community.moderate`, `system.settings`, `files.manage`, `system.plugins`) are matched in `src/lib/capabilities/cache.ts` definitions. No "always-true" misspelling that would inadvertently grant access via cap-card render bypass (and per S3-03 the page redirects, not renders, when no caps match).
- **Confidence:** HIGH.

## S3-06 — `getActiveTimedAssignmentsForSidebar` helper alive in lib but orphaned in UI — INFO
- No security implication — read-only helper that scopes by user id. No AuthZ change.
- **Confidence:** HIGH.

## S3-07 — `recruit/[token]/results/page.tsx` token-gated route — PASS / HIGH
- The page reads recruit-token-scoped data and renders results. No code change in cycles 1+2 affected the auth boundary; cycle-3 recommended Korean-spacing fix is presentational only.
- **Confidence:** HIGH.

## S3-08 — `/api/*` routes — out of cycle scope, no IA-related changes — PASS
- `git diff a90a5643..HEAD -- src/app/api/` is empty (verified by diff stats). No new attack surface from cycles 1+2.
- **Confidence:** HIGH.

## S3-09 — `sign-out.ts` client-side storage clearance — PASS / HIGH
- Cleared keys are app-scoped sessionStorage entries; no token leak. Comment references deleted `AppSidebar` (see C3-01) but no security drift.
- **Confidence:** HIGH.

---

## VERDICT

No new security issues introduced by cycles 1+2. The IA cleanup was tightening (removed dead chrome, did not weaken auth). Final cycle has zero security action items.

## Quality gates impact
- vitest security suite: not affected by cycle-3 recommended changes.
- Pre-existing rate-limit.test.ts flakiness remains deferred per cycle-1.
