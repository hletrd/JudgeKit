# Cycle 8 Code Review

**Date:** 2026-04-20
**Reviewer:** code-reviewer
**Base commit:** ddffef18

## Findings

### CR-1: Judge poll route uses `new Date()` for `judgeClaimedAt` and `judgedAt` — clock-skew inconsistency [MEDIUM/HIGH]

**File:** `src/app/api/v1/judge/poll/route.ts:75,142`
**Description:** The judge poll route sets `judgeClaimedAt: new Date()` (line 75) and `judgedAt: new Date()` (line 142) using the app server clock. Other timestamp fields that affect access control or submission state (e.g., `tokenInvalidatedAt`, `submittedAt` in exam sessions) have been migrated to use `getDbNowUncached()` to avoid clock skew. The `judgedAt` timestamp is used in contest deadline comparisons and submission ordering. If the app server clock drifts ahead, a submission could be recorded as judged after a contest deadline even though it was actually judged before.
**Concrete failure scenario:** A contest submission is judged at 11:59 PM DB time, but the app server clock is 2 minutes ahead, recording `judgedAt` as 12:01 AM. This could incorrectly flag a submission as late.
**Fix:** Replace `new Date()` with `await getDbNowUncached()` for both `judgeClaimedAt` and `judgedAt`.
**Confidence:** HIGH

### CR-2: Judge deregister route uses `new Date()` for `deregisteredAt` [LOW/MEDIUM]

**File:** `src/app/api/v1/judge/deregister/route.ts:50`
**Description:** `deregisteredAt: new Date()` uses the app server clock. While deregistration timestamps are not used in access-control comparisons, they could be compared with `lastHeartbeatAt` (which also uses `new Date()`) to determine worker staleness windows. Both timestamps should use a consistent time source.
**Concrete failure scenario:** If app server clock jumps backwards after a drift, `deregisteredAt` could be before `lastHeartbeatAt`, causing confusing staleness logic.
**Fix:** Use `await getDbNowUncached()` for consistency with the broader DB-time migration.
**Confidence:** MEDIUM

### CR-3: Community thread moderation uses `new Date()` for `lockedAt`, `pinnedAt`, `updatedAt` [LOW/LOW]

**File:** `src/app/api/v1/community/threads/[id]/route.ts:41-43`
**Description:** All three timestamp fields use `new Date()`. These are moderation timestamps that don't affect access control, but they should use DB time for consistency.
**Concrete failure scenario:** Clock skew between two moderators' requests could cause inconsistent moderation ordering.
**Fix:** Use `await getDbNowUncached()` for consistency.
**Confidence:** LOW

### CR-4: User creation (single and bulk) uses `new Date()` for `createdAt`/`updatedAt` [LOW/LOW]

**File:** `src/app/api/v1/users/route.ts:126-127`, `src/app/api/v1/users/bulk/route.ts:126-127`
**Description:** User creation uses `new Date()` for `createdAt` and `updatedAt`. Since these are creation timestamps stored in the DB, using DB time would be more consistent. However, these timestamps are not used in temporal comparisons for access control.
**Concrete failure scenario:** Minimal — creation timestamps are write-once and rarely compared.
**Fix:** Low priority — use `await getDbNowUncached()` for consistency with the DB-time migration pattern.
**Confidence:** LOW

### CR-5: Problem set management uses `new Date()` for `createdAt`/`updatedAt` [LOW/LOW]

**File:** `src/lib/problem-sets/management.ts:85,108,164`
**Description:** Problem set create/update operations use `new Date()`. Same pattern as CR-4.
**Fix:** Use `await getDbNowUncached()` for consistency.
**Confidence:** LOW

### CR-6: Group membership enrollment uses `new Date()` for `enrolledAt` [LOW/MEDIUM]

**File:** `src/app/api/v1/groups/[id]/members/route.ts:105`
**Description:** `enrolledAt: new Date()` uses the app server clock. The invite route (already fixed) uses `getDbNowUncached()` for `enrolledAt`. This creates inconsistency: the same field is stored with different time sources depending on the enrollment path.
**Concrete failure scenario:** A user enrolled via invite and a user enrolled manually could have `enrolledAt` timestamps from different clocks, making enrollment-order queries unreliable.
**Fix:** Use `await getDbNowUncached()` for `enrolledAt` to match the invite route.
**Confidence:** MEDIUM

### CR-7: Judge heartbeat uses `new Date()` for `lastHeartbeatAt` and staleness calculation [MEDIUM/MEDIUM]

**File:** `src/app/api/v1/judge/heartbeat/route.ts:39,72-74`
**Description:** The heartbeat route uses `const now = new Date()` for `lastHeartbeatAt` (line 39), then uses `Date.now()` for the staleness threshold calculation (line 73). The staleness sweep compares `lastHeartbeatAt` (app server time) against the threshold computed from `Date.now()` (also app server time). This is internally consistent but inconsistent with the DB-time migration pattern. If the staleness sweep is ever moved to a DB-side query, the mixed time sources would cause issues.
**Fix:** Use `await getDbNowUncached()` for `lastHeartbeatAt`. For the staleness sweep, use the same DB time minus the threshold.
**Confidence:** MEDIUM

### CR-8: Admin roles route uses `new Date()` for `createdAt`/`updatedAt` [LOW/LOW]

**File:** `src/app/api/v1/admin/roles/route.ts:74,97-98`
**Description:** Role creation uses `new Date()` for timestamps. Same pattern as CR-4.
**Fix:** Use `await getDbNowUncached()` for consistency.
**Confidence:** LOW

## Verified Safe

- SSE `viewerId` capture fix confirmed at line 198 — non-null assertion removed correctly.
- Invite route `getDbNowUncached()` fix confirmed at line 98.
- All `dangerouslySetInnerHTML` uses are sanitized via `sanitizeHtml()` (DOMPurify with strict allowlists).
- No `as any` casts found.
- No `@ts-ignore` or `@ts-expect-error` found.
- Only 2 `eslint-disable` directives, both with justification comments.
- No swallowed empty catch blocks.
