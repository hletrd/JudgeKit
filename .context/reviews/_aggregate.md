# RPF Cycle 11 — Aggregate Review

**Date:** 2026-04-22
**Base commit:** 42ca4c9a
**Review artifacts:** code-reviewer.md, perf-reviewer.md, security-reviewer.md, architect.md, critic.md, verifier.md, debugger.md, test-engineer.md, tracer.md, designer.md, document-specialist.md

## Previously Fixed Items (Verified in Current Code)

All cycle 9/10 aggregate findings have been addressed:
- AGG-1 from cycle 28 (normalizePage scientific notation): Fixed
- AGG-2 from cycle 28 (thread deletion confirmation): Fixed
- AGG-3 from cycle 28 (moderation controls stale props): Fixed
- AGG-4 from cycle 28 (comment-section silent GET failure): Fixed
- AGG-5 from cycle 28 (aria-label on icon-only buttons): Fixed
- AGG-6 from cycle 28 (compiler client hardcoded English): Fixed
- AGG-7 from cycle 28 (submission overview dialog semantics): Fixed
- AGG-8 from cycle 28 (edit-group raw error): Fixed
- AGG-9 from cycle 28 (unguarded response.json() on discarded-result paths): Fixed in discussion components
- AGG-10 from cycle 28 (vote raw API error): Fixed
- AGG-11 from cycle 28 (group-members success-first pattern): Fixed (but dead .json() call remains)
- AGG-12 from cycle 28 (overlay dialog semantics): Fixed

## Deduped Findings (sorted by severity then signal)

### AGG-1: `problem-submission-form.tsx` compiler run path displays raw API error string — inconsistent with submit path [MEDIUM/HIGH]

**Flagged by:** code-reviewer (CR-1), architect (ARCH-1), critic (CRI-1), verifier (V-2), debugger (DBG-1), tracer (TR-1), designer (DES-1)
**Signal strength:** 7 of 11 review perspectives

**File:** `src/components/problem/problem-submission-form.tsx:185`

**Description:** On the compiler run error path, line 185 displays the raw API error string directly to the user: `toast.error((errorBody as { error?: string }).error ?? tCommon("error"))`. In contrast, the submit error path on line 248 properly uses `toast.error(translateSubmissionError((errorBody as { error?: string }).error))` to map API errors to i18n keys. This is the same class of bug that was fixed across all discussion components in cycle 9 (AGG-4), but was missed in this form.

**Fix:** Replace `(errorBody as { error?: string }).error ?? tCommon("error")` with `translateSubmissionError((errorBody as { error?: string }).error)` on line 185.

---

### AGG-2: Chat widget test-connection endpoint accepts `apiKey` from request body — SSRF risk and misleading UX [HIGH/MEDIUM]

**Flagged by:** code-reviewer (CR-4), security-reviewer (SEC-1), critic (CRI-2), debugger (DBG-3), tracer (TR-2), designer (DES-2)
**Signal strength:** 6 of 11 review perspectives

**Files:**
- `src/lib/plugins/chat-widget/admin-config.tsx:97` (client sends apiKey)
- `src/app/api/v1/plugins/chat-widget/test-connection/route.ts:39` (server uses apiKey from request body)

**Description:** The test-connection endpoint accepts `apiKey` and `model` from the request body and uses them to make outbound API calls to OpenAI, Anthropic, or Google. This has two problems:
1. **Security:** An attacker with admin access (or via CSRF) can make the server issue HTTP requests with attacker-controlled parameters. While CSRF protection and admin capability checks mitigate this, the `model` field for OpenAI/Claude is not validated against a strict pattern, and the `apiKey` should be retrieved from the database.
2. **UX:** The test verifies the key the user just typed, NOT the stored key. If the user changes the key, tests successfully, but doesn't save, the stored key remains the old one.

**Fix:** Remove `apiKey` from the request schema. Retrieve the stored encrypted API key from the database using the `provider` field. Validate `model` against a strict pattern per provider. Add a visual indicator that the test uses the unsaved key (or auto-save before testing).

