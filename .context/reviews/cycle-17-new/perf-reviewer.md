# Cycle 17 Performance Review

**Date:** 2026-05-08
**Base commit:** 919c8ba3
**Reviewer angle:** Performance, CPU/memory, UI responsiveness

## Scope
- React rendering patterns
- Database query patterns
- API route efficiency
- Bundle size considerations

## Findings

### C17-PERF-1 — [LOW] `locale-switcher.tsx` skeleton size is hardcoded and may cause CLS

- **Severity:** LOW (CLS/visual stability)
- **Confidence:** MEDIUM
- **Files:** `src/components/layout/locale-switcher.tsx:30`
- **Evidence:** The skeleton placeholder uses fixed dimensions `h-11 w-11` (or `lg:h-9 lg:w-9`). If the actual button renders at a different size due to CSS overrides or theme changes, the hydration swap could cause a layout shift.
- **Failure scenario:** Theme CSS overrides button sizing. Skeleton (44x44px) swaps to actual button (36x36px), causing a small layout shift in the header.
- **Suggested fix:** Use `size-11 lg:size-9` class on the skeleton to match the actual button dimensions exactly.

## Verified Optimized

- `Promise.all` used for parallel DB queries where applicable
- Proper memoization (`useMemo`, `useCallback`, `React.memo`) used throughout
- SSE polling uses shared timer to avoid N concurrent timers
- No N+1 query patterns found in API routes reviewed

## Final Sweep

- Checked for missing React.memo on heavy components — patterns are consistent
- Checked for unnecessary re-renders — no obvious issues found
- No relevant files were skipped.
