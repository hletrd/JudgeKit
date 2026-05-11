# Causal Tracing Review: JudgeKit

**Reviewer:** tracer
**Date:** 2026-05-11
**Scope:** Data flow tracing, auth flow gaps, multi-step race conditions — Cycle 2 of RPF loop

---

## New Findings Summary

| Severity | Count |
|----------|-------|
| MEDIUM   | 1     |
| **Total**| **1** |

---

## MEDIUM

### TR1: Verify-Email Fetch Missing AbortController / Race Condition on Rapid Navigation
- **File:** `src/app/(auth)/verify-email/page.tsx:27-31`
- **Confidence:** Medium
- **Description:** The `fetch("/api/v1/auth/verify-email")` call in the verify-email page has no AbortController. If the user navigates away while the request is in flight, the fetch continues in the background. When it eventually resolves, the `setStatus` / `setErrorMessage` calls mutate state on an unmounted component (React warns in strict mode) or, worse, if the component remounts (e.g., back navigation), the stale response may overwrite newer state.
- **Failure scenario:** User lands on verify-email page, request starts. User clicks browser back before it completes. They then click the verification link again from email. The first (stale) request completes and calls `setStatus("success")` while the second request is still loading. The UI flickers between states.
- **Fix:** Add an AbortController inside the useEffect, pass its signal to fetch, and abort on cleanup: `useEffect(() => { const ctrl = new AbortController(); fetch(..., { signal: ctrl.signal }); return () => ctrl.abort(); }, [token])`.

---

## Traced Flows Summary

| Flow | Status | Notes |
|------|--------|-------|
| Auth: login -> session -> API call | OK | CSRF middleware validated, session cookie secure |
| Submission: upload -> judge -> result | OK | AbortController added in prior cycle |
| File: upload -> storage -> download | OK | Magic bytes validation added in prior cycle |
| Admin: action -> audit -> log | OK | Audit buffer flushes correctly |
| Verify-email: token -> fetch -> state | ISSUE | TR1: no abort on unmount |
