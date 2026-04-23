# RPF Cycle 25 — Aggregate Review

**Date:** 2026-04-22
**Base commit:** ac51baaa
**Review artifacts:** code-reviewer.md, perf-reviewer.md, security-reviewer.md, architect.md, critic.md, verifier.md, debugger.md, test-engineer.md, tracer.md, designer.md, document-specialist.md

## Previously Fixed Items (Verified in Current Code)

All cycle-24 aggregate findings have been addressed:
- AGG-1 (handleBulkAddMembers double .json()): Fixed — body parsed once before branching
- AGG-2 (discussion components raw error.message): Fixed — always use i18n labels in toasts
- AGG-3 (group-members-manager default error handler): Fixed — returns tCommon("error") in default
- AGG-4 (submission-overview silent error swallowing): Fixed — shows toast on non-OK
- AGG-5 (problem-submission-form double .json()): Fixed — body parsed once
- AGG-6 (compiler-client double .json()): Fixed — body parsed once

## Deduped Findings (sorted by severity then signal)

### AGG-1: Default error handlers leak raw `error.message` — systemic pattern across 4+ components [MEDIUM/HIGH]

**Flagged by:** code-reviewer (CR-3, CR-4), security-reviewer (SEC-2), critic (CRI-1), verifier (V-6, V-7), debugger (DBG-3, DBG-4), tracer (TR-1)
**Signal strength:** 9 of 11 review perspectives

**Files:**
- `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:310`
- `src/app/(dashboard)/dashboard/groups/[id]/assignment-form-dialog.tsx:206`
- `src/app/(dashboard)/dashboard/groups/create-group-dialog.tsx:33`
- `src/app/(dashboard)/dashboard/groups/edit-group-dialog.tsx:66-69` (dead SyntaxError check)

**Description:** Multiple `getErrorMessage` functions have `default: return error.message || tCommon("error")`. While server-thrown errors use known error codes as `error.message`, unexpected client-side errors (TypeError, SyntaxError) would have their raw messages shown. The `edit-group-dialog.tsx` also has dead code: a SyntaxError check where both branches return `tCommon("error")`.

**Concrete failure scenario:** Network error causes `TypeError: Failed to fetch`. This reaches the catch block, `getErrorMessage` doesn't match it, and `"Failed to fetch"` is shown to the user instead of a localized error message.

**Fix:** Change all default cases to `return tCommon("error")` with `console.error()`. Remove dead SyntaxError check in edit-group-dialog.

---

### AGG-2: `compiler-client.tsx` exposes raw API error messages in toasts and could show `[object Object]` [MEDIUM/HIGH]

**Flagged by:** code-reviewer (CR-1), security-reviewer (SEC-1), critic (CRI-2), debugger (DBG-1), tracer (TR-2)
**Signal strength:** 5 of 11 review perspectives

**File:** `src/components/code/compiler-client.tsx:271-279, 292-299`

**Description:** The `handleRun` function constructs `errorMessage = data.error || data.message || res.statusText || "Request failed"`. This value is used in both `toast.error(t("runFailed"), { description: errorMessage })` and the inline error display. Two issues:
1. Raw API errors are exposed to users via toast descriptions, violating the i18n convention.
2. If `data.error` is an object (non-standard API response), `errorMessage` becomes `[object Object]`.

**Concrete failure scenario:** API returns `{ error: { code: "rate_limited" } }`. Toast shows `[object Object]` as the description.

**Fix:** Use i18n keys in toast descriptions. Ensure `errorMessage` is always a string with `String()` wrapping. Log raw errors to console.

---

### AGG-3: `contest-quick-stats.tsx` double-wraps `Number()` on already-numeric JSON values [LOW/MEDIUM]

**Flagged by:** code-reviewer (CR-2), critic (CRI-3), perf-reviewer (PERF-2)
**Signal strength:** 3 of 11 review perspectives

**File:** `src/components/contest/contest-quick-stats.tsx:65-68`

**Description:** The stats parsing uses `Number.isFinite(Number(data.data!.participantCount))` where `data.data!.participantCount` is already a number from JSON parsing. The `Number()` call is a no-op on numeric values. Using `typeof` checks would be more idiomatic and avoid unnecessary coercion.

