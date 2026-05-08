# Cycle 2/3 — Verifier

**HEAD:** main / 2198a39b

## Baseline gate run
- `tsc --noEmit`: PASS (clean, exit 0).
- `eslint .`: PASS (clean, exit 0).
- vitest unit/component/security: per cycle-1 plan, 3 known pre-existing failures.

## Verification plan for cycle-2 implementation
After implementation cycle, the verifier will:
1. Re-run `tsc --noEmit` and `eslint .` — expect PASS.
2. Re-run `next build` — expect PASS (cycle-1 was PASS).
3. Re-run vitest unit suite — expect 0 NEW failures; the 2 stale tests should now PASS (T2-01 fixed in this cycle).
4. Re-run vitest component suite — expect PASS (after deleting dead component tests).
5. Re-run vitest security — expect 1 known failure (rate-limit, deferred).
6. Inspect `git grep "AppSidebar\|ConditionalHeader"` — expect ZERO matches in `src/`.
7. Inspect `git grep "ADMIN_GROUPS\|adminGroups\|QUICK_ADMIN_LINKS"` — expect single source of truth in `src/lib/navigation/admin-nav.ts`.

## Acceptance criteria
- All cycle-1 deferred B1, B2, B3, B4, B5 (sidebar/conditional-header/cap-aware top nav) addressed OR explicitly deferred with new exit criteria.
- A9 admin-nav single source SHIPPED.
- Pre-1 and Pre-2 unit tests PASS.
- No new gate failures.
- DEPLOY: end-only-deferred for this cycle (per orchestrator).
