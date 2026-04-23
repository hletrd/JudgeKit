# RPF Cycle 14 — Aggregate Review

**Date:** 2026-04-22
**Base commit:** 023ae5d4
**Review artifacts:** code-reviewer.md, perf-reviewer.md, security-reviewer.md, architect.md, critic.md, verifier.md, debugger.md, test-engineer.md, tracer.md, designer.md, document-specialist.md

## Previously Fixed Items (Verified in Current Code)

All cycle 13 aggregate findings have been addressed:
- AGG-1 from cycle 13 (workers-client.tsx icon-only buttons missing aria-label): Fixed — all six buttons now have `aria-label`
- AGG-2 from cycle 13 (chat-logs-client.tsx API calls without res.ok check): Fixed — both `res.ok` check and `.catch()` guard added
- AGG-3 from cycle 13 (group-instructors-manager.tsx remove instructor button missing aria-label): Fixed — `aria-label` added
- AGG-4 from cycle 13 (multiple components unguarded res.json() on success paths): Partially fixed — 5 of 10+ files now have `.catch()` guards

## Deduped Findings (sorted by severity then signal)

### AGG-1: Systemic unguarded `res.json()` pattern — 4 cycles of partial fixes without root-cause resolution [MEDIUM/HIGH]

**Flagged by:** code-reviewer (CR-1), critic (CRI-1), verifier (V-1), debugger (DBG-1 implicit), tracer (TR-1 implicit), architect (ARCH-1), document-specialist (DOC-1, DOC-3)
**Signal strength:** 7 of 11 review perspectives

**Files:** 11+ components across the codebase:
- `src/components/contest/anti-cheat-dashboard.tsx:124,161,238`
- `src/components/contest/analytics-charts.tsx:542`
- `src/components/contest/leaderboard-table.tsx:231`
- `src/components/contest/participant-anti-cheat-timeline.tsx:96,131`
- `src/components/contest/recruiting-invitations-panel.tsx:202,218`
- `src/components/code/compiler-client.tsx:287`
- `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:141,177`
- `src/app/(dashboard)/dashboard/problems/[id]/problem-export-button.tsx:19`
- `src/app/(dashboard)/dashboard/contests/join/contest-join-client.tsx:49`
- `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:220,336,427`
- `src/app/(dashboard)/dashboard/submissions/[id]/submission-detail-client.tsx:105`

**Description:** Despite three cycles (11-13) of fixing unguarded `res.json()` calls file-by-file, 11+ components still have the same pattern. Each cycle fixes 5-6 files but the pattern keeps appearing in reviews because there is no centralized, enforced approach. The root cause is architectural: no codified `apiFetchJson` helper exists.

**Fix:** Create a centralized `apiFetchJson<T>(url, options, fallback): Promise<T>` helper that combines `apiFetch` + `res.ok` check + `.json().catch()` parsing. Refactor all instances to use it. Update `apiFetch` JSDoc to document the success-path pattern and the double-read anti-pattern.

---

### AGG-2: `create-problem-form.tsx` double `res.json()` — response body consumed on first read [MEDIUM/MEDIUM]

**Flagged by:** code-reviewer (CR-4), critic (CRI-2), verifier (V-2), debugger (DBG-1), tracer (TR-1), architect (ARCH-2)
**Signal strength:** 6 of 11 review perspectives

**File:** `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:332,336` and `423,427`

**Description:** The code calls `await res.json()` twice on the same Response object at two locations. The first call (on the error path with `.catch()`) consumes the response body. The second call (on the success path without `.catch()`) would fail with "body already consumed" if the error path didn't throw first. This is a latent bug — currently safe because the error path always throws, but fragile.

**Concrete failure scenario:** Developer refactors the error path to not throw (e.g., adding a fallback). The second `res.json()` throws "body already consumed" TypeError.

**Fix:** Parse response once and branch on `res.ok`:
```ts
const data = await res.json().catch(() => ({}));
if (!res.ok) throw new Error(...);
// use data for success
```

---

### AGG-3: `problem-import-button.tsx` parses uploaded JSON without size limit [MEDIUM/MEDIUM]

**Flagged by:** code-reviewer (CR-2), perf-reviewer (PERF-2), security-reviewer (SEC-2), debugger (DBG-4), tracer (TR-3)
**Signal strength:** 5 of 11 review perspectives

**File:** `src/app/(dashboard)/dashboard/problems/problem-import-button.tsx:22-23`

**Description:** Carried from SEC-3 (cycle 13) and PERF-3 (cycle 13). No file size check before `file.text()` loads the entire file into memory. A large file would freeze the browser tab or cause an out-of-memory crash.

**Fix:** Add `if (file.size > 10 * 1024 * 1024) { toast.error(t("fileTooLarge")); return; }` before `file.text()`.

---

### AGG-4: `problem-export-button.tsx` — unguarded `res.json()` + no null check on nested property access [LOW/MEDIUM]

