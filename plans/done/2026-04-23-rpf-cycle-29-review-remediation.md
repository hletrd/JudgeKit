# RPF Cycle 29 Review Remediation Plan

**Date:** 2026-04-23
**Base commit:** a51772ae
**Review artifacts:** All per-agent reviews in `.context/reviews/` + `.context/reviews/_aggregate.md`

## Previously Completed Tasks (Verified in Current Code)

All cycle 28 tasks are complete:
- [x] Task A: Code editor i18n — Fixed in commit 5c387c7b
- [x] Task B: Contest replay setInterval — Fixed in commit 9cc30d51

## Tasks (priority order)

### Task A: Internationalize hardcoded English answer text in clarification quick-answer buttons [MEDIUM/HIGH]

**From:** AGG-1 (8 reviewers), CR-1, ARCH-1, CRI-1, V-1, DBG-1, TR-1, DES-1, TE-1
**Severity / confidence:** MEDIUM / HIGH
**Files:** `src/components/contest/contest-clarifications.tsx:290,293,296`

**Problem:** The quick-answer buttons pass hardcoded English strings ("Yes", "No", "No comment") as the answer content to the API. These strings are persisted to the database and shown to all participants regardless of locale. The `answerType` field already encodes the semantic meaning.

**Plan:**
1. Add i18n keys to `messages/en.json` under `contests.clarifications`: `quickYesAnswer`, `quickNoAnswer`, `quickNoCommentAnswer`
2. Add Korean translations to `messages/ko.json`
3. Replace hardcoded strings on lines 290, 293, 296 with `t("quickYesAnswer")`, `t("quickNoAnswer")`, `t("quickNoCommentAnswer")`
4. Verify all gates pass

**Status:** DONE (commit 7e0b3bb8)

---

### Task B: Sanitize chat widget provider error messages to prevent API response body leakage [MEDIUM/MEDIUM]

**From:** AGG-2 (4 reviewers), SEC-1, SEC-2, V-2, TR-2
**Severity / confidence:** MEDIUM / MEDIUM
**Files:**
- `src/lib/plugins/chat-widget/providers.ts:101` — OpenAI stream
- `src/lib/plugins/chat-widget/providers.ts:134-135` — OpenAI chatWithTools
- `src/lib/plugins/chat-widget/providers.ts:202` — Claude stream

**Problem:** Provider `stream()` and `chatWithTools()` methods throw errors containing the full API response body. The response body from OpenAI/Claude can contain sensitive information (account IDs, rate limit details, internal errors).

**Plan:**
1. In each provider method, replace `throw new Error(`...API error ${status}: ${text}`)` with `throw new Error(`...API error ${status}`)`
2. Log the full response body server-side using `logger.warn(...)` before throwing
3. Import `logger` from `@/lib/logger` if not already imported
4. Verify all gates pass

**Status:** DONE (commit 93beb49d)

---

### Task C: Migrate `useVisibilityPolling` from `setInterval` to recursive `setTimeout` [LOW/MEDIUM]

**From:** AGG-3 (4 reviewers), PERF-1, ARCH-2, CRI-2, DBG-2
**Severity / confidence:** LOW / MEDIUM
**File:** `src/hooks/use-visibility-polling.ts:55`

**Problem:** The shared polling hook uses `setInterval`, which is inconsistent with the codebase convention of using recursive `setTimeout` for timer-based effects. `setInterval` can cause catch-up behavior in background tabs.

**Plan:**
1. Replace `intervalId = setInterval(tick, intervalMs)` with a recursive `setTimeout` pattern
2. The `clearPollingInterval` helper should be renamed to `clearPollingTimer` and clear the timeout
3. In the recursive pattern, schedule the next tick only after the current one fires
4. Verify all gates pass

**Status:** DONE (commit 60f24288)

---

### Task D: Add `aria-label` to progress bar in active-timed-assignment sidebar [LOW/LOW]

**From:** AGG-4, DES-2
**Severity / confidence:** LOW / LOW
**File:** `src/components/layout/active-timed-assignment-sidebar-panel.tsx:172`

**Problem:** The progress bar div has `role="progressbar"` with `aria-valuenow` but no `aria-label`. Screen readers announce the percentage without context.

