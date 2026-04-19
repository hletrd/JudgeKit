# Cycle 16 Review Remediation Plan

**Date:** 2026-04-19
**Source:** `.context/reviews/cycle-16-code-reviewer.md` and `.context/reviews/cycle-16-aggregate.md`
**Status:** In Progress

---

## MEDIUM Priority

### M1: Reduce contest replay concurrency from 4 to 2 to prevent DB pool starvation
- **File**: `src/lib/assignments/contest-replay.ts:61`
- **Status**: DONE (commit 995be7fe)
- **Plan**:
  1. Change `pLimit(4)` to `pLimit(2)` at line 61
  2. Add a comment explaining the rationale: each snapshot computation runs up to 3 SQL queries, so pLimit(2) = max 6 concurrent queries, which is well within a 20-connection pool even with multiple replays
  3. Verify the replay tests still pass
- **Exit criterion**: `pLimit(2)` used instead of `pLimit(4)`. Comment explains the connection pool sizing rationale.

### M2: Fix `resetRecruitingInvitationAccountPassword` to set `mustChangePassword: true`
- **File**: `src/lib/assignments/recruiting-invitations.ts:237`
- **Status**: DONE (commit 3d879777)
- **Plan**:
  1. Change `mustChangePassword: false` to `mustChangePassword: true` at line 237
  2. Add a code comment explaining why: defense-in-depth in case session invalidation has a gap
  3. Verify that the redeem flow still works (the `redeemRecruitingToken` function handles the `ACCOUNT_PASSWORD_RESET_REQUIRED_KEY` flag, which prompts for a new password regardless of `mustChangePassword`)
  4. Run the recruiting invitation tests
- **Exit criterion**: `mustChangePassword: true` is set in the reset function. The redeem flow still works correctly.

### M3: Fix `PublicHeader.handleSignOut` error handling — add try/catch to reset `isSigningOut` on failure
- **File**: `src/components/layout/public-header.tsx:183-186`
- **Status**: DONE (commit 89f0b4f9)
- **Source**: AGG-1 (cycle 16 aggregate)
- **Plan**:
  1. Wrap `await signOut({ callbackUrl: "/login" })` in a try/catch block
  2. In the catch handler, reset `isSigningOut` to `false` so the user can retry
  3. Optionally show an error toast via `toast.error()`
  4. Match the pattern already used in `AppSidebar.handleSignOut` (commit 50f84172)
- **Exit criterion**: `isSigningOut` is reset on `signOut()` failure. User can retry sign-out without refreshing.

### M4: Fix `AppSidebar` "ADMINISTRATION" label `tracking-wider` to be locale-conditional
- **File**: `src/components/layout/app-sidebar.tsx:290`
- **Status**: DONE (commit 39593760)
- **Source**: AGG-2 (cycle 16 aggregate), CLAUDE.md Korean letter-spacing rule
- **Plan**:
  1. Import `useLocale` from `next-intl` in `app-sidebar.tsx`
  2. Get the current locale with `const locale = useLocale()`
  3. Apply `tracking-wider` conditionally: `className={... + (locale !== "ko" ? " tracking-wider" : "")}`
  4. Update the existing comment to note the locale-conditional behavior
- **Exit criterion**: `tracking-wider` is only applied when locale is not Korean. CLAUDE.md compliance verified.

---

## LOW Priority

### L1: Add failure backoff to `computeContestRanking` stale-while-revalidate
- **File**: `src/lib/assignments/contest-scoring.ts:101-113`
- **Status**: DONE (commit 4d94adfe)
- **Exit criterion**: Background refresh is not re-triggered within 5 seconds of a failure.

### L2: Make `isAdmin()` module-private like `isInstructor()`
- **File**: `src/lib/api/auth.ts:97`, `src/lib/api/handler.ts:191`
- **Status**: DONE (commit 042c82f9)
- **Exit criterion**: `isAdmin` is not exported from any module. All callers use `isAdminAsync()`.

### L3: Add per-user rate limit to code snapshot endpoint
- **File**: `src/app/api/v1/code-snapshots/route.ts`
- **Status**: DONE (commit 0db6a4c3)
- **Exit criterion**: Code snapshot endpoint has per-user rate limiting in addition to IP-based limiting.

### L4: Fix anti-cheat heartbeat gap detection to use most recent heartbeats
- **File**: `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:195`
- **Status**: DONE (commit c56e5175)
- **Exit criterion**: Heartbeat gap detection uses the most recent 5000 heartbeats instead of the oldest.