---

### AGG-3: `group-members-manager.tsx` dead `response.json()` call on remove success path [LOW/MEDIUM]

**Flagged by:** code-reviewer (CR-3), architect (ARCH-2), critic (CRI-3), verifier (V-3), tracer (TR-3)
**Signal strength:** 5 of 11 review perspectives

**File:** `src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx:225`

**Description:** After a successful DELETE, line 225 calls `await response.json().catch(() => ({}))` and discards the result. This is dead code that was partially cleaned up in cycle 9 (AGG-11 fixed the success-first pattern) but the dead `.json()` call was not removed.

**Fix:** Remove line 225.

---

### AGG-4: `apiFetch` JSDoc example shows raw error display pattern — contradicts i18n convention [LOW/LOW]

**Flagged by:** document-specialist (DOC-1)
**Signal strength:** 1 of 11 review perspectives

**File:** `src/lib/api/client.ts:37`

**Description:** The `apiFetch` JSDoc example shows `toast.error((errorBody as { error?: string }).error ?? "Request failed")` which displays the raw API error string. After cycle 9 fixes established i18n-first error handling, this example contradicts the recommended pattern.

**Fix:** Update the JSDoc example to show the i18n-first pattern: `toast.error(errorLabel)` with a `console.error` for the raw API error.

---

### AGG-5: Unguarded `response.json()` on success paths where result IS used — recurring pattern [MEDIUM/MEDIUM]

**Flagged by:** code-reviewer (CR-2), perf-reviewer (PERF-3)
**Signal strength:** 2 of 11 review perspectives

**Files:**
- `src/components/problem/problem-submission-form.tsx:188, 252`
- `src/components/contest/contest-clarifications.tsx:79`
- `src/components/contest/contest-announcements.tsx:56`
- `src/components/problem/accepted-solutions.tsx:78`
- `src/components/contest/invite-participants.tsx:46`
- `src/lib/plugins/chat-widget/admin-config.tsx:104`
- `src/lib/plugins/chat-widget/providers.ts:138, 258, 398`

**Description:** After checking `response.ok`, these files call `await response.json()` without a `.catch()` guard. Unlike the previously fixed AGG-9 instances (where the result was discarded), these calls DO use the result. However, if the server returns a non-JSON body on a 200 response (e.g., due to proxy truncation), `response.json()` throws SyntaxError. The outer catch blocks show a generic error toast even though the request may have succeeded. This is a variant of AGG-9.

**Fix:** Consider wrapping the `.json()` call in a try-catch within the success path, or use a helper function like `tryParseJson(response)` that returns `null` on parse failure.

---

## Security Findings (from security-reviewer)

### SEC-1: Chat widget test-connection SSRF — covered by AGG-2 above

### SEC-2: Plaintext fallback in encryption module — carried from cycle 28 SEC-2 [MEDIUM/HIGH]

**File:** `src/lib/security/encryption.ts:78-81`

**Fix:** Add integrity check or HMAC. Monitor plaintext fallback hits in production.

### SEC-3: `window.location.origin` for URL construction — carried from DEFER-24 [MEDIUM/MEDIUM]

**Files:**
- `src/components/contest/recruiting-invitations-panel.tsx:99`
- `src/components/contest/access-code-manager.tsx:134`
- `src/app/(dashboard)/dashboard/admin/files/file-management-client.tsx:96`
- `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:147`

**Fix:** Use a server-provided `appUrl` config value.

### SEC-4: Raw API error in compiler run path — covered by AGG-1 above

---

## Performance Findings (from perf-reviewer)

No critical performance findings this cycle.

---

## Test Coverage Gaps (from test-engineer)

### TE-1: No unit tests for `problem-submission-form.tsx` [MEDIUM/MEDIUM]

### TE-2: No unit tests for chat-widget admin-config [LOW/MEDIUM]

### TE-3: Encryption module still untested — carried from cycle 28 [MEDIUM/HIGH]

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

## Agent Failures

None. All 11 review perspectives completed successfully.
