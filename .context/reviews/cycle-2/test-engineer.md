# Cycle 2/3 — Test Engineer

**HEAD:** main / 2198a39b

## T2-01 — Two unit tests assert removed contract (BLOCKER) — HIGH / HIGH
- `tests/unit/custom-role-pages-implementation.test.ts` — asserts `(dashboard)/layout.tsx` invokes `capsSet.has("assignments.view_status")` and that `public-nav.ts` declares `capability: "problem_sets.create"` with `label: "problems"`. Both removed in cycle 1.
- `tests/unit/platform-mode-ui-implementation.test.ts` — asserts `(dashboard)/layout.tsx` passes `platformMode={effectivePlatformMode}` to a sidebar that is no longer in that layout.
- **Action:** Rewrite both tests against the post-cycle-1 contract. Pair with the cycle-2 implementation that introduces (a) cap-aware top nav and (b) platform-mode badge in PublicHeader trailingSlot.

## T2-02 — `tests/component/conditional-header.test.tsx` and `tests/component/app-sidebar.test.tsx` test dead code — MEDIUM / HIGH
- If cycle 2 deletes the components, delete these tests.
- If cycle 2 re-mounts AppSidebar, keep `app-sidebar.test.tsx`; update its assertions to the new mount context.

## T2-03 — Pre-existing `tests/unit/security/rate-limit.test.ts` failure — MEDIUM / HIGH
- Out of menu-IA scope; defer per cycle-1 plan.

## T2-04 — Add new test for admin nav single source of truth — MEDIUM / MEDIUM
- New file: `tests/unit/admin-nav-single-source.test.ts`.
- Assert: `lib/navigation/admin-nav.ts` exports an `ADMIN_NAV_GROUPS` array; assert the admin landing page imports from it; assert `admin-dashboard.tsx` quick links are a subset (by `href`) of the same source.
- Catches future drift.

## T2-05 — Add component test for cap-aware top nav — MEDIUM / MEDIUM
- New file: `tests/component/public-nav-capabilities.test.tsx`.
- Assert: `getPublicNavItems(t, ["groups.view_all"])` includes `/groups`; `getPublicNavItems(t, [])` does not.

## Coverage gates
- vitest unit pre-existing failures: 2 to fix this cycle (T2-01), 1 deferred (T2-03).
- vitest component: clean baseline; will need updates after deletions.
- vitest security: clean apart from T2-03.

## Verdict
Cycle 2 is the right time to converge tests on the post-migration contract. The two stale unit tests are blockers under the orchestrator's "warnings best-effort, errors blocking" policy.
