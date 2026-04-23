# RPF Cycle 4 — Critic

**Date:** 2026-04-22
**Base commit:** 5d89806d

## Multi-Perspective Critique

### Architecture: Inconsistent `response.json()` error handling across the codebase

The cycle 3 remediation fixed the `response.json()` before `response.ok` pattern in ~10 files, but the fix was not applied consistently to all client components that use `apiFetch`. Specifically:

- `invite-participants.tsx:78` — `res.json()` on error path without `.catch()`
- `access-code-manager.tsx:42,88` — `res.json()` without `.catch()`

While the `apiJson` helper was added in cycle 3, it is not used in any of the client components. The existing components still use the manual `response.ok` + `.json().catch(() => ({}))` pattern. The `apiJson` helper is a good abstraction but its adoption is zero, which means it's dead code that adds confusion about the "right" way to handle API responses.

**Recommendation:** Either adopt `apiJson` consistently across client components, or remove it and standardize on the manual pattern. The current state of having both options is worse than having only one.

---

### Consistency: Dynamic clipboard import inconsistency

`recruiting-invitations-panel.tsx` was fixed in cycle 3 to use a static `import { copyToClipboard } from "@/lib/clipboard"`. However, `access-code-manager.tsx` still uses `await import("@/lib/clipboard")`. These two components are in the same feature area (contest management) and are maintained by the same developers. Having inconsistent import patterns makes the codebase harder to maintain.

---

### UX: Countdown timer drift is a real user-facing problem

The `countdown-timer.tsx` timer drift issue (also flagged by PERF-1 and DBG-3) is particularly impactful in an exam context. Students rely on the countdown timer to manage their time. If the timer shows incorrect remaining time after switching tabs, this can cause unnecessary panic or incorrect time management. The fix is simple (add a visibilitychange listener) and should be prioritized.

---

### Testing: Missing unit tests for error-handling paths

The deferred items from cycle 3 (DEFER-1, DEFER-2) about adding unit tests for `discussion-vote-buttons.tsx` and `problem-submission-form.tsx` error handling remain unaddressed. The test infrastructure exists (96+ test files in `tests/`), but the new error-handling code added in cycles 2-3 has no test coverage. This is a risk — future refactors could break the error handling without anyone noticing.

---

### Risk Assessment: Summary of remaining issues

| Finding | Severity | Confidence | Agents Agreeing |
|---------|----------|------------|-----------------|
| `invite-participants.tsx` `.json()` without `.catch()` | MEDIUM | HIGH | 3 (CR, SEC, DBG) |
| `access-code-manager.tsx` `.json()` without `.catch()` | MEDIUM | HIGH | 3 (CR, SEC, DBG) |
| `access-code-manager.tsx` dynamic clipboard import | LOW | MEDIUM | 2 (CR, SEC) |
| `countdown-timer.tsx` timer drift | MEDIUM | HIGH | 3 (PERF, DBG, CRITIC) |
| `compiler-client.tsx` `sourceCode` dep in `handleLanguageChange` | LOW | MEDIUM | 2 (CR, PERF) |
| `compiler-client.tsx` stdin no `maxLength` | LOW | LOW | 2 (CR, SEC) |
| `anti-cheat-monitor.tsx` listener re-registration | LOW | MEDIUM | 3 (CR, SEC, DBG) |
| `active-timed-assignment-sidebar-panel.tsx` timer continues after expiry | LOW | MEDIUM | 1 (PERF) |
