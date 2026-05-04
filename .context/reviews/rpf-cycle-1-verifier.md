# Verifier Review — RPF Cycle 3 (2026-05-04)

**Reviewer:** verifier
**HEAD reviewed:** `4cd03c2b`
**Scope:** Evidence-based correctness check of changes since `988435b5`.

---

## Prior cycle status

- **C1-VE-1 (password validation code contradicts documented policy):** RESOLVED — `password.ts` now only checks minimum length, matching AGENTS.md policy.
- **C1-VE-2 (carry-forward deferred items):** CARRY — deferred items remain valid.

---

## Evidence-based correctness checks

### Password validation vs AGENTS.md (re-verification)

**Claim (AGENTS.md):** "Password validation MUST only check minimum length — exactly 8 characters minimum, no other rules."

**Actual code (`src/lib/security/password.ts`):**
- Line 13: checks `password.length < FIXED_MIN_PASSWORD_LENGTH` -- matches policy
- No other checks present

**Verdict:** Code NOW matches the documented policy. C1-VE-1 fully resolved.

### CSRF validation on recruiting validate endpoint

**Claim:** The recruiting validate endpoint has CSRF protection.

**Verified:** `src/app/api/v1/recruiting/validate/route.ts:20-21` calls `validateCsrf(req)` and returns the error if present. The `validateCsrf` function in `src/lib/security/csrf.ts` checks `X-Requested-With`, `Sec-Fetch-Site`, and `Origin` headers. Correct.

### SQL-level moderation filtering correctness

**Claim:** The `listModerationDiscussionThreads` function correctly filters by scope and state at the SQL level.

**Verified:** `src/lib/discussions/data.ts:270-287`:
- Scope filter: `eq(discussionThreads.scopeType, scope)` when scope !== "all". Correct.
- State "locked": `isNotNull(discussionThreads.lockedAt)`. Correct.
- State "pinned": `isNotNull(discussionThreads.pinnedAt)`. Correct.
- State "open": `isNull(discussionThreads.lockedAt)` — correctly means "not locked" regardless of pin status. Correct.

### performance.now() migration

**Claim:** `performance.now()` is used for yield timing in code-similarity.ts instead of `Date.now()`.

**Verified:** `src/lib/assignments/code-similarity.ts:281,302-304` — `lastYield` initialized with `performance.now()`, yield check uses `performance.now() - lastYield > YIELD_INTERVAL_MS`. Correct.

---

## Findings

### C3-VE-1: [INFO] All new changes verified as correct

- CSRF validation on recruiting validate endpoint: correct.
- SQL-level moderation filtering: correct.
- performance.now() migration: correct.
- ConditionalHeader admin detection: correct.
- i18n additions for contest metadata: correct.

### C3-VE-2: [INFO] Carry-forward deferred items verified as still deferred

- All previously deferred items remain accurately described in the backlog.
- No deferred items have been silently resolved or silently worsened.