**Fix:** Replace `Number.isFinite(Number(x))` with `typeof x === "number" && Number.isFinite(x)`. Also remove the non-null assertion `!` when the type guard already ensures the value exists.

---

### AGG-4: `contest-replay.tsx` speed selector uses `Number(v)` instead of `parseInt(v, 10)` [LOW/LOW]

**Flagged by:** critic (CRI-4)
**Signal strength:** 1 of 11 review perspectives

**File:** `src/components/contest/contest-replay.tsx:185`

**Description:** Per the established convention from cycle 23/24 fixes, `parseInt()` should be used for numeric input parsing instead of `Number()`. While `Number()` works for this specific case (values from `String(speed)`), it's inconsistent with the codebase convention.

**Fix:** Use `parseInt(v, 10)` for consistency.

---

### AGG-5: Recruiting invitations panel re-fetches stats on every filter change [MEDIUM/LOW]

**Flagged by:** perf-reviewer (PERF-4)
**Signal strength:** 1 of 11 review perspectives

**File:** `src/components/contest/recruiting-invitations-panel.tsx:166-168`

**Description:** `fetchData` combines both `fetchInvitations` and `fetchStats`, so every filter change triggers a stats re-fetch even though stats are independent of search/filter. This creates unnecessary network traffic.

**Fix:** Separate stats fetch so it only runs on mount and after mutations.

---

## Security Findings (carried)

### SEC-3: `window.location.origin` for URL construction — covered by DEFER-24 (2 instances still present)
### SEC-4: Encryption plaintext fallback — MEDIUM/MEDIUM, carried from DEFER-39
### SEC-5: `AUTH_CACHE_TTL_MS` has no upper bound — LOW/MEDIUM, carried from DEFER-40
### SEC-6: Anti-cheat localStorage persistence — LOW/LOW, new finding this cycle
### SEC-7: sanitizeHtml root-relative img src — LOW/LOW, new finding this cycle

## Performance Findings

### PERF-1: `submission-overview.tsx` polling when dialog closed — RESOLVED (properly guarded with `paused` flag)
### PERF-3: Active-timed-assignment sidebar extra tick after expiry — LOW/LOW, new finding
### PERF-5: Contest-replay FLIP animation synchronous layout — LOW/LOW, new finding

## Test Coverage Gaps (from test-engineer)

### TE-1: No unit tests for `getErrorMessage` default case behavior — new [LOW/MEDIUM]
### TE-2: No tests for compiler-client error display behavior — new [LOW/MEDIUM]
### TE-3: No tests for contest-quick-stats data validation logic — new [LOW/MEDIUM]
### TE-4: Carried test coverage gaps from previous cycles

## Documentation Findings (from document-specialist)

### DOC-1: `apiFetchJson` JSDoc could be clearer about fallback on error responses — LOW/LOW
### DOC-2: `getErrorMessage` functions lack JSDoc — LOW/LOW
### DOC-3: `useVisibilityPolling` JSDoc missing `paused` parameter — LOW/LOW

## Previously Deferred Items (Carried Forward)

- DEFER-1: Migrate raw route handlers to `createApiHandler` (22 routes)
- DEFER-2: SSE connection tracking eviction optimization
- DEFER-3: SSE connection cleanup test coverage
- D1: JWT authenticatedAt clock skew with DB tokenInvalidatedAt (MEDIUM)
- D2: JWT callback DB query on every request — add TTL cache (MEDIUM)
- A19: `new Date()` clock skew risk in remaining routes (LOW)
- DEFER-24: Invitation URL uses window.location.origin (same as SEC-3)
- DEFER-29: Add dedicated candidates summary endpoint (same as PERF-3 from cycle 28)
- DEFER-30 through DEFER-44: See RPF cycle 28 and cycle 24 plans
- DEFER-38: Unguarded `response.json()` on success paths — systemic fix
- DEFER-39: Encryption plaintext fallback (same as SEC-4)
- DEFER-40: Proxy auth cache TTL upper bound (same as SEC-5)
- DEFER-41: `submission-overview.tsx` polls when dialog closed — RESOLVED this cycle (properly guarded)

## Agent Failures

None. All 11 review perspectives completed successfully.
