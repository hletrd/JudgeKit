# Cycle 7 Aggregate Review

**Date:** 2026-04-20
**Base commit:** 394a40a7
**Review artifacts:** cycle-7-code-reviewer.md, cycle-7-security-reviewer.md, cycle-7-perf-reviewer.md, cycle-7-test-engineer.md, cycle-7-architect.md, cycle-7-debugger.md, cycle-7-critic.md, cycle-7-verifier.md, cycle-7-tracer.md, cycle-7-document-specialist.md

---

## Deduped Findings (sorted by severity then signal)

### AGG-1: `tokenInvalidatedAt` clock-skew undermines session revocation guarantee [HIGH/HIGH]

**Flagged by:** code-reviewer, security-reviewer, debugger, critic, verifier, tracer, architect, document-specialist
**Files:**
- `src/app/api/v1/users/[id]/route.ts:164,185,218,260,466`
- `src/lib/actions/user-management.ts:114,308`
- `src/lib/actions/change-password.ts:75`
- `src/lib/assignments/recruiting-invitations.ts:242,359`
- `src/lib/auth/session-security.ts:26-36`
- `src/proxy.ts:240-274`

**Description:** When a user is deactivated, has their role changed, has their password reset, or a recruiter resets a candidate's password, `tokenInvalidatedAt` is set to `new Date()` (app-server time). The `isTokenInvalidated()` function compares this against the JWT's `authenticatedAtSeconds` (also set via `Date.now()` at login time). If the app server clock changes between JWT issuance and invalidation (e.g., NTP correction), the JWT's `authenticatedAt` could be ahead of `tokenInvalidatedAt`, causing `isTokenInvalidated()` to return `false` for a session that should be revoked. This is the last major security-relevant code path that still uses `new Date()`.

**Concrete failure scenario:**
1. App server clock drifts 10 seconds ahead of DB.
2. User logs in; JWT `authenticatedAt` = 1010 (app time), DB time = 1000.
3. Admin deactivates user; `tokenInvalidatedAt` = `new Date()` = 1010 (app time, DB time 1000).
4. `isTokenInvalidated(1010, 1010)` = `1010 < 1010` = `false`. Session NOT invalidated.
5. Deactivated user continues accessing the system.

**Fix:** Replace all `tokenInvalidatedAt: new Date()` with `tokenInvalidatedAt: await getDbNowUncached()`.

---

### AGG-2: Public contest pages use `new Date()` instead of DB time for contest status [HIGH/HIGH]

**Flagged by:** code-reviewer, security-reviewer, debugger, critic, verifier, tracer
**Files:**
- `src/lib/assignments/public-contests.ts:30,124`

**Description:** Both `getPublicContests()` and `getPublicContestById()` pass `new Date()` to `getContestStatus()`, which determines whether a contest shows as "upcoming", "open", "in_progress", "expired", or "closed". If the app server clock drifts from the DB server, a closed contest could show as "open" on the public page, creating confusing UX where a user sees a contest as open but the API rejects their start attempt.

**Fix:** Replace `new Date()` with `await getDbNow()` in both functions.

---

### AGG-3: Sidebar active-timed-assignments uses `new Date()` for contest status [MEDIUM/HIGH]

**Flagged by:** code-reviewer, critic, verifier
**Files:**
- `src/lib/assignments/active-timed-assignments.ts:15,44`

**Description:** `selectActiveTimedAssignments` defaults to `new Date()` and `getActiveTimedAssignmentsForSidebar` also defaults to `new Date()`. The sidebar could show a contest as active that has actually expired per DB time, or hide a contest that is actually still open.

**Fix:** Use `await getDbNow()` in `getActiveTimedAssignmentsForSidebar` and pass the DB time to `selectActiveTimedAssignments`.

---

### AGG-4: Anti-cheat event `createdAt` uses `new Date()` instead of DB time [MEDIUM/HIGH]

