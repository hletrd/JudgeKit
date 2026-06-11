# RPF Loop Cycle 1 — Debugger Review (2026-05-03)

**HEAD reviewed:** `37a4a8c3` (main)
**Reviewer:** debugger

## Summary
Latent bug surface focuses on user-visible scoring math, the use-source-draft hook regression, and the recruit results page.

## NEW findings

### DBG-1: [HIGH] (Cross-listed CR-1) Recruit results page totalScore arithmetic produces nonsensical totals

- **File:** `src/app/(auth)/recruit/[token]/results/page.tsx:183-263`
- **See:** code-reviewer CR-1.
- **Confidence:** HIGH

### DBG-2: [MEDIUM] `use-source-draft` hydration regression — 3 tests fail

- **File:** `tests/unit/hooks/use-source-draft.test.ts`
- **Description:** Three hydration tests fail at HEAD without an obvious culprit commit:
  - "hydrates stored drafts and preferred language after mount without marking the form dirty"
  - "preserves hydrated drafts when persisting after mount"
  - "does not drop unsaved draft state when the languages prop is recreated with the same values"
  Likely root cause: React 19.2.5 changed `useEffect` flush timing for tests using `act()`; or a localStorage mock setup changed. Need direct repro of one failing test before fixing.
- **Confidence:** LOW (need investigation)
- **Failure scenario:** If real, the production hook may be losing draft state silently after mount, which would surface as "I lost my code" complaints from candidates mid-exam.
- **Fix:** (1) Run the 3 failing tests with `--reporter=verbose` and capture full error stack, (2) bisect against the React-19 upgrade or localStorage mock changes, (3) fix the root cause (likely a synchronous hydration that should be deferred to `useLayoutEffect`).

### DBG-3: [LOW] `judge/auth.ts` warn-log `%s` placeholder doesn't substitute

- **File:** `src/lib/judge/auth.ts:92-95`
- **See:** code-reviewer CR-6. Not a runtime bug per se, but logs are misleading during incident response — operators may search for the literal `%s` in logs and find unsubstituted entries.
- **Confidence:** HIGH
- **Fix:** See CR-6.

### DBG-4: [LOW] `submission-form.tsx` snapshot on form unmount may not reach the server

- **File:** `src/components/problem/problem-submission-form.tsx:130-134`
- **Description:** The snapshot interval timer is cleared on unmount, but the in-flight `apiFetch` POST is not cancelled and not awaited. If the user navigates away mid-snapshot, the snapshot may either complete (good) or be killed by the browser's "navigation cancellation" of in-flight fetches (bad — last typed code is lost from the snapshot history).
- **Confidence:** LOW
- **Fix:** On unmount, call `tick()` synchronously one last time before clearing the timer. Use `navigator.sendBeacon()` for the final flush — it's designed for unmount/unload reliability.

## Final-sweep checklist

- [x] No new race condition introduced in `judge/claim/route.ts` since cycle 3.
- [x] Anti-cheat heartbeat freshness (90 s window) at `submissions.ts:54` — verified consistent with the 60s server-side throttle described in the AGENTS.md.
- [x] No regressions in encryption module.
