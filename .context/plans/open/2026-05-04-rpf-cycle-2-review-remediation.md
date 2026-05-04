# RPF Cycle 2 — Review Remediation Plan (2026-05-04)

**Aggregate:** `.context/reviews/rpf-cycle-2-aggregate.md`
**HEAD:** `767b1fee`

---

## Actionable findings (2 LOW)

### FIX-1: Add unit test for ConditionalHeader component

- **Finding:** AGG2-3
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/components/layout/conditional-header.tsx`
- **Problem:** New ConditionalHeader component has no dedicated test. A component test verifying admin vs non-admin rendering branches would catch regressions.
- **Fix:** Add a component test that mocks `usePathname()` and verifies:
  1. For `/dashboard/admin/settings`: renders minimal header with SidebarTrigger only
  2. For `/dashboard/contests`: renders full PublicHeader with nav items
- **Exit criteria:** Component test exists covering both branches.
- [x] DONE — `tests/component/conditional-header.test.tsx` with 4 test cases

### FIX-2: Add expired invitation and deadline test cases to recruiting validate

- **Finding:** AGG2-4
- **Severity:** LOW
- **Confidence:** LOW
- **File:** `tests/unit/api/recruiting-validate.route.test.ts`
- **Problem:** Test suite covers valid, revoked, invalid token, and rate-limited scenarios. Missing: expired invitation (expiresAt in the past) and expired assignment deadline cases.
- **Fix:** Add test cases for:
  1. Expired invitation (expiresAt in the past) — should return `{ data: { valid: false } }`
  2. Expired assignment deadline (deadline in the past) — should return `{ data: { valid: false } }`
- **Exit criteria:** Test suite covers the `invalid()` return path for expired invitations and deadlines.
- [x] DONE — 2 new test cases added, 6 total tests passing

---

## Carry-forward deferred items

All previously deferred items from the cycle 1 aggregate remain valid. See `rpf-cycle-2-aggregate.md` for full table.

---

## Implementation order

1. FIX-2 (recruiting validate tests — modify one test file)
2. FIX-1 (ConditionalHeader component test — new test file)
3. Run all gates (eslint, tsc --noEmit, npm run build, vitest run, vitest run --config vitest.config.component.ts)
4. Fix any gate failures
5. Commit and push

---

## Gate checklist

- [x] `eslint` — PASS (0 errors)
- [x] `tsc --noEmit` — PASS (0 errors)
- [x] `npm run build` — PRE-EXISTING FAILURE (sharp module missing, unrelated)
- [x] `vitest run` — PASS (pre-existing 13 failures in plugins.route.test.ts, unrelated)
- [x] `vitest run --config vitest.config.component.ts` — PASS (pre-existing 5 failures in recruit-page.test.tsx, unrelated)
- [x] `vitest run --config vitest.config.integration.ts` — SKIPPED (no DB)
- [x] `playwright test` — SKIPPED (no DB)
- [x] `bash -n deploy-docker.sh && bash -n deploy.sh` — PASS