**Flagged by:** code-reviewer, security-reviewer, verifier
**Files:**
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:110,128`

**Description:** The anti-cheat event logging inserts `createdAt: new Date()` while the contest boundary check at lines 63-73 correctly uses `SELECT NOW()`. This creates inconsistent timestamps in the audit trail. The DB time is already fetched at line 63 and can be reused for the `createdAt` values.

**Fix:** Use the already-fetched DB server time (line 63) for `createdAt` in both event inserts.

---

### AGG-5: Invite route stores `redeemedAt` and `enrolledAt` using `new Date()` [MEDIUM/MEDIUM]

**Flagged by:** code-reviewer, security-reviewer
**Files:**
- `src/app/api/v1/contests/[assignmentId]/invite/route.ts:103,115`

**Description:** The invite route stores `redeemedAt: new Date()` and `enrolledAt: new Date()` while the access code redemption path correctly uses DB time. Timestamp inconsistency.

**Fix:** Use `await getDbNowUncached()` for these stored timestamps.

---

### AGG-6: Rejudge route uses `new Date()` for contest-finished check in audit log [LOW/LOW]

**Flagged by:** code-reviewer
**Files:**
- `src/app/api/v1/submissions/[id]/rejudge/route.ts:79`

**Description:** `new Date() > assignment.deadline` comparison uses app-server time against DB-stored deadline. Only affects audit log warning, not access control.

**Fix:** Use `await getDbNowUncached()` for the comparison.

---

### AGG-7: No test coverage for `tokenInvalidatedAt` clock-skew behavior or public contest DB-time usage [MEDIUM/HIGH]

**Flagged by:** test-engineer, critic
**Files:**
- `src/lib/auth/session-security.ts:26-36`
- `src/lib/assignments/public-contests.ts:30,124`
- `src/lib/assignments/active-timed-assignments.ts:15,44`

**Description:** After the `tokenInvalidatedAt` and public contest page fixes, there are no tests verifying that these paths use DB time. A regression back to `new Date()` would go undetected.

**Fix:** Add unit tests for `isTokenInvalidated()` clock-skew scenarios, and integration tests verifying `tokenInvalidatedAt` is set using DB-consistent time. Add tests for public contest page and sidebar DB-time usage.

---

### AGG-8: Non-null assertions on Map.get() results can throw at runtime [LOW/MEDIUM]

**Flagged by:** code-reviewer, debugger
**Files:**
- `src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/student/[userId]/page.tsx:131`
- `src/lib/assignments/submissions.ts:365`
- `src/lib/assignments/contest-scoring.ts:243`

**Description:** Several locations use `map.get(key)!.push(...)` or `map.get(key)!.add(...)` with non-null assertions. Runtime TypeError if key is missing.

**Fix:** Replace with safe access pattern.

---

### AGG-9: SSE connection tracking eviction uses O(n) linear scan [LOW/MEDIUM]

**Flagged by:** perf-reviewer
**Files:**
- `src/app/api/v1/submissions/[id]/events/route.ts:44-55`

**Description:** The `addConnection()` function evicts the oldest entry by iterating through the entire map (O(n)). With `MAX_TRACKED_CONNECTIONS = 1000` and high SSE churn, this could cause performance issues.

**Fix:** Use a min-heap or ordered structure for O(1) eviction of oldest entry.

---

### AGG-10: Problem import button silently swallows JSON parse errors [LOW/HIGH]

**Flagged by:** code-reviewer
**Files:**
- `src/app/(dashboard)/dashboard/problems/problem-import-button.tsx:23`

**Description:** `JSON.parse(text)` is called without a specific try/catch. Generic error for malformed JSON vs server error.

**Fix:** Add specific try/catch around `JSON.parse(text)`.

---

## Previously verified as FIXED (confirmed by verifier)

- Contest detail page clock-skew: FIXED
- Problem detail page clock-skew: FIXED
- Quick-create contest clock-skew: FIXED
- SSE non-null assertion: FIXED
- Access code deadline check: FIXED

## Previously DEFERRED (still valid)

- `submittedAt: new Date()` in submission insert: DEFERRED (cosmetic)
- Display-only `new Date()` in groups page, student dashboard, contests page: DEFERRED (cosmetic)
