# Cycle 3/3 — Perf Reviewer

**HEAD:** c6f92a37

## P3-01 — `(dashboard)/layout.tsx` calls `getTranslations("common")` 3× — LOW / MEDIUM
- **File:** `src/app/(dashboard)/layout.tsx:34-44`
- The outer `Promise.all` already binds `tCommon`. The two extra `(await getTranslations("common"))(...)` invocations inside `getResolvedSystemSettings({...})` are redundant.
- **Fix:** Reuse `tCommon` (after `Promise.all` resolves) by lifting `getResolvedSystemSettings` out of the `Promise.all` and feeding it `tCommon`.
- **Impact:** ~2× extra `getTranslations` lookups per dashboard request. Tiny, but trivial to fix.
- **Confidence:** MEDIUM. Defer if cycle full.

## P3-02 — Mobile menu open re-runs focus trap on every render — INFO
- `useEffect` in `public-header.tsx` keys on `[mobileOpen]` only. No new perf risk introduced this cycle. RECORD.

## P3-03 — Cap-aware top-nav alloc — LOW / HIGH
- `getPublicNavItems` creates a `new Set` on each invocation. Called once per layout render (server). No perf concern.
- **Confidence:** HIGH (no fix).

## P3-04 — Admin landing renders all icons eagerly — LOW / HIGH
- `ADMIN_NAV_GROUPS` references 13 lucide icons. All bundled in client/server bundle as JSX. Lucide icons tree-shake fine. No issue.

## Verdict
No new perf regressions from cycles 1+2. P3-01 is the only optional cleanup.