**Plan:**
1. Add `aria-label={tNav("progress")}` to the progress bar div on line 172
2. Verify all gates pass

**Status:** DONE (commit 3530a989)

---

## Deferred Items

### DEFER-29: Migrate raw route handlers to `createApiHandler` (carried from DEFER-1)

**Reason:** Large refactor requiring careful testing of each route. Not a quick fix.
**Exit criterion:** All manual-auth routes migrated and tested.

### DEFER-30: SSRF via chat widget test-connection endpoint (SEC-1)

**Reason:** Already mitigated — uses stored keys, model validation applied. Requires API design decision for further hardening.
**Severity:** HIGH but mitigated.
**Exit criterion:** Product decision made on test-connection API design; implementation follows.

### DEFER-31: Performance P0 fixes (deregister race, unbounded analytics, unbounded similarity check, scoring full-table scan)

**Reason:** These are production performance issues requiring careful benchmarking and testing.
**Severity:** CRITICAL but requires production testing.
**Exit criterion:** Each P0 fix benchmarked and tested in staging.

### DEFER-32: SubmissionStatus type split (DOC-1)

**Reason:** Type unification affects the Rust worker, database schema, and all status consumers.
**Exit criterion:** Unified SubmissionStatus type with matching DB values, Rust worker, and TypeScript types.

### DEFER-33: Plaintext token columns in schema (CRIT-03, CRIT-04)

**Reason:** Requires database migration to drop columns.
**Exit criterion:** Migration to drop `secretToken` on judgeWorkers and `token` on recruitingInvitations.

### DEFER-34: `users.isActive` nullable boolean three-state trap (CRIT-06)

**Reason:** Schema change requires migration.
**Exit criterion:** `.notNull()` added to schema and migration to set null values to true.

### DEFER-35: CSRF documentation mismatch (DOC-5)

**Reason:** Documentation-only fix, no code change needed.
**Exit criterion:** `docs/api.md` updated with correct CSRF mechanism description.

### DEFER-36: Security module test coverage gaps (TE-1)

**Reason:** 6 of 17 security modules have no tests.
**Exit criterion:** Unit tests for password-hash, derive-key, encryption, in-memory-rate-limit, hcaptcha, server-actions.

### DEFER-37: Hook test coverage gaps (TE-2)

**Reason:** 5 of 7 hooks have no tests.
**Exit criterion:** Unit tests for use-submission-polling, use-visibility-polling, use-unsaved-changes-guard, use-keyboard-shortcuts, use-editor-compartments.

### DEFER-38: Unguarded `response.json()` on success paths — systemic fix (AGG-9)

**Reason:** 6+ files need `.catch()` guards.
**Exit criterion:** All success-path `.json()` calls have `.catch()` guards. Consider ESLint rule to enforce.

### DEFER-39: Encryption plaintext fallback (SEC-2, CR-28-04)

**Reason:** Requires API design decision on integrity checking approach.
**Exit criterion:** HMAC integrity check added or plaintext fallback removed after migration period.

### DEFER-40: Proxy auth cache TTL upper bound (SEC-3)

**Reason:** Configuration change with operational implications.
**Exit criterion:** Hard upper bound (10s) added to AUTH_CACHE_TTL_MS parsing.

### DEFER-41: Task 11 from April-22 plan — dialog semantics for submission overview and anti-cheat (AGG-7, AGG-12)

**Citations:**
- `src/components/lecture/submission-overview.tsx:138-207`
- `src/components/exam/anti-cheat-monitor.tsx:252-277`
**Reason:** Both components already use the Dialog component from the UI library. The improvement is incremental.
**Severity / confidence:** MEDIUM / LOW
**Exit criterion:** When Dialog accessibility audit is performed across the entire app.

## Progress log

- 2026-04-23: Plan created with 4 tasks and 13 deferred items.
- 2026-04-23: All 4 tasks completed. Task A (clarification i18n) — commit 7e0b3bb8. Task B (provider error sanitization) — commit 93beb49d. Task C (useVisibilityPolling setTimeout) — commit 60f24288. Task D (aria-label on progress bar) — commit 3530a989. All gates passed (ESLint, next build, vitest unit 294/294 pass, vitest component 22 pre-existing failures unrelated to changes).
