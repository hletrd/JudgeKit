# RPF Cycle 28 Review Remediation Plan

**Date:** 2026-04-23
**Base commit:** 63557cc2
**Review artifacts:** All per-agent reviews in `.context/reviews/` + `.context/reviews/_aggregate.md`

## Previously Completed Tasks (Verified in Current Code)

The following tasks from the original April-22 plan are already implemented:

- [x] Task 1: `normalizePage` — uses `parseInt` and `MAX_PAGE = 10000`
- [x] Task 2: Thread deletion confirmation — uses `AlertDialog`
- [x] Task 3: Stale props in moderation controls — `useState` with optimistic updates
- [x] Task 4: Comment-section GET error feedback — has `else { toast.error(...) }`
- [x] Task 5: aria-label on icon-only buttons — recruiting panel and lecture toolbar have `aria-label`
- [x] Task 6: Hardcoded English in compiler client — `defaultValue` removed, i18n keys used
- [x] Task 7: edit-group-dialog error message — default returns `tCommon("error")`
- [x] Task 8: Vote buttons raw API error — uses `apiFetchJson` and `voteFailedLabel`
- [x] Task 9: `.json()` before `!res.ok` — contest-join uses `apiFetchJson`, create-problem-form uses "parse once"
- [x] Task 10: group-members-manager success-first — checks `!response.ok` first
- [x] Task 12: Hardcoded English in proxy — API error code, not user-facing
- [x] Task 13: quick-stats null avgScore — uses proper null check
- [x] Task 14: SubmissionOverview polling when closed — uses `useVisibilityPolling(..., !open)`
- [x] Task 15: Recruiting invitations search race condition — uses `AbortController`

## Tasks (priority order)

### Task A: Internationalize hardcoded English strings in `code-editor.tsx` [MEDIUM]

**From:** AGG-1 (7 reviewers), CR-1, ARCH-1, CRI-1, DES-1, V-1, TR-1, DOC-2
**Severity / confidence:** MEDIUM / MEDIUM
**Files:** `src/components/code/code-editor.tsx:96-97,107,113-114,117`

**Problem:** The code editor has 5 hardcoded English strings in user-facing positions (title, aria-label, visible text, fallback text). This is the only component in the codebase with hardcoded English strings. Korean screen reader users hear English labels.

**Plan:**
1. Add i18n keys for: "Fullscreen (F)", "Exit fullscreen (Esc)", "Code Editor", "Exit", and the combined title string
2. Either use `useTranslations` inside the component or pass label props
3. Since `CodeEditor` is a reusable component used by `CompilerClient` (which already has `useTranslations("compiler")`), pass label props from the parent
4. Add the keys to `en.json` and `ko.json` under the `compiler` namespace
5. Verify all gates pass

**Status:** TODO

---

### Task B: Replace `setInterval` with recursive `setTimeout` in `contest-replay.tsx` [LOW]

**From:** PERF-CARRIED-1, PERF-1, DBG-1, CRI-2, V-3
**Severity / confidence:** LOW / LOW
**File:** `src/components/contest/contest-replay.tsx:77-87`

**Problem:** The auto-play feature uses `setInterval` which can accumulate drift and cause "catch-up" behavior when a background tab regains focus. The codebase convention (countdown-timer, anti-cheat-monitor) uses recursive `setTimeout`.

**Plan:**
1. Replace `setInterval` with recursive `setTimeout` in the auto-play effect
2. Verify all gates pass

**Status:** TODO

---

## Deferred Items

### DEFER-29: Migrate raw route handlers to `createApiHandler` (carried from DEFER-1)

**Reason:** Large refactor requiring careful testing of each route. Not a quick fix.
**Exit criterion:** All manual-auth routes migrated and tested.

### DEFER-30: SSRF via chat widget test-connection endpoint (SEC-1)

**Reason:** Requires API design decision — whether to accept client-supplied API keys or use stored keys only. Affects plugin configuration workflow.
**Severity:** HIGH but requires product decision before implementation.
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
**Reason:** Both components already use the Dialog component from the UI library. Adding `role="dialog"`, `aria-modal`, and explicit focus trap would require customizing the Dialog primitives. The Dialog component already handles most accessibility concerns. The improvement is incremental.
**Severity / confidence:** MEDIUM / LOW
**Exit criterion:** When Dialog accessibility audit is performed across the entire app.

## Progress log

- 2026-04-22: Plan created with 15 tasks and 12 deferred items.
- 2026-04-23: Fresh review completed. 14 of 15 tasks verified as already implemented. 1 new task (code-editor i18n) identified. Plan updated to reflect current state. 2 active tasks (A and B), DEFER-41 added.