### L5: Fix `getInvitationStats` to use atomic single-query aggregation
- **File**: `src/lib/assignments/recruiting-invitations.ts:260-295`
- **Status**: DONE (commit 3d879777)
- **Exit criterion**: `getInvitationStats` uses a single SQL query with conditional aggregation. No negative pending count possible.

### L6: Parse `CreatedAt` from `docker ps` output instead of making redundant `docker inspect` calls
- **File**: `src/lib/compiler/execute.ts:746-786`
- **Status**: DONE (commit 7966ca69)
- **Source**: AGG-4 (cycle 16 aggregate), carried from AGG-8 (cycle 15)
- **Plan**:
  1. Change the destructuring from `const [container, status] = line.split("\t")` to `const [container, status, createdAtStr] = line.split("\t")`
  2. When `statusLower.startsWith("up")` and `createdAtStr` is present, parse it directly instead of calling `docker inspect`
  3. Only fall back to `docker inspect` if the `createdAtStr` column is empty or cannot be parsed
  4. Add a comment explaining the optimization
- **Exit criterion**: No redundant `docker inspect` calls for containers where `CreatedAt` is available in `docker ps` output.

### L7: Extract shared sign-out utility for PublicHeader and AppSidebar
- **File**: `src/components/layout/public-header.tsx:183-186`, `src/components/layout/app-sidebar.tsx:229-245`
- **Status**: DONE (commit 39593760)
- **Source**: AGG-6 (cycle 16 aggregate)
- **Plan**:
  1. Create a shared `handleSignOutWithCleanup` utility function in a new file or an existing shared module (e.g., `src/lib/auth/sign-out.ts`)
  2. The utility should: (a) set `isSigningOut` state, (b) clear localStorage/sessionStorage for known app keys, (c) call `signOut()`, (d) reset `isSigningOut` on failure
  3. Replace the inline implementations in both PublicHeader and AppSidebar with calls to the shared utility
  4. For AGG-3 (localStorage.clear() clears all origin), use targeted key removal with a namespace prefix (e.g., keys starting with `jk_` or known specific keys like `source-draft-*`)
- **Exit criterion**: Both components use a shared sign-out utility. localStorage/sessionStorage clearing is targeted, not blanket.

### L8: Remove redundant JS-side deadline checks in `redeemRecruitingToken`
- **File**: `src/lib/assignments/recruiting-invitations.ts:405,440`
- **Status**: DONE (commit b42a7fe4)
- **Source**: AGG-7 (cycle 16 aggregate)
- **Plan**:
  1. Remove the `if (assignment.deadline && assignment.deadline < new Date())` checks at lines 405 and 440
  2. The SQL atomic claim step at line 497 already validates the deadline via `NOW()`, which is the authoritative check
  3. Add a comment explaining why the JS check is omitted: to avoid clock skew between app server and DB server
  4. Verify that the existing "contestClosed" error is still returned via the SQL path when appropriate
- **Exit criterion**: No `new Date()` deadline comparisons in `redeemRecruitingToken`. Deadline enforcement relies solely on the SQL atomic check.

### L9: Extract SSE terminal-state-fetch into a shared helper
- **File**: `src/app/api/v1/submissions/[id]/events/route.ts:316-428`
- **Status**: DONE (commit 117bd143)
- **Source**: AGG-8 (cycle 16 aggregate)
- **Plan**:
  1. Extract the terminal-state handling (fetch full submission, sanitize, enqueue result event, close) into a helper function
  2. Call the helper from both the re-auth IIFE path and the fast path
  3. Ensure the helper properly checks `closed` before enqueuing and closing
  4. Verify SSE tests still pass
- **Exit criterion**: Terminal-state handling logic exists in a single helper function. No duplicate code paths.

---

## Deferred Items

| Finding | Severity | Reason | Exit Criterion |
|---------|----------|--------|----------------|
| AGG-5 (ri_token_idx unique index on deprecated token column) | LOW | Requires a DB migration; token column is always null today so the index has zero operational impact | Re-open if token column is repurposed or if migration tooling is available |
| AGG-4(c15) (no test coverage for API rate-limiting functions) | MEDIUM | Test setup requires mocking execTransaction and the sidecar; significant effort for stable tests | Re-open when dedicated rate-limit test infrastructure is available |
