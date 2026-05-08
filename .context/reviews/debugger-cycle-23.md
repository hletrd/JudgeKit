# Debugger — Cycle 23

**Date:** 2026-04-24
**Scope:** Latent bugs, failure modes, regressions

---

## D-1: [MEDIUM] SSE cleanup timer `removeConnection` mutation during Map iteration

**Confidence:** MEDIUM
**Citations:** `src/app/api/v1/submissions/[id]/events/route.ts:106-109`

The cleanup timer iterates `connectionInfoMap` with `for...of` and calls `removeConnection(connId)` inside the loop body (line 108). `removeConnection` mutates `connectionInfoMap` by calling `connectionInfoMap.delete(connId)` (line 63). In JavaScript, modifying a Map during `for...of` iteration is safe per the spec (Map iterators are not invalidated by deletions of already-visited keys), but deleting keys that have not yet been visited can cause the iterator to skip entries. This means some stale entries might be skipped during a single cleanup pass.

**Concrete failure scenario:** During cleanup, the iterator visits key A (stale, deleted), then key B (stale), then key C (stale). After deleting A, the iterator's internal position shifts and B is skipped. B remains in the map until the next cleanup interval.

**Fix:** Collect keys to delete first, then delete in a separate pass.

---

## D-2: [LOW] `getConfiguredSettings()` stale cache during background refresh race

**Confidence:** LOW
**Citations:** `src/lib/system-settings-config.ts:158-181`

If `invalidateSettingsCache()` is called and then `getConfiguredSettings()` is called immediately, the first call triggers an async reload (`_refreshing = true`). Subsequent calls before the reload completes will return the old cached value (preserved by the cycle 20 fix). However, the old value's `cachedAt` is now 0, so each subsequent call re-enters the reload path but exits immediately because `_refreshing` is true. This is correct behavior but worth noting — the old cached value is always returned during the refresh window.

**Fix:** No bug here — behavior is correct. Documenting for clarity.

---

## Summary

- Total findings: 2
- MEDIUM: 1 (D-1)
- LOW: 1 (D-2 — informational only)
