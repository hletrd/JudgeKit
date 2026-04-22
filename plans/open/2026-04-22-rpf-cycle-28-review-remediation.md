# RPF Cycle 28 Review Remediation Plan

**Date:** 2026-04-23
**Base commit:** ca62a45d
**Review artifacts:** All rpf-cycle-28-*.md reviews in `.context/reviews/`

## Tasks (priority order)

### Task 1: Fix `normalizePage` — use `parseInt` and add upper bound [HIGH]

**From:** AGG-1 (7 reviewers), CR-28-03, BUG-14, PERF-4, CRI-5, V-1, TR-2, SYS-2
**File:** `src/lib/pagination.ts:6`
**Fix:** Replace `Number()` with `parseInt(value, 10)`, add upper bound of 10000

---

### Task 2: Add confirmation dialog to thread deletion [HIGH]

**From:** AGG-2 (5 reviewers), D-11, D-25, CRI-1, V-4, TR-4, SYS-3
**File:** `src/components/discussions/discussion-thread-moderation-controls.tsx:92`
**Fix:** Wrap delete button in `DestructiveActionDialog` or `AlertDialog`, consistent with post deletion

---

### Task 3: Fix stale props in moderation controls — add optimistic state [MEDIUM]

**From:** AGG-3 (5 reviewers), BUG-01, CR-5, CRI-2, V-2, TR-1
**File:** `src/components/discussions/discussion-thread-moderation-controls.tsx:86-92`
**Fix:** Track `isLocked`/`isPinned` as local state initialized from props with optimistic updates

---

### Task 4: Add error feedback for non-OK responses in comment-section GET [MEDIUM]

**From:** AGG-4 (6 reviewers), BUG-12, CR-6, CRI-3, V-3, SYS-6, TR-3
**File:** `src/app/(dashboard)/dashboard/submissions/[id]/_components/comment-section.tsx:42-52`
**Fix:** Add `else { toast.error(tComments("loadError")); }`

---

### Task 5: Add `aria-label` to icon-only buttons [MEDIUM]

**From:** AGG-5 (3 reviewers), D-01, D-02, D-03, D-12, CRI-6, SYS-4
**Files:**
- `src/components/contest/recruiting-invitations-panel.tsx:525-586`
- `src/components/lecture/lecture-toolbar.tsx:135-180`
- `src/components/code/code-editor.tsx:92-117`
**Fix:** Add `aria-label` to all icon-only buttons alongside existing `title` attributes

---

### Task 6: Internationalize hardcoded English strings in compiler client [MEDIUM]

**From:** AGG-6 (4 reviewers), D-23, D-24, DOC-1, DOC-2, CRI-7, SYS-5
**File:** `src/components/code/compiler-client.tsx:100,106,112,90`
**Fix:** Replace "Show full output", "(empty)", "... (output truncated)", and `TC ${index}` with i18n keys

---

### Task 7: Fix `edit-group-dialog.tsx` error message leak [MEDIUM]

**From:** AGG-8 (3 reviewers), CR-3, CRI-4, V-6
**File:** `src/app/(dashboard)/dashboard/groups/edit-group-dialog.tsx:66`
**Fix:** Add `SyntaxError` check or always return generic error message in default case

---

### Task 8: Fix `discussion-vote-buttons.tsx` raw API error display [MEDIUM]

**From:** AGG-10 (1 reviewer but high confidence), V-5
**File:** `src/components/discussions/discussion-vote-buttons.tsx:46`
**Fix:** Replace `toast.error((errorBody as ...).error ?? voteFailedLabel)` with `toast.error(voteFailedLabel)` and log raw error to console only

---

### Task 9: Fix `.json()` before `!res.ok` pattern in contest-join and problem-create [HIGH]

**From:** CR-28-01, CR-28-02
**Files:**
- `src/app/(dashboard)/dashboard/contests/join/contest-join-client.tsx:44-46`
- `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:422-424`
**Fix:** Check `res.ok` first before calling `.json()`

---

### Task 10: Fix `group-members-manager.tsx` success-first pattern in remove handler [LOW]

**From:** AGG-11 (4 reviewers), BUG-13, CR-2, V-7, CRI-10
**File:** `src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx:219-222`
**Fix:** Check `response.ok` first, then parse JSON

---

### Task 11: Add dialog semantics to submission overview and anti-cheat privacy notice [MEDIUM]

**From:** AGG-7, AGG-12, D-04, D-05, CRI-8, CRI-9
**Files:**
- `src/components/lecture/submission-overview.tsx:138-207`
- `src/components/exam/anti-cheat-monitor.tsx:252-277`
**Fix:** Add `role="dialog"`, `aria-modal`, focus trap, and Escape key handling, or use Dialog component

