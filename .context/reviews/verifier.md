# Verifier Review — Cycle 12/100

**Reviewer:** verifier (orchestrator direct)
**Date:** 2026-05-08
**HEAD:** e584aeac
**Scope:** Evidence-based correctness check against stated behavior

---

## NEW FINDINGS

### C12-VR-1 — Verified: deregister route lacks JSON parse guard
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/app/api/v1/judge/deregister/route.ts:24`
- **Verification:** Read the source. Line 24 reads: `const parsed = deregisterSchema.safeParse(await request.json());`. The outer try/catch at line 19 catches any thrown SyntaxError and returns 500 at line 102. Compare with the fixed register route at `src/app/api/v1/judge/register/route.ts:34-38` which wraps `request.json()` in try/catch and returns 400. The deregister route does NOT have this wrapper.
- **Conclusion:** Confirmed bug. Malformed JSON request body returns 500 instead of 400.

### C12-VR-2 — Verified: CountdownTimer does not reset expired state on deadline change
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/components/exam/countdown-timer.tsx`
- **Verification:**
  1. Line 46-48: `const [expired, setExpired] = useState(() => deadline - Date.now() <= 0);` — initialized once, no reset logic.
  2. Line 49: `const firedThresholds = useRef<Set<number>>(prePopulateThresholds(deadline - Date.now()));` — initialized once, no reset logic.
  3. Line 62-64: `useEffect(() => { expiredRef.current = expired; }, [expired]);` — syncs ref with state, but does not reset when deadline changes.
  4. Line 95-183: Main effect depends on `[deadline, handleExpired, t]`. On re-run, `cancelled = true` is set in cleanup, but no state or ref is reset.
  5. Line 192: `{expired ? "00:00:00" : formatDuration(remaining)}` — if `expired` is true, display is frozen at "00:00:00".
- **Conclusion:** Confirmed bug. Changing `deadline` prop to a future time does not reset the expired state.

### C12-VR-3 — Verified: CountdownTimer staggered setTimeout not tracked
- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/components/exam/countdown-timer.tsx:126`
- **Verification:** Lines 108-133 show the staggered toast logic. The `setTimeout` at line 126 stores its return value nowhere. The cleanup function at lines 178-182 only clears `timerId` (the main 1s tick timer) and sets `cancelled = true`. No staggered timer IDs are collected or cleared.
- **Conclusion:** Confirmed minor issue. Timers accumulate but are guarded by `cancelled`.

---

## No Other Verified Issues
