# Comprehensive code quality review — 2026-04-17 (current head, post-remediation pass)

## Scope
Reviewed current code quality with focus on:
- type safety
- lint/runtime correctness
- render stability and memoization correctness
- deployment/runtime contract drift that surfaced during verification

Primary files remediated:
- `src/app/(dashboard)/dashboard/groups/[id]/analytics/page.tsx`
- `src/app/(dashboard)/dashboard/admin/submissions/page.tsx`
- `src/components/layout/public-header.tsx`
- `src/hooks/use-source-draft.ts`
- `src/components/layout/app-sidebar.tsx`
- `src/components/layout/locale-switcher.tsx`
- several small dead-code/unused-import cleanup sites

## Executive summary
This pass fixed one hard typecheck failure, a cluster of lint/runtime stability regressions, and a few stale/dead code paths that were obscuring the real behavior of the app.

### Quality posture after this pass
- TypeScript: **clean**
- ESLint on `src/` + `tests/`: **clean**
- Targeted regression tests for touched behavior: **passing**

## Findings and dispositions

### FIXED — HIGH — Group analytics page passed a `Promise<string>` where a `string` time zone was required
**Evidence**
- `src/app/(dashboard)/dashboard/groups/[id]/analytics/page.tsx:20-38`

**Problem**
`getResolvedSystemTimeZone()` was used without `await`, causing the only live `tsc` failure in the tree.

**Fix**
Awaited the time-zone lookup and removed the unused `generateMetadata` parameter.

### FIXED — MEDIUM — Admin submissions page created a render-local component each render
**Evidence**
- `src/app/(dashboard)/dashboard/admin/submissions/page.tsx:151-214`

**Problem**
`SortableHeader` was declared as a component inside render scope, which tripped the static-components rule and risked unnecessary remount semantics.

**Fix**
Converted it to a JSX-returning helper (`renderSortableHeader`) instead of an inline component.

### FIXED — MEDIUM — Public header synchronously called `setState` inside an effect on route changes
**Evidence**
- `src/components/layout/public-header.tsx:34-60`

**Problem**
The mobile menu close-on-navigation logic directly called `setMobileOpen(false)` in an effect body, which React now flags as a cascading-render smell.

**Fix**
Tracked the previous pathname with a ref and deferred the close action with `requestAnimationFrame`, preserving behavior without the effect anti-pattern.

### FIXED — MEDIUM — `useSourceDraft` memoization warning conflicted with stable-language semantics
**Evidence**
- `src/hooks/use-source-draft.ts:219-237`
- `tests/unit/hooks/use-source-draft.test.ts`

**Problem**
The hook needed to preserve draft state when a caller recreated the `languages` prop with the same values, but the prior memoization shape triggered React/lint complaints.

**Fix**
Introduced a stable value-based language signature and derived a memoized `stableLanguages` array from it, preserving draft stability while keeping lint/typecheck clean.

### FIXED — LOW/MEDIUM — Small code hygiene regressions across UI/support files
**Evidence**
- `src/app/(auth)/login/login-form.tsx`
- `src/app/(dashboard)/dashboard/problems/page.tsx`
- `src/components/discussions/discussion-post-delete-button.tsx`
- `src/components/layout/locale-switcher.tsx`
- `src/lib/db/export-with-files.ts`
- `src/lib/security/password.ts`
- `src/components/layout/app-sidebar.tsx`

**Problem**
Unused bindings, dead props, and framework-specific lint complaints were adding noise and hiding real regressions.

**Fixes**
- Removed unused imports/bindings.
- Made `LocaleSwitcher` actually use its `className` prop.
- Marked intentionally unused values explicitly.
- Switched the sidebar site icon to `next/image` with a passthrough loader for arbitrary configured URLs.

## Verification
- `npx tsc --noEmit` ✅
- `npx eslint 'src/**/*.{ts,tsx}' 'tests/**/*.{ts,tsx}'` ✅
- `npx vitest run tests/unit/api/plugins.route.test.ts` ✅
- `npx vitest run tests/unit/hooks/use-source-draft.test.ts` ✅
- `npx vitest run tests/unit/infra/deploy-security.test.ts` ✅

## Broad-suite verification note
`npx vitest run` still reports unrelated failures outside this patch surface, including:
- stale role/capability assumptions about built-in-role counts
- source-grep/doc baseline drift tests
- queue/judging implementation contract tests targeting other files
- judge auth / judge-poll test-environment issues

These were recorded during review as **remaining repo-wide cleanup debt**, not introduced by this remediation set.

## Recommended next pass
1. Reconcile built-in-role contract tests with the now-present assistant role.
2. Clean up stale source-grep/doc baseline tests or convert them to behavior-based tests.
3. Repair judge auth / judge-poll test mocks so the full unit suite can become a trustworthy gate again.
