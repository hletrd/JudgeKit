# Cycle 19 Debugger Findings

**Date:** 2026-04-19
**Reviewer:** Latent bug surface, failure modes, regressions
**Base commit:** 301afe7f

---

## Findings

### F1: Admin migrate import route missing `needsRehash` — inconsistent with backup/export routes

- **File**: `src/app/api/v1/admin/migrate/import/route.ts:58,143`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: This is a carry-forward from cycle 18 (AGG-3). The import route has two code paths (form-data and JSON) that both call `verifyPassword` but discard `needsRehash`. The backup and export routes were fixed in cycle 18b. The restore route also discards `needsRehash`. This inconsistency is a latent bug: a developer looking at the backup route would assume all admin routes handle rehashing, but they don't.
- **Concrete failure scenario**: An admin with a bcrypt hash uses the import route to import test data. The password is verified successfully, but `needsRehash` is discarded. The admin's hash remains bcrypt. If they never use the main login or the backup/export routes, their hash is never upgraded.
- **Suggested fix**: Add `needsRehash` handling to both paths in the import route and the restore route, matching the pattern in backup and export.

### F2: `updateRecruitingInvitation` uses `Record<string, unknown>` — potential for silent runtime errors

- **File**: `src/lib/assignments/recruiting-invitations.ts:193`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: The `updateRecruitingInvitation` function builds updates as `Record<string, unknown>` and then spreads them with `{ ...updates, status: data.status }`. If the `updates` object contains a key that doesn't match a Drizzle column, the database update will fail at runtime with an error that's hard to diagnose because the type system didn't catch it.
- **Concrete failure scenario**: A developer adds `updateType: "manual"` to the updates object, expecting it to be stored. The Drizzle update fails because `updateType` is not a column on `recruitingInvitations`. The error message from Drizzle is opaque because the key was dynamically constructed.
- **Suggested fix**: Use a typed updates object (`Partial<typeof recruitingInvitations.$inferInsert>`) or the `withUpdatedAt()` pattern.

### F3: `exam-sessions.ts` uses `new Date()` for deadline calculation — clock skew for windowed exams

- **File**: `src/lib/assignments/exam-sessions.ts:49,78-82`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: `startExamSession` calculates `personalDeadline` using `now.getTime() + durationMs` where `now = new Date()`. This is JS-side time. The assignment's `startsAt` and `deadline` come from the database. In distributed deployments, the app server clock can differ from the DB server clock, causing the personal deadline to be inconsistent with the assignment's configured deadline.
- **Concrete failure scenario**: App server clock is 5 seconds ahead of DB. A student starts an exam. The personal deadline is calculated as T_app + 60min, but the assignment deadline from the DB is T_db + 60min. The personal deadline is 5 seconds later than the assignment deadline, allowing the student 5 extra seconds.
- **Suggested fix**: Use SQL `NOW()` for the `startedAt` and calculate the personal deadline in the SQL query, or at minimum use the DB server's current time for the calculation.

---

## Verified Safe

### VS1: SSE route has proper `.catch()` for async IIFEs
- **File**: `src/app/api/v1/submissions/[id]/events/route.ts:406-415`
- The re-auth IIFE and `sendTerminalResult` both have proper `.catch()` handlers that close the connection on error.

### VS2: `handleSignOutWithCleanup` correctly resets `isSigningOut` on failure
- **File**: `src/lib/auth/sign-out.ts:84-87`
- The error handler resets the loading state so the user can retry.

### VS3: Docker container cleanup is properly fire-and-forget with error handling
- **File**: `src/lib/compiler/execute.ts:395,407`
- Container cleanup uses `.catch(() => {})` which is appropriate for best-effort cleanup.
