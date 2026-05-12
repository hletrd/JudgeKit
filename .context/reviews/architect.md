# Architect Review — Cycle 5

**Reviewer:** architect
**Date:** 2026-05-12

---

## Finding 1: Judge claim route mixes atomic and non-atomic operations

**File:** `src/app/api/v1/judge/claim/route.ts`
**Severity:** HIGH
**Confidence:** High

The judge claim route uses an atomic raw SQL CTE for the claim itself, but then performs non-atomic follow-up operations (problem lookup, test case fetch, language config fetch). If the problem is missing, the reset is also non-atomic.

This architectural inconsistency means:
1. The claim is atomic (good)
2. The reset is not (bad)
3. The worker task accounting can drift (bad)

**Recommendation:** Consider restructuring so the entire claim-to-response lifecycle is transactional, or at minimum ensure resets are atomic with claim-token validation.

---

## Finding 2: Cache invalidation is manual and scattered

**File:** `src/lib/assignments/contest-scoring.ts`
**Severity:** LOW
**Confidence:** Medium

The `rankingCache` is a module-level LRU cache with no invalidation mechanism other than TTL. When submissions are created, updated, or rejudged, the cache is not proactively cleared. This means:
- Rejudged submissions may not appear on the leaderboard for up to 30s
- New submissions during an active contest may not be reflected immediately

**Recommendation:** Add an explicit cache invalidation API that mutation paths can call, or switch to a shorter TTL for active contests.

---

## Finding 3: Positive: Transaction wrapper pattern is now consistent

**File:** `src/lib/assignments/exam-sessions.ts`, `src/lib/assignments/access-codes.ts`, `src/lib/assignments/participant-timeline.ts`
**Severity:** N/A (positive finding)
**Confidence:** High

The cycles 3/4 fixes successfully applied the transaction wrapper pattern consistently:
- `getParticipantTimeline` wraps 8 parallel queries in a transaction
- `redeemAccessCode` fetches DB time outside the transaction
- `startExamSession` fetches DB time outside the transaction

This is good architectural progress.
