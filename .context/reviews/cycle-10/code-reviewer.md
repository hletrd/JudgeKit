# Code Reviewer — Cycle 10

**Date:** 2026-05-11
**HEAD reviewed:** `32554762`
**Change surface:** Cycle 9 fixes (SIGINT handler, JSON parse validation, countdown-timer AbortController leak) + plan archival commits.
**Files examined:** All files modified in cycle 9 fixes, plus a final sweep of `src/` for commonly missed patterns.

---

## Findings

### C10-CR-1: CountdownTimer mount cleanup does not abort visibilitychange-triggered sync (LOW)

**Confidence:** Medium
**File:** `src/components/exam/countdown-timer.tsx:112-118, 210-216`

**Description:** The mount effect (lines 112-118) calls `syncTime()` and stores its cleanup locally. On unmount, it calls that local cleanup but does not call `syncCleanupRef.current?.()` to abort any sync initiated by the visibilitychange handler. The second effect's cleanup (lines 210-216) removes the visibilitychange listener but also does not abort `syncCleanupRef.current`.

**Impact:** If the component unmounts while a visibilitychange-triggered `/api/v1/time` request is in flight, the fetch continues until completion or its 5-second timeout. React state updates on the unmounted component are ignored. Practical impact is minimal — a stale closure persists briefly until the fetch Promise settles.

**Fix:** In the mount effect cleanup, also call `syncCleanupRef.current?.()`. In the second effect cleanup, also call `syncCleanupRef.current?.()` before removing the listener.

```tsx
// In mount effect cleanup (line 114-117):
return () => {
  cleanup();
  syncCleanupRef.current?.();
  syncCleanupRef.current = null;
};

// In second effect cleanup (line 210-216):
return () => {
  cancelled = true;
  syncCleanupRef.current?.();
  syncCleanupRef.current = null;
  // ... rest of cleanup
};
```

---

### C10-CR-2: Verify cycle 9 JSON parse fixes are correctly applied (VERIFIED)

**Confidence:** High
**Files:**
- `src/app/(auth)/verify-email/page.tsx`
- `src/app/(auth)/forgot-password/forgot-password-form.tsx`
- `src/app/(auth)/reset-password/reset-password-form.tsx`
- `src/app/(public)/problems/create/create-problem-form.tsx`

**Description:** All four files now use the `parseOk` pattern:
1. Declare `let parseOk = false`
2. Set `parseOk = true` inside the `try` block after successful `res.json()`
3. Check `if (!res.ok || !parseOk)` before entering the success path

This correctly prevents false-positive success states when the server returns HTTP 200 with a non-JSON body (e.g., proxy/WAF misconfiguration).

**Verification:** `tsc --noEmit` passes. No type errors introduced by the pattern. The `data` variables are typed appropriately for their error-field access patterns.

---

### C10-CR-3: Verify cycle 9 SIGINT fix (VERIFIED)

**Confidence:** High
**File:** `src/lib/audit/node-shutdown.ts:45-51`

**Description:** The SIGINT handler no longer calls `processLike.exit?.(130)`. It now matches the SIGTERM handler pattern exactly, allowing Node.js to exit naturally. This prevents truncation of in-flight audit events and allows other registered cleanup handlers to run.

**Verification:** The three handlers (beforeExit, SIGTERM, SIGINT) are now structurally identical. No forced exit in any signal handler.

---

## Final Sweep

- Searched for `TODO`/`FIXME` comments: 2 remaining (both in `layout.tsx` workarounds for upstream Next.js bugs, documented and expected)
- Searched for unsafe type assertions (`as ` patterns): Several remain but all are defensive casts with runtime validation (e.g., `as { error?: string }` was removed in cycle 9, remaining casts are for `NodeJS.ErrnoException`, `BuiltinRoleName`, etc. with validation)
- Searched for `.catch(() => ...)` swallow patterns: All are documented best-effort patterns (audit flush, email providers, docker client)
- Checked for dangling imports/references to deleted components (`AppSidebar`, `ConditionalHeader`, etc.): None found
- Checked for unused variables/imports after recent deletions: None found

## Conclusion

Cycle 9 fixes are correctly implemented with no regressions. One minor cleanup leak in `countdown-timer.tsx` (C10-CR-1) was found during verification. No other code quality issues identified in the current change surface.
