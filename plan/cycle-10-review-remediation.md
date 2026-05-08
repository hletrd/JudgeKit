# Cycle 10 Review Remediation Plan

**Cycle:** 10/100
**Date:** 2026-05-08
**HEAD:** 2a6db3dd
**Source:** `.context/reviews/_aggregate.md`

## Implementation Queue

### Task A — Judge routes guard JSON parse errors [MEDIUM]
**Finding:** C10-CR-1
**Files:**
- `src/app/api/v1/judge/register/route.ts:34`
- `src/app/api/v1/judge/claim/route.ts:65`
- `src/app/api/v1/judge/heartbeat/route.ts:30`
- `src/app/api/v1/judge/poll/route.ts:32`
**Issue:** `await request.json()` throws `SyntaxError` on malformed JSON. Caught by outer `try/catch` → returns 500 instead of 400.
**Fix:** Wrap `request.json()` in try/catch before `safeParse`, returning 400 on parse failure.
**Estimated:** 4 files, ~8 lines each
**Status:** DONE

### Task B — apiFetchJson distinguishes success-path parse failures [MEDIUM]
**Finding:** C10-CR-2
**File:** `src/lib/api/client.ts:126-132`
**Issue:** When `res.ok` is true but `res.json()` throws (non-JSON body), caller receives `{ok: true, data: fallback}` and proceeds with default data.
**Fix:** Only apply `.catch(() => fallback)` when `res.ok` is false. For `res.ok === true`, JSON parse failure should return `{ok: false, data: fallback}`.
**Estimated:** ~10 lines
**Status:** DONE

### Task C — contest-join-client shake timer cleanup [LOW]
**Finding:** C10-CR-3
**File:** `src/app/(public)/contests/join/contest-join-client.tsx:68`
**Issue:** `setTimeout(() => setShaking(false), 600)` in catch block is not stored in ref and not cleared on unmount.
**Fix:** Use `useRef` for the timer ID and clear in `useEffect` cleanup.
**Estimated:** ~8 lines
**Status:** DONE

## Deferred Items

All LOW-severity index-based React key findings from prior cycles remain deferred. See archived `cycle-8-deferred.md` for full list and exit criteria.

## Gate Results

To be recorded after implementation.
