# RPF Cycle 24 — Aggregate Review

**Date:** 2026-04-22
**Base commit:** dbc0b18f
**Review artifacts:** code-reviewer.md, perf-reviewer.md, security-reviewer.md, architect.md, critic.md, verifier.md, debugger.md, test-engineer.md, tracer.md, designer.md, document-specialist.md

## Previously Fixed Items (Verified in Current Code)

All cycle-23 aggregate findings have been addressed:
- AGG-1 (local normalizePage): Fixed — 5 files now import from shared module
- AGG-2 (contest-join double .json()): Fixed — uses apiFetchJson
- AGG-3 (create-problem-form, group-members-manager handleAddMember double .json()): Fixed — body parsed once
- AGG-4 (submission-overview Dialog): Fixed — uses shared Dialog component
- AGG-5 (contest-quick-stats avgScore null): Fixed — shows "---" when null
- AGG-7 (normalizePageSize parseInt): Fixed
- AGG-8 (normalizePage JSDoc): Fixed

RPF cycle 28 findings also verified as fixed where applicable.

## Deduped Findings (sorted by severity then signal)

### AGG-1: `handleBulkAddMembers` double `.json()` — body consumed twice on same Response [HIGH/HIGH]

**Flagged by:** code-reviewer (CR-1), architect (ARCH-1), verifier (V-1), debugger (DBG-1), critic (CRI-2), tracer (TR-1)
**Signal strength:** 6 of 11 review perspectives

**File:** `src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx:181-185`

**Description:** The `handleAddMember` function in the same file was fixed in cycle 23 to parse the body once before branching, but `handleBulkAddMembers` was missed. After checking `!response.ok` on line 180, the error branch calls `response.json()` on line 181. Then on line 185, the success path calls `response.json()` again on the same Response. This is the documented anti-pattern from `src/lib/api/client.ts`.

**Concrete failure scenario:** A developer removes the throw from the error handling to show a toast instead. Now both `.json()` calls execute on error paths, causing `TypeError: Body has already been consumed`.

**Fix:** Parse the body once before branching, same as `handleAddMember`.

---

### AGG-2: Discussion components expose raw `error.message` to users via toast [MEDIUM/HIGH]

**Flagged by:** code-reviewer (CR-2), security-reviewer (SEC-1), verifier (V-2), debugger (DBG-2), critic (CRI-1), tracer (TR-2)
**Signal strength:** 6 of 11 review perspectives

**Files:**
- `src/components/discussions/discussion-post-form.tsx:54`
- `src/components/discussions/discussion-thread-form.tsx:61`
- `src/components/discussions/discussion-post-delete-button.tsx:36`
- `src/components/discussions/discussion-thread-moderation-controls.tsx:83,104`

**Description:** These components use `toast.error(error instanceof Error ? error.message : errorLabel)`. While the `throw new Error(errorLabel)` on the preceding line means `error.message` is the i18n label in the normal error path, the catch block catches ALL errors. If a `TypeError` or `SyntaxError` slips through (e.g., from `.json()` on a non-JSON body when `.catch()` is somehow bypassed), the raw error message is displayed to the user. This violates the convention in `src/lib/api/client.ts` line 23: "Use i18n keys for all user-facing error messages."

**Concrete failure scenario:** A reverse proxy returns HTML on a 502 error. The `.json()` parse fails with `SyntaxError: Unexpected token < in JSON at position 0`. This message is shown in the toast.

**Fix:** Always use the i18n label in toasts. Log raw errors to console only:
```ts
catch (error) {
  console.error("Operation failed:", error);
  toast.error(errorLabel);
}
```

---

### AGG-3: `group-members-manager.tsx` default error handler leaks raw error messages [MEDIUM/MEDIUM]

**Flagged by:** code-reviewer (CR-3), security-reviewer (SEC-2), critic (CRI-1)
**Signal strength:** 3 of 11 review perspectives

**File:** `src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx:102`

