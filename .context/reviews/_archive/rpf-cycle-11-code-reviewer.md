# RPF Cycle 11 — Code Reviewer ( refreshed 2026-05-11 )

**Date:** 2026-05-11
**HEAD reviewed:** `b5008708`
**Scope:** Full repo sweep focusing on files changed since prior review (2026-04-29, `7073809b`); ~200+ src files touched.

---

## Findings

### C11-CR-1: Dead code — `staggeredTimerIdsRef` never populated in CountdownTimer

- **Severity:** LOW
- **Confidence:** High
- **File:** `src/components/exam/countdown-timer.tsx:50, 214-215`
- **Problem:** `staggeredTimerIdsRef` is initialized as `useRef<ReturnType<typeof setTimeout>[]>([])` and cleared in the timer effect cleanup (`staggeredTimerIdsRef.current.forEach((id) => clearTimeout(id)); staggeredTimerIdsRef.current = [];`), but nothing ever pushes timer IDs into it. This is leftover dead code from a previous refactor where staggered toasts were managed via separate timeouts.
- **Failure scenario:** No runtime failure; purely code hygiene / misleading maintenance burden.
- **Fix:** Remove `staggeredTimerIdsRef` and its cleanup lines.

### C11-CR-2: Redundant `as string` cast in SSE event handler

- **Severity:** LOW
- **Confidence:** High
- **File:** `src/hooks/use-submission-polling.ts:139`
- **Problem:** `JSON.parse(event.data as string)` — `event.data` on `MessageEvent` is already typed as `string`. The cast is redundant.
- **Fix:** Remove `as string`.

### C11-CR-3: Unsafe `as Record<string, unknown>` casts in normalizeSubmission

- **Severity:** LOW
- **Confidence:** Medium
- **File:** `src/hooks/use-submission-polling.ts:48-49, 70-71, 139`
- **Problem:** Multiple `as Record<string, unknown>` casts bypass TypeScript structural checks. While runtime guards exist (typeof checks, Number.isFinite), the `as` casts are technical debt that could mask regressions if the API response shape changes.
- **Fix:** Remove `as` casts; the runtime guards already provide safety. Use narrower intermediate types where helpful.

### C11-CR-4: `lastAuditEventWriteFailureAt` uses app-server time instead of DB time

- **Severity:** LOW
- **Confidence:** High
- **File:** `src/lib/audit/events.ts:206`
- **Problem:** `lastAuditEventWriteFailureAt = new Date().toISOString()` records the app-server time for a health-monitoring timestamp. While not security-critical, it is inconsistent with the codebase-wide policy of using `getDbNowUncached()` for temporal values.
- **Fix:** Pass `dbNow` into the flush function or accept it as a parameter, consistent with other timestamp writes.

---

## Verified Safe / No Regression

- All prior cycle fixes intact (recruiting token DB-time consistency, export/backup DB time, CountdownTimer sync cleanup, file.type removal).
- No new `as any` or `@ts-ignore` introduced.
- Korean letter-spacing rules correctly followed.
- All event listener add/remove pairs balanced.
- No empty catch blocks in the change surface.

## Verdict

Minor code-quality findings only. No logic bugs or maintainability risks above LOW. Convergence likely.