---

### Task 12: Fix hardcoded English string in proxy middleware [MEDIUM]

**From:** CRIT-02
**File:** `src/proxy.ts:311`
**Fix:** Replace `"Password change required"` with `"mustChangePassword"` key

---

### Task 13: Fix `ContestQuickStats` null avgScore becoming 0 [MEDIUM]

**From:** CR-28-07
**File:** `src/components/contest/contest-quick-stats.tsx:55-58`
**Fix:** Use type-aware check instead of `Number(null)` double-wrapping

---

### Task 14: Fix `SubmissionOverview` polling when dialog is closed [MEDIUM]

**From:** CR-28-06
**File:** `src/components/lecture/submission-overview.tsx:123`
**Fix:** Conditionally mount or pass paused flag to `useVisibilityPolling`

---

### Task 15: Fix recruiting invitations search race condition [MEDIUM]

**From:** V-4
**File:** `src/components/contest/recruiting-invitations-panel.tsx:112-148`
**Fix:** Debounce search or use `AbortController` to cancel stale fetches

## Deferred Items

### DEFER-29: Migrate raw route handlers to `createApiHandler` (carried from DEFER-1)

**Reason:** Large refactor requiring careful testing of each route. Not a quick fix.
**Exit criterion:** All manual-auth routes migrated and tested.

### DEFER-30: SSRF via chat widget test-connection endpoint (SEC-1)

**Reason:** Requires API design decision — whether to accept client-supplied API keys or use stored keys only. Affects plugin configuration workflow.
**Severity:** HIGH but requires product decision before implementation.
**Exit criterion:** Product decision made on test-connection API design; implementation follows.

### DEFER-31: Performance P0 fixes (deregister race, unbounded analytics, unbounded similarity check, scoring full-table scan)

**Reason:** These are production performance issues requiring careful benchmarking and testing. The deregister race (P0-1) is the most critical and should be prioritized, but all require DB-level changes with migration considerations.
**Severity:** CRITICAL but requires production testing.
**Exit criterion:** Each P0 fix benchmarked and tested in staging.

### DEFER-32: SubmissionStatus type split (DOC-1)

**Reason:** Type unification affects the Rust worker, database schema, and all status consumers. Requires coordinated changes across the stack.
**Exit criterion:** Unified SubmissionStatus type with matching DB values, Rust worker, and TypeScript types.

### DEFER-33: Plaintext token columns in schema (CRIT-03, CRIT-04)

**Reason:** Requires database migration to drop columns. Must verify no legacy code paths still write to these columns.
**Exit criterion:** Migration to drop `secretToken` on judgeWorkers and `token` on recruitingInvitations.

### DEFER-34: `users.isActive` nullable boolean three-state trap (CRIT-06)

**Reason:** Schema change requires migration. All existing rows with null must be updated.
**Exit criterion:** `.notNull()` added to schema and migration to set null values to true.

### DEFER-35: CSRF documentation mismatch (DOC-5)

**Reason:** Documentation-only fix, no code change needed.
**Exit criterion:** `docs/api.md` updated with correct CSRF mechanism description.

### DEFER-36: Security module test coverage gaps (TE-1)

**Reason:** 6 of 17 security modules have no tests. Writing tests is high priority but time-consuming.
**Exit criterion:** Unit tests for password-hash, derive-key, encryption, in-memory-rate-limit, hcaptcha, server-actions.

### DEFER-37: Hook test coverage gaps (TE-2)

**Reason:** 5 of 7 hooks have no tests.
**Exit criterion:** Unit tests for use-submission-polling, use-visibility-polling, use-unsaved-changes-guard, use-keyboard-shortcuts, use-editor-compartments.

### DEFER-38: Unguarded `response.json()` on success paths — systemic fix (AGG-9)

**Reason:** 6+ files need `.catch()` guards. This is a recurring anti-pattern that should be fixed systematically, possibly with a lint rule.
**Exit criterion:** All success-path `.json()` calls have `.catch()` guards. Consider ESLint rule to enforce.

### DEFER-39: Encryption plaintext fallback (SEC-2, CR-28-04)

**Reason:** Requires API design decision on integrity checking approach. Backward compatibility concerns.
**Exit criterion:** HMAC integrity check added or plaintext fallback removed after migration period.

### DEFER-40: Proxy auth cache TTL upper bound (SEC-3)

**Reason:** Configuration change with operational implications. Needs coordination with deployment.
**Exit criterion:** Hard upper bound (10s) added to AUTH_CACHE_TTL_MS parsing.
