# Performance Review — Cycle 20

**Date:** 2026-05-09
**Reviewer:** perf-reviewer
**Scope:** Full repository

---

## Findings

### C20-1: [LOW] useSourceDraft debounce effect runs on every draftState change

- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/hooks/use-source-draft.ts:293-305`

**Problem:**
The debounced persistence effect has `draftState` in its dependency array:

```typescript
useEffect(() => {
  if (!hasHydrated || !draftState.isReady) return;
  const timeoutId = window.setTimeout(() => {
    persistDraftState(getPersistedDraftState(draftState));
  }, SAVE_DEBOUNCE_MS);
  return () => window.clearTimeout(timeoutId);
}, [draftState, hasHydrated, persistDraftState]);
```

Because `draftState` is a new object on every keystroke (via `updateSnapshot`), this effect fires constantly. The timeout is cancelled and recreated on every keystroke. While the net effect is correct (debounced save), React schedules more effect runs than necessary.

**Fix:**
Use a ref to track the pending draft state and only persist when the timer fires:

```typescript
const pendingDraftRef = useRef<DraftState | null>(null);
// In the effect: store to ref, timer reads from ref
```

Alternatively, split the dependency to only watch the serializable parts that matter for persistence.

---

### C20-2: [LOW] useUnsavedChangesGuard creates new closures on every render

- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/hooks/use-unsaved-changes-guard.ts`

**Problem:**
`confirmNavigation` is recreated via `useCallback` on every render when `isDirty` changes (which is frequent during typing). This causes all downstream effects that depend on `confirmNavigation` to re-run, including the expensive history patching effect.

**Fix:**
Stabilize `confirmNavigation` by using refs for mutable state instead of dependencies:

```typescript
const isDirtyRef = useRef(isDirty);
isDirtyRef.current = isDirty;
```

Then read `isDirtyRef.current` inside `confirmNavigation` instead of including `isDirty` in the dependency array.

---

## Verified Performance

- Submission polling: SSE with fetch fallback, proper cleanup, exponential backoff.
- Auto-refresh: Visibility-aware with backoff, no duplicate timers.
- Auth cache: FIFO eviction with 500-entry cap and 10s TTL max.
- Rate limit eviction: Periodic (60s interval), not per-request.
- Audit buffer: Batched inserts with 50-event threshold.
- DB queries: Uses `count(*) over()` for pagination, avoiding separate count query.

## No Regressions

No new N+1 queries, no missing indexes, no inefficient re-renders detected.
