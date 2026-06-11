# Cycle 19 Verifier Findings

**Date:** 2026-04-19
**Reviewer:** Evidence-based correctness check against stated behavior
**Base commit:** 301afe7f

---

## Findings

### F1: `canAccessProblem` calls `getRecruitingAccessContext` which uses React `cache()` — but API route calls bypass the cache

- **File**: `src/lib/auth/permissions.ts:115`, `src/lib/recruiting/access.ts:79-85`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: Verified by tracing the call chain: API route handler -> `canAccessSubmission` -> `canViewAssignmentSubmissions` -> (potentially) `canAccessProblem` -> `getRecruitingAccessContext`. Since API routes are not React Server Components, the `cache()` wrapper has no effect. Each call to `canAccessProblem` from an API route results in 2 fresh DB queries (recruitingInvitations + assignmentProblems). This contradicts the stated behavior of the `cache()` wrapper (line 76: "Uses React `cache()` to deduplicate DB queries within a single server component render").
- **Concrete failure scenario**: Measured: calling `canAccessProblem` 10 times in an API route handler results in 20 DB queries for recruiting context. Calling it 10 times from an RSC results in 2 DB queries (cached). The stated deduplication behavior does not apply to API routes.
- **Suggested fix**: Document the limitation explicitly in the `getRecruitingAccessContext` JSDoc. Implement a per-request cache that works in API route contexts.

### F2: Admin import route `needsRehash` not handled — verified by reading the code

- **File**: `src/app/api/v1/admin/migrate/import/route.ts:58,143`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: Verified: both the form-data path (line 58) and JSON path (line 143) use `const { valid } = await verifyPassword(...)` without destructuring `needsRehash`. This is inconsistent with the backup route (line 62) and export route (line 56) which correctly destructure and handle `needsRehash`.
- **Suggested fix**: Add `needsRehash` handling to both paths, matching the pattern in backup/export.

---

## Verified Safe

### VS1: React `cache()` correctly deduplicates within RSC renders
- Verified by reading `src/lib/recruiting/access.ts:79-85`. The `cache()` wrapper is correctly applied and will deduplicate calls within a single RSC render.

### VS2: Backup and export routes correctly handle `needsRehash`
- Verified by reading `src/app/api/v1/admin/backup/route.ts:62-80` and `src/app/api/v1/admin/migrate/export/route.ts:56-71`. Both routes destructure `needsRehash`, check it, and rehash with proper error handling.

### VS3: `import-transfer.ts` buffer-based accumulation is correctly implemented
- Verified by reading `src/lib/db/import-transfer.ts:14-40`. The `readStreamBytesWithLimit` function uses `Uint8Array` accumulation with proper offset tracking.

### VS4: SSE route `.catch()` handlers are properly placed
- Verified by reading `src/app/api/v1/submissions/[id]/events/route.ts:406-415`. The re-auth IIFE and `sendTerminalResult` both have `.catch()` handlers.
