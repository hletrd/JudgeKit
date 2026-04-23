# Cycle 6 Aggregate Review (review-plan-fix loop)

## Scope
- Aggregated from: rpf-cycle-6-code-reviewer, rpf-cycle-6-security-reviewer, rpf-cycle-6-perf-reviewer, rpf-cycle-6-architect, rpf-cycle-6-test-engineer, rpf-cycle-6-critic, rpf-cycle-6-debugger, rpf-cycle-6-verifier, rpf-cycle-6-designer, rpf-cycle-6-tracer, rpf-cycle-6-document-specialist
- Base commit: d5980b35

## Deduped findings

### AGG-1 -- recruiting-invitations-panel.tsx `handleCreate` missing catch block
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer CR-2, security-reviewer SEC-1, architect ARCH-2, critic CRIT-1, debugger DBG-2, verifier V-1
- **Evidence:**
  - `src/components/contest/recruiting-invitations-panel.tsx:150-213`: `handleCreate` has `try/finally` but no `catch`. All other async handlers (`handleRevoke`, `handleDelete`, `handleResetAccountPassword`) have `try/catch`.
  - `apiFetch` at line 170 can throw TypeError on network failure. The throw bypasses all toast notifications.
  - Added during cycle 5 error-handling pass (commit 8dc3054b), `handleCreate` was missed.
- **Why it matters:** Network errors during invitation creation produce no user feedback. The dialog stays open with no indication of what happened.
- **Suggested fix:** Add `catch { toast.error(t("createError")); }` between try and finally.

### AGG-2 -- anti-cheat-dashboard.tsx polling replaces loaded events, breaking loadMore
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Cross-agent agreement:** perf-reviewer PERF-1, critic CRIT-2, debugger DBG-1, verifier V-2, designer DES-3
- **Evidence:**
  - `src/components/contest/anti-cheat-dashboard.tsx:118-136`: `fetchEvents` always requests `offset=0&limit=100` and replaces the entire events list via `setEvents(json.data.events)`.
  - Line 127: `setOffset(json.data.events.length)` resets offset to 100 even if user loaded 200+ events.
  - `useVisibilityPolling` at line 157 calls `fetchEvents` every 30 seconds.
  - Tracer confirmed: `loadMore` was added after `fetchEvents`, and the interaction wasn't considered.
- **Failure scenario:**
  1. Dashboard loads, shows 100 events, offset=100
  2. User clicks "load more", shows 200 events, offset=200
  3. 30-second poll fires, events replaced with first 100, offset reset to 100
  4. User sees only 100 events; "load more" may fetch duplicate data
- **Suggested fix:** On poll, only update the total count and prepend new events without replacing the entire list. Or preserve the current offset and only fetch new events from offset 0 to the current offset.

### AGG-3 -- recruiting-invitations-panel.tsx email field incorrectly required in Create dialog
- **Severity:** LOW
- **Confidence:** HIGH
- **Cross-agent agreement:** critic CRIT-3, designer DES-1, tracer Flow 3
- **Evidence:**
  - `src/components/contest/recruiting-invitations-panel.tsx:484`: Button disabled when `!createEmail.trim()`
  - Line 175: API sends `candidateEmail: createEmail.trim() || undefined` (optional)
  - Tracer confirmed: The `!createEmail.trim()` check is a bug. The API treats email as optional.
- **Why it matters:** Users cannot create invitations without entering an email, even though the API allows it.
- **Suggested fix:** Remove `!createEmail.trim()` from the disabled condition on line 484.

### AGG-4 -- recruiting-invitations-panel.tsx `createdLink` state not cleared on error
- **Severity:** LOW
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer CR-1
- **Evidence:**
  - `src/components/contest/recruiting-invitations-panel.tsx:197-209`: When POST returns non-OK, `createdLink` is never cleared. If user previously created a link, the dialog remains open with stale data.
- **Suggested fix:** Add `setCreatedLink(null)` at the beginning of `handleCreate`.

### AGG-5 -- recruiting-invitations-panel.tsx Create button has no loading text
- **Severity:** LOW
- **Confidence:** MEDIUM
- **Cross-agent agreement:** designer DES-2
- **Evidence:**
  - `src/components/contest/recruiting-invitations-panel.tsx:484-487`: Button text doesn't change to "Creating..." when `creating` is true. Only `disabled` is set.
- **Suggested fix:** Add `{creating ? tCommon("loading") : t("create")}`.

### AGG-6 -- countdown-timer.tsx `/api/v1/time` .json() without .catch() guard
- **Severity:** LOW
- **Confidence:** MEDIUM
- **Cross-agent agreement:** code-reviewer CR-4, document-specialist DOC-1
- **Evidence:**
  - `src/components/exam/countdown-timer.tsx:80`: `res.json()` called without `.catch()`. While the outer `.catch()` prevents crashes, errors are silently swallowed instead of following the documented apiFetch pattern.
- **Suggested fix:** Add `.catch(() => null)` and handle null in the next `.then`.

### AGG-7 -- score-timeline-chart.tsx SVG data points lack keyboard accessibility
- **Severity:** LOW
- **Confidence:** MEDIUM
- **Cross-agent agreement:** designer DES-4
- **Evidence:**
  - `src/components/contest/score-timeline-chart.tsx:84-93`: `<circle>` elements have `<title>` tooltips but are not keyboard-focusable.
- **Suggested fix:** Add `tabIndex={0}` and `role="img"` to the `<g>` wrapper with `aria-label`.

## Verification results from prior-cycle fixes

| Fix | Status |
|---|---|
| Cycle 5 AGG-1: PublicHeader dropdown role filtering | CONFIRMED FIXED (capability-based) |
| Cycle 5 AGG-2: Group assignment export row limit | CONFIRMED FIXED |
| Cycle 5 AGG-3: Group assignment export rate limiting | CONFIRMED FIXED |
| Cycle 5 AGG-8: Group export bestTotalScore "null" | CONFIRMED FIXED |
| Cycle 28 AGG-1: localStorage crashes in private browsing | CONFIRMED FIXED |
| Cycle 5 AGG-5: Dual count + data queries | NOT FIXED |
| Cycle 5 AGG-6: Manual getApiUser routes | NOT FIXED |
| Cycle 5 AGG-7: Missing tests (export, header, leaderboard) | NOT FIXED |
| Cycle 5 AGG-9: parsePagination silent cap | NOT FIXED |
| Cycle 28 AGG-2: Contest clarifications raw userId | NOT FIXED (DEFER-20) |
| Cycle 28 AGG-3: Redundant defaultValue in compiler-client | NOT VERIFIED (likely not addressed) |

## Lower-signal / validation-needed findings

- architect ARCH-1: recruiting-invitations-panel.tsx is too large (613 lines) — maintainability concern, not a bug
- document-specialist DOC-2: problem-set-form.tsx error code list needs sync comment — very low priority
- designer DES-5: countdown-timer.tsx aria-live="assertive" vs "polite" — judgment call, both defensible
- perf-reviewer PERF-2: score-timeline-chart.tsx SVG could use useMemo — negligible impact
- perf-reviewer PERF-3: active-timed-assignment-sidebar-panel.tsx interval clearing — harmless no-op

## Agent failures
- No agent failures -- all 11 reviews completed successfully
