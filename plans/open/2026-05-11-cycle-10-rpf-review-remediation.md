# Cycle 10 Review Remediation Plan

**Date:** 2026-05-11
**Source:** `.context/reviews/_aggregate.md` (cycle 10)
**New findings:** 1 (LOW)
**Status:** In Progress

---

## Task 1: Fix CountdownTimer mount cleanup to abort visibilitychange-triggered sync [C10-AGG-1]

**Priority:** LOW
**Confidence:** High
**File:** `src/components/exam/countdown-timer.tsx:112-118, 210-216`

**What to do:**
Add `syncCleanupRef.current?.()` calls in both cleanup functions to abort any in-flight sync initiated by the visibilitychange handler before the component unmounts.

**Current code (mount effect, lines 112-118):**
```tsx
useEffect(() => {
  const cleanup = syncTime();
  return () => {
    cleanup();
    syncCleanupRef.current = null;
  };
}, [syncTime]);
```

**Fix:**
```tsx
useEffect(() => {
  const cleanup = syncTime();
  return () => {
    cleanup();
    syncCleanupRef.current?.();
    syncCleanupRef.current = null;
  };
}, [syncTime]);
```

**Current code (timer effect cleanup, lines 210-216):**
```tsx
return () => {
  cancelled = true;
  if (timerId !== null) clearTimeout(timerId);
  staggeredTimerIdsRef.current.forEach((id) => clearTimeout(id));
  staggeredTimerIdsRef.current = [];
  document.removeEventListener("visibilitychange", handleVisibilityChange);
};
```

**Fix:**
```tsx
return () => {
  cancelled = true;
  if (timerId !== null) clearTimeout(timerId);
  staggeredTimerIdsRef.current.forEach((id) => clearTimeout(id));
  staggeredTimerIdsRef.current = [];
  syncCleanupRef.current?.();
  syncCleanupRef.current = null;
  document.removeEventListener("visibilitychange", handleVisibilityChange);
};
```

**Verification:**
- `tsc --noEmit` passes
- Component tests pass
- `npm run test:unit` passes

**Status:** PENDING

---

## Deferred Items

All deferred items from previous cycles remain unchanged. See `_aggregate.md` for full registry.

---

## Progress Tracking

| Task | Status | Commit |
|------|--------|--------|
| Task 1: CountdownTimer cleanup leak | PENDING | — |

---

## Gate Status

- [ ] eslint
- [ ] next build
- [ ] vitest
