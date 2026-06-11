# Cycle 8 Tracer Review

**Date:** 2026-04-20
**Reviewer:** tracer
**Base commit:** ddffef18

## Findings

### TR-1: Exam submission `submittedAt` clock-skew — traced the full causal chain [MEDIUM/HIGH]

**Causal chain:**
1. Student submits code during exam
2. POST `/api/v1/submissions` enters `execTransaction`
3. Inside the transaction, exam session deadline is checked using SQL `NOW()` (authoritative DB time)
4. If the deadline check passes, `tx.insert(submissions).values({submittedAt: new Date()})` writes the submission with app server time
5. The `submittedAt` timestamp is now inconsistent with the deadline check that allowed it

**Competing hypotheses:**
- H1: Clock skew causes `submittedAt` to be after the deadline (app clock ahead). This makes the submission appear late in audit queries even though it was accepted. **Likely under clock drift.**
- H2: Clock skew causes `submittedAt` to be before the actual submission time (app clock behind). This could allow a student to "cheat" the deadline if the app clock is behind the DB clock and the deadline check uses DB time. **Unlikely — the SQL NOW() check would still reject late submissions.**
- H3: The clock skew is negligible and this is theoretical. **Dismissed — the DB-time migration exists precisely because clock skew was identified as a real risk.**

**Conclusion:** H1 is the most likely failure mode. The `submittedAt` field should use DB time to match the deadline check.
**Fix:** Replace `submittedAt: new Date()` with `submittedAt: await getDbNowUncached()`.
**Confidence:** HIGH

### TR-2: `enrolledAt` mixed time sources — traced the enrollment paths [LOW/MEDIUM]

**Causal chain:**
1. Invite enrollment (POST `/api/v1/contests/[assignmentId]/invite`): uses `getDbNowUncached()` for `enrolledAt` (fixed in commit 598f52c9)
2. Manual enrollment (POST `/api/v1/groups/[id]/members`): uses `new Date()` for `enrolledAt`
3. Both write to the same `enrollments.enrolledAt` column
4. An audit query ordering by `enrolledAt` would intermix timestamps from two different clocks

**Fix:** Use `getDbNowUncached()` in the manual enrollment route.
**Confidence:** MEDIUM

## Verified Safe

- Session revocation (`tokenInvalidatedAt`) fully migrated to DB time (commit ff3a010c).
- Contest deadline checks in anti-cheat and public contests fully migrated to DB time.
- Access code redemption fully migrated to DB time.