**Flagged by:** code-reviewer (CR-5), critic (CRI-4), verifier (V-3), debugger (DBG-2), tracer (TR-2)
**Signal strength:** 5 of 11 review perspectives

**File:** `src/app/(dashboard)/dashboard/problems/[id]/problem-export-button.tsx:19-24`

**Description:** Line 19 calls `res.json()` without `.catch()`. Line 24 accesses `data.data.problem.title` without null checks. If the API returns an unexpected shape, this throws TypeError.

**Fix:** Add `.catch()` guard and null-safe access.

---

### AGG-5: `contest-join-client.tsx` variable shadowing — `payload` declared twice [LOW/LOW]

**Flagged by:** code-reviewer (CR-3), critic (CRI-3), debugger (DBG-3)
**Signal strength:** 3 of 11 review perspectives

**File:** `src/app/(dashboard)/dashboard/contests/join/contest-join-client.tsx:45,49`

**Description:** `const payload` is declared on line 45 (error path) and again on line 49 (success path). Currently safe because the error path throws, but the shadowing is confusing.

**Fix:** Rename the error-path variable to `errorPayload`.

---

## Security Findings (from security-reviewer)

### SEC-1: Plaintext fallback in encryption module — carried from SEC-2 (cycle 11) [MEDIUM/HIGH]

**File:** `src/lib/security/encryption.ts:78-81`

**Fix:** Add integrity check or HMAC. Monitor plaintext fallback hits in production.

### SEC-2: `problem-import-button.tsx` parses uploaded JSON without size limit — covered by AGG-3 above

### SEC-3: `window.location.origin` for URL construction — carried from DEFER-24 [MEDIUM/MEDIUM]

---

## Performance Findings (from perf-reviewer)

### PERF-1: Anti-cheat dashboard polling replaces all data on every tick — carried from PERF-1 (cycle 13) [MEDIUM/LOW]

### PERF-2: `problem-import-button.tsx` parses uploaded JSON without size limit — covered by AGG-3 above

### PERF-3: `contest-join-client.tsx` 1-second setTimeout delay before navigation [LOW/LOW]

---

## Architectural Findings (from architect)

### ARCH-1: No centralized `res.json()` safety pattern — covered by AGG-1 above [MEDIUM/HIGH]

### ARCH-2: `create-problem-form.tsx` double `res.json()` — covered by AGG-2 above

### ARCH-3: `language-config-table.tsx` is 688 lines — should be decomposed [LOW/LOW]

---

## Test Coverage Gaps (from test-engineer)

### TE-1: No unit tests for `workers-client.tsx` [LOW/MEDIUM]

### TE-2: No unit tests for `chat-logs-client.tsx` [LOW/MEDIUM]

### TE-3: Encryption module still untested — carried from TE-3 (cycle 11) [MEDIUM/HIGH]

### TE-4: No unit tests for `create-problem-form.tsx` [LOW/MEDIUM]

### TE-5: No unit tests for `problem-export-button.tsx` [LOW/LOW]

---

## Documentation Findings (from document-specialist)

### DOC-1: `apiFetch` JSDoc does not document success-path `.json()` safety pattern [LOW/MEDIUM]

### DOC-2: `encryption.ts` plaintext fallback lacks migration guidance [LOW/LOW]

### DOC-3: `apiFetch` JSDoc does not mention the double-read anti-pattern [LOW/MEDIUM]

---

## Previously Deferred Items (Carried Forward)

- DEFER-1: Migrate raw route handlers to `createApiHandler` (22 routes)
- DEFER-2: SSE connection tracking eviction optimization
- DEFER-3: SSE connection cleanup test coverage
- D1: JWT authenticatedAt clock skew with DB tokenInvalidatedAt (MEDIUM)
- D2: JWT callback DB query on every request — add TTL cache (MEDIUM)
- A19: `new Date()` clock skew risk in remaining routes (LOW)
- DEFER-20: Contest clarifications show raw userId instead of username
- DEFER-21: Duplicated visibility-aware polling pattern (partially addressed)
- DEFER-22: copyToClipboard dynamic import inconsistency
- DEFER-23: Practice page Path B progress filter
- DEFER-24: Invitation URL uses window.location.origin
- DEFER-25: Duplicate formatTimestamp utility
- DEFER-1 (cycle 1): Add unit tests for useVisibilityPolling, SubmissionListAutoRefresh, and stats endpoint
- DEFER-2 (cycle 1): Standardize error handling pattern in useVisibilityPolling
- DEFER-26: Unit tests for create-group-dialog.tsx and bulk-create-dialog.tsx
- DEFER-27: Unit tests for comment-section.tsx
- DEFER-28: Unit tests for participant-anti-cheat-timeline.tsx polling behavior
- DEFER-29: Add dedicated candidates summary endpoint for recruiter-candidates-panel
- DEFER-30: Remove unnecessary `router.refresh()` from discussion-vote-buttons
- ARCH-1: Centralized error-to-i18n mapping utility (refactor suggestion)

## Agent Failures

None. All 11 review perspectives completed successfully.