**Description:** The `getErrorMessage` function has a `default` case that returns `error.message || tCommon("error")`. Any unexpected error (e.g., a `TypeError` from a failed `.json()` parse) will have its raw message shown to the user.

**Fix:** Change the default to always return `tCommon("error")` and log the raw error.

---

### AGG-4: `submission-overview.tsx` silently swallows non-OK responses [MEDIUM/MEDIUM]

**Flagged by:** code-reviewer (CR-4), verifier (V-3), designer (DES-1)
**Signal strength:** 3 of 11 review perspectives

**File:** `src/components/lecture/submission-overview.tsx:91`

**Description:** When the API returns a non-OK response, the code simply `return`s with no user feedback. The `src/lib/api/client.ts` convention at line 21 explicitly states "Never silently swallow errors — always surface them to the user." This was fixed for comment-section but not for submission-overview.

**Fix:** Add a toast error for non-OK responses on initial load, or show a subtle "Unable to refresh" indicator on polling failures.

---

### AGG-5: `problem-submission-form.tsx` double `.json()` in handleRun and handleSubmit [MEDIUM/MEDIUM]

**Flagged by:** code-reviewer (CR-5, CR-6), architect (ARCH-1)
**Signal strength:** 3 of 11 review perspectives

**Files:**
- `src/components/problem/problem-submission-form.tsx:184-188`
- `src/components/problem/problem-submission-form.tsx:247-252`

**Description:** Same double `.json()` anti-pattern. Error branch and success branch each call `.json()` on the same Response. Mutually exclusive branching prevents the actual error today, but this is the documented anti-pattern.

**Fix:** Parse the body once before branching, or use `apiFetchJson`.

---

### AGG-6: `compiler-client.tsx` double `.json()` on same Response [MEDIUM/MEDIUM]

**Flagged by:** code-reviewer (CR-7), architect (ARCH-1)
**Signal strength:** 2 of 11 review perspectives

**File:** `src/components/code/compiler-client.tsx:270-287`

**Description:** After checking `!res.ok`, error branch calls `res.json()` on line 270, then success branch calls `res.json()` on line 287. Same anti-pattern.

**Fix:** Parse the body once before branching.

---

## Security Findings (carried)

### SEC-3: `window.location.origin` for URL construction — covered by DEFER-24 (2 instances still present)
### SEC-4: `AUTH_CACHE_TTL_MS` has no upper bound — LOW/MEDIUM, carried from cycle 23
### SEC-5: Encryption plaintext fallback — MEDIUM/MEDIUM, carried from cycle 11

## Performance Findings (carried)

### PERF-3: `recruiter-candidates-panel.tsx` full export fetch — carried as DEFER-29
### PERF-4: Practice page Path B progress filter — carried from cycles 18-23
### PERF-5: `submission-overview.tsx` polls when dialog closed — carried as DEFER-41

## Test Coverage Gaps (from test-engineer)

### TE-1: No unit tests for handleBulkAddMembers double .json() pattern — new [LOW/MEDIUM]
### TE-2: No tests verifying raw error messages not leaked in discussion components — new [LOW/LOW]
### TE-3 through TE-7: Carried from previous cycles

## Previously Deferred Items (Carried Forward)

- DEFER-1: Migrate raw route handlers to `createApiHandler` (22 routes)
- DEFER-2: SSE connection tracking eviction optimization
- DEFER-3: SSE connection cleanup test coverage
- D1: JWT authenticatedAt clock skew with DB tokenInvalidatedAt (MEDIUM)
- D2: JWT callback DB query on every request — add TTL cache (MEDIUM)
- A19: `new Date()` clock skew risk in remaining routes (LOW)
- DEFER-24: Invitation URL uses window.location.origin (same as SEC-3)
- DEFER-29: Add dedicated candidates summary endpoint (same as PERF-3)
- DEFER-30 through DEFER-43: See RPF cycle 23 and 28 plans

## Agent Failures

None. All 11 review perspectives completed successfully.
