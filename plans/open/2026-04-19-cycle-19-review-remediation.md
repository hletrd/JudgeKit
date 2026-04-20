# Cycle 19 Review Remediation Plan

**Date:** 2026-04-19
**Source:** `.context/reviews/_aggregate.md` (cycle 19 multi-agent review), code-reviewer, security-reviewer, perf-reviewer, architect, test-engineer, debugger, critic, verifier, designer
**Status:** COMPLETE

---

## MEDIUM Priority

### M1: Add `AsyncLocalStorage`-based request cache for `getRecruitingAccessContext` — fix N+1 in API routes

- **From:** AGG-1 (code-reviewer F1, perf-reviewer F1, architect F1, critic F1, verifier F1)
- **Files:** `src/lib/recruiting/access.ts`, `src/lib/recruiting/request-cache.ts`
- **Status:** DONE (commit a5628451)
- **Plan:**
  1. Create a new module `src/lib/recruiting/request-cache.ts` that uses `AsyncLocalStorage` to store the `RecruitingAccessContext` for the current request
  2. In `getRecruitingAccessContext`: check `AsyncLocalStorage` first; if cached, return it; otherwise, compute, store, and return
  3. The `AsyncLocalStorage` store is initialized by Next.js middleware or a per-request wrapper
  4. Keep the React `cache()` wrapper for RSC renders (it's still useful there) but add the `AsyncLocalStorage` fallback for API routes
  5. Add a JSDoc comment documenting the dual caching strategy and its scope
  6. Verify that permission checks from API routes now hit the `AsyncLocalStorage` cache
- **Exit criterion:** `getRecruitingAccessContext` returns cached results in both RSC and API route contexts within a single request. No redundant DB queries for the same user's recruiting context within a request.

---

## LOW Priority

### L1: Add `needsRehash` handling to admin import and restore routes

- **From:** AGG-2 (code-reviewer F3, security-reviewer F1, architect F2, debugger F1, critic F2, verifier F2)
- **Files:** `src/app/api/v1/admin/migrate/import/route.ts`, `src/app/api/v1/admin/restore/route.ts`
- **Status:** DONE (commit bdee3c23)
- **Plan:**
  1. In `import/route.ts` form-data path: change `const { valid }` to `const { valid, needsRehash }`
  2. After the `if (!valid)` check, add the same rehash logic as in backup route
  3. In `import/route.ts` JSON path: same change
  4. In `restore/route.ts`: change `const { valid }` to `const { valid, needsRehash }`
  5. After the `if (!valid)` check, add the same rehash logic
  6. Verify all four admin data-management routes now handle `needsRehash` consistently
- **Exit criterion:** All four admin data-management routes (backup, restore, export, import) rehash bcrypt passwords to argon2id on successful verification.

### L2: Add warning log when `isTrustedServerActionOrigin` bypasses origin check in development

- **From:** AGG-4 (security-reviewer F3)
- **Files:** `src/lib/security/server-actions.ts`
- **Status:** DONE (commit 267fbafd)
- **Plan:**
  1. In both locations where `process.env.NODE_ENV !== "production"` is returned, add `logger.warn` noting that origin check is bypassed in development mode
  2. Include the actual origin value (or "missing") in the log context
  3. This alerts operators who accidentally run staging with `NODE_ENV=development`
- **Exit criterion:** `isTrustedServerActionOrigin` logs a warning when bypassing origin check in development mode.

### L3: Add unit tests for import-transfer and request-cache

- **From:** AGG-5 (test-engineer F1, F2, F3)
- **Files:** `tests/unit/db/import-transfer.test.ts`, `tests/unit/recruiting/request-cache.test.ts`
- **Status:** DONE (commit 3a006175)
- **Plan:**
  1. `withUpdatedAt()` tests already existed at `tests/unit/db/helpers.test.ts` (4 tests)
  2. Added `readUploadedJsonFileWithLimit` tests (9 tests): valid JSON, size limits, invalid JSON, multi-byte content, empty objects, arrays, floating point, custom limit
  3. Added `request-cache` tests (5 tests): cache isolation, userId matching, context overwrite, per-request scope, no-store fallback
- **Exit criterion:** import-transfer has 9+ unit tests. request-cache has 5+ unit tests.

### L4: Move breadcrumb to sticky header — Phase 3 workspace-to-public migration

- **From:** AGG-6 (architect F3, designer F3), workspace-to-public migration plan Phase 3
- **Files:** `src/app/(dashboard)/layout.tsx`, `src/components/layout/breadcrumb.tsx`
- **Status:** DONE (commit a06bd712)
- **Plan:**
  1. Move `<Breadcrumb>` from inside `<main>` to a sticky header in `SidebarInset`
  2. Remove default `mb-4` margin from Breadcrumb component
  3. Sticky header with backdrop blur keeps breadcrumb visible while scrolling
  4. Verify type check and lint pass
- **Exit criterion:** Breadcrumb is visible at the top of the content area and remains visible while scrolling.

### L5: Fix mobile menu focus restoration on route-change close

- **From:** AGG-7 (designer F1)
- **Files:** `src/components/layout/public-header.tsx`
- **Status:** DONE (commit 74560445)
- **Plan:**
  1. In the route-change effect, after `setMobileOpen(false)`, add `toggleRef.current?.focus()`
  2. Matches the pattern already used in `closeMobileMenu`
- **Exit criterion:** After closing the mobile menu via route change, focus is restored to the hamburger toggle button.

### L6: Replace `any` type in `users/route.ts` with proper type

- **From:** AGG-9 (code-reviewer F5)
- **Files:** `src/app/api/v1/users/route.ts`
- **Status:** DONE (commit 401dd117)
- **Plan:**
  1. Remove `eslint-disable-next-line @typescript-eslint/no-explicit-any`
  2. Replace `let created: any` with `SafeUserRow` type that matches `safeUserSelect` return shape
- **Exit criterion:** No `eslint-disable` for `no-explicit-any` in `users/route.ts`. The `created` variable has a proper type.

---

## Workspace-to-Public Migration Progress

- Phase 1: COMPLETE
- Phase 2: COMPLETE
- Phase 3: IN PROGRESS (this cycle: L4 — breadcrumb moved to sticky header; remaining: evaluate control route merge)
- Phase 4: PENDING (deferred — route consolidation)

---

## Deferred Items

| Finding | Severity | Reason | Exit Criterion |
|---------|----------|--------|----------------|
| AGG-3 (`updateRecruitingInvitation` uses `Record<string, unknown>`) | LOW | Same as AGG-5(c18-prev) — JS `new Date()` clock skew concern is the primary issue; type safety improvement is low priority since the function is only called from one API route | Next time `recruiting-invitations.ts` is significantly modified |
| AGG-8 (`canAccessProblem` per-item checks not batched) | LOW | The batched `getAccessibleProblemIds` already exists; individual checks work correctly; performance impact is noticeable only for large lists (>50 items) | Re-open if list endpoints report performance issues under load |
