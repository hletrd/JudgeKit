# Cycle 8 Critic Review

**Date:** 2026-04-20
**Reviewer:** critic
**Base commit:** ddffef18

## Findings

### CRI-1: The DB-time migration is incomplete — `new Date()` persists in 8+ routes for DB-stored timestamps [MEDIUM/HIGH]

**Files:** See code-reviewer (CR-1 through CR-8) for specific citations.
**Description:** The DB-time migration was the right architectural call and the high-severity items (session revocation, contest deadlines) are fixed. But leaving 8+ routes with `new Date()` for DB-stored timestamps creates a dangerous inconsistency: the same column can store timestamps from different clocks depending on the code path. A future developer reading the code will not know which clock source to trust. This is not just a consistency nitpick — it undermines the guarantee the migration was designed to provide.
**Concrete failure scenario:** A new feature compares `judgedAt` with `NOW()` in a SQL query, assuming it uses DB time like other timestamps. The mixed source causes incorrect results.
**Fix:** Complete the migration in a single pass across all remaining routes.
**Confidence:** HIGH

### CRI-2: Stale plan statuses misrepresent the actual state of work [LOW/HIGH]

**Files:** `plans/open/2026-04-20-cycle-7-review-remediation.md`, `plans/open/2026-04-20-cycle-24-review-remediation.md`
**Description:** Multiple plans show TODO for items that are already implemented. This wastes time and could cause duplicate commits. Plans where all items are DONE should be archived.
**Fix:** Update plan statuses and archive completed plans.
**Confidence:** HIGH

### CRI-3: The `submittedAt` field in the submissions route uses `new Date()` inside a transaction [MEDIUM/MEDIUM]

**File:** `src/app/api/v1/submissions/route.ts:317`
**Description:** `submittedAt: new Date()` is set when creating a new submission. This timestamp is critical for exam deadline enforcement — if a student submits right at the deadline, clock skew between the app server and DB server could make the submission appear late or early. The exam session deadline check (earlier in the same transaction) uses SQL `NOW()` for the comparison, but then writes `submittedAt` with app server time. This is a direct clock-skew vector for exam integrity.
**Concrete failure scenario:** Exam deadline is 11:59 PM DB time. Student submits at 11:58 PM DB time. App server clock is 2 minutes ahead, recording `submittedAt` as 12:00 AM. The submission appears late despite being on time.
**Fix:** Use `await getDbNowUncached()` for `submittedAt` in the submission creation route.
**Confidence:** MEDIUM

## Verified Safe

- The workspace-to-public migration is complete and consistent.
- Korean letter-spacing is properly handled across all components.
- SSE viewerId capture fix is correct.
