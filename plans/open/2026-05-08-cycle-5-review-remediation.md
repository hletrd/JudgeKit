# Cycle 5 Review Remediation Plan

**Date:** 2026-05-08
**Review source:** `.context/reviews/_aggregate.md` (cycle 5/100)
**HEAD:** main / 75d82a17
**Goal:** Fix all 6 findings from production browser review and code analysis.

---

## Items to implement this cycle

### 1. C5-1 — Fix audit-logs SQL error for instructors with no owned groups
- **File:** `src/app/api/v1/admin/audit-logs/route.ts` (lines 146-147)
- **Task:** `sql\`0\`` is an object and always truthy in JS. Change to `null` and only push when non-null.
- **Status:** PENDING

### 2. C5-2 — Fix 4 broken component tests
- **Files:**
  - `tests/component/locale-switcher.test.tsx` — update to expect `window.location.reload()` instead of `forceNavigate()`
  - `tests/component/not-found-page.test.tsx` — fix guest actions expectation from "Dashboard" to "Sign in"
  - `tests/component/home-page.test.tsx` — fix guest actions expectation from "Dashboard" to "Sign in"
  - `tests/component/chat-widget.test.tsx` — investigate and fix scroll behavior expectation
- **Status:** PENDING

### 3. C5-3 — Remove production credential file and add to gitignore
- **File:** `algo-admin-prod.json` (untracked, repo root)
- **Task:** Delete file and add pattern to `.gitignore`
- **Status:** PENDING

### 4. C5-4 — Fix eslint warning (unused `tShell`)
- **File:** `src/app/(public)/practice/problems/[id]/page.tsx` (line 47)
- **Task:** Remove unused `tShell` from destructuring
- **Status:** PENDING

### 5. C5-5 — Update stale comment in data-retention maintenance
- **File:** `src/lib/data-retention-maintenance.ts` (line 16)
- **Task:** Change "uses `ctid`" to "uses primary key"
- **Status:** PENDING

### 6. C5-6 — Remove storedName from files API GET response
- **File:** `src/app/api/v1/files/route.ts` (line 165)
- **Task:** Remove `storedName` from SELECT columns
- **Status:** PENDING

---

## Deferred

None — all 6 findings are actionable this cycle.

---

## Gate requirements

- `npx eslint .` — must pass 0 errors, 0 warnings
- `npx tsc --noEmit` — must pass
- `npx next build` — must pass
- `npx vitest run` — must pass (2337 tests)
- `npx vitest run --config vitest.config.component.ts` — must pass (all component tests)
