# RPF Cycle 22 — Aggregate Review

**Date:** 2026-04-22
**Base commit:** 88abca22
**Review artifacts:** code-reviewer.md, perf-reviewer.md, security-reviewer.md, architect.md, critic.md, verifier.md, debugger.md, test-engineer.md, tracer.md, designer.md, document-specialist.md

## Previously Fixed Items (Verified in Current Code)

All cycle-21 aggregate findings have been addressed:
- AGG-1 (formatDetailsJson hardcoded in anti-cheat-dashboard.tsx): Fixed — migrated to i18n `t()` function
- AGG-3 (role-editor-dialog Number() NaN risk): Fixed — uses `parseInt(e.target.value, 10) || 0`
- AGG-5 (inconsistent Number() vs parseInt()): Fixed — all form inputs now use `parseInt()`
- AGG-6 (anti-cheat-dashboard aria-controls): Fixed — `aria-controls` added to expand/collapse buttons
- AGG-7 (contest-replay aria-valuetext): Fixed — `aria-valuetext` added to range slider
- AGG-8 (sidebar timer aria-valuenow precision): Fixed — uses precise `progressPercent`
- AGG-2 (window.location.origin): Carried as DEFER-24
- AGG-4 (contest-replay setInterval): Carried as DEFER-3

## Deduped Findings (sorted by severity then signal)

### AGG-1: `create-problem-form.tsx` sequence number and difficulty inputs silently discard invalid numeric input without feedback [LOW/MEDIUM]

**Flagged by:** code-reviewer (CR-1), architect (ARCH-1), critic (CRI-1), verifier (V-1), debugger (DBG-1), tracer (TR-1), designer (DES-1), security-reviewer (SEC-4), test-engineer (TE-1), document-specialist (DOC-1)
**Signal strength:** 10 of 11 review perspectives

**File:** `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:92,108,394,401,469,483`

**Description:** The form stores `sequenceNumber` and `difficulty` as `string` state and converts to numbers only at submit time. When a non-numeric value is entered (e.g., "abc"), `parseInt()` returns `NaN`, the `Number.isFinite()` check fails, and the value is silently set to `null`. No inline validation, toast, or error message informs the user that their input was discarded. This contrasts with the codebase's explicit-feedback pattern used elsewhere (e.g., toast.error on submission failure).

**Concrete failure scenario:** A user types "abc" into the sequence number field. The form shows no error. On submit, `parseInt("abc", 10)` returns `NaN`, the value is set to `null`, and the problem is created without a sequence number. The user may not notice the omission.

**Fix:** Add a check before submission: if `sequenceNumber` is non-empty and `parsedSeqNum` is `null`, show a toast.warning and either prevent submission or proceed with the null value after explicit user notification. Similarly for `difficulty` if non-empty and `parseFloat(difficulty)` is `NaN`.

---

### AGG-2: `window.location.origin` for URL construction — carried from DEFER-24, now 4 instances [MEDIUM/MEDIUM]

**Flagged by:** security-reviewer (SEC-1)
**Signal strength:** 1 of 11 (security-specific, carried)

**Files:**
- `src/components/contest/access-code-manager.tsx:137`
- `src/components/contest/recruiting-invitations-panel.tsx:99`
- `src/app/(dashboard)/dashboard/admin/files/file-management-client.tsx:96`
- `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:148`

**Description:** Four components construct URLs using `window.location.origin`. Carried from DEFER-24.

**Fix:** Use a server-provided public URL or configurable base URL.

---

### AGG-3: `recruiter-candidates-panel.tsx` full export fetch — carried as DEFER-29 [MEDIUM/HIGH]

**Flagged by:** perf-reviewer (PERF-1 carried), critic (CRI-3 carried)
**Signal strength:** 2 of 11 (carried)

Carried from cycle 18 (AGG-2, DEFER-29).

---

## Performance Findings (carried)

### PERF-1: `recruiter-candidates-panel.tsx` full export fetch — carried as DEFER-29
### PERF-2: Practice page Path B progress filter — carried from cycles 18-20

## Security Findings (carried)

### SEC-1: `window.location.origin` for URL construction — covered by AGG-2 above
### SEC-2: Gemini model name URL interpolation — LOW/MEDIUM, carried from cycle 18
### SEC-3: Encryption plaintext fallback — MEDIUM/MEDIUM, carried from cycle 11

## Test Coverage Gaps (from test-engineer)

### TE-1: No unit tests for `create-problem-form.tsx` numeric validation — new [LOW/MEDIUM]
### TE-2 through TE-5: Carried from cycle 21 (anti-cheat-dashboard, role-editor-dialog, contest-replay, formatDetailsJson)
### TE-6 through TE-11: Carried from previous cycles (see test-engineer.md)

## Previously Deferred Items (Carried Forward)

- DEFER-1: Migrate raw route handlers to `createApiHandler` (22 routes)
- DEFER-2: SSE connection tracking eviction optimization
- DEFER-3: SSE connection cleanup test coverage
- D1: JWT authenticatedAt clock skew with DB tokenInvalidatedAt (MEDIUM)
- D2: JWT callback DB query on every request — add TTL cache (MEDIUM)
- A19: `new Date()` clock skew risk in remaining routes (LOW)
- DEFER-20 through DEFER-30: See previous aggregates
- DEFER-50 through DEFER-57: Test gaps (see test-engineer.md)
- DEFER-24: Invitation URL uses window.location.origin (same as AGG-2)
- DEFER-29: Add dedicated candidates summary endpoint (same as PERF-1)
- DEFER-3 (from cycle 21): `contest-replay.tsx` `setInterval` without visibility awareness
- DEFER-4 (from cycle 21): `recruiter-candidates-panel.tsx` full export fetch (same as AGG-3)
- DEFER-5 (from cycle 21): Component tests for anti-cheat-dashboard, role-editor-dialog, contest-replay
- DEFER-6 (from cycle 21): Gemini model name URL interpolation
- DEFER-7 (from cycle 21): Encryption plaintext fallback

## Agent Failures

None. All 11 review perspectives completed successfully.
