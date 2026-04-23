# RPF Cycle 35 — Tracer

**Date:** 2026-04-23
**Base commit:** 218a1a93

## TR-1: Recruiting invitation expiryDate NaN bypass — causal trace [MEDIUM/HIGH]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:73-83`

**Hypothesis 1 (confirmed): Invalid Date construction bypasses all validation.**
Trace:
1. `body.expiryDate` from Zod schema — if schema allows non-YYYY-MM-DD strings
2. `new Date(\`${body.expiryDate}T23:59:59Z\`)` — produces Invalid Date for strings already containing a time component
3. `expiresAt <= dbNow` → `NaN <= Date` → `false` — passes "not in past" check
4. `expiresAt && (expiresAt.getTime() - dbNow.getTime()) > MAX_EXPIRY_MS` → `true && (NaN > number)` → `true && false` → `false` — passes "not too far" check
5. Invalid Date passed to `createRecruitingInvitation` → stored as NULL or error

**Hypothesis 2 (requires verification): Zod schema already constrains format.**
If the Zod schema in `createRecruitingInvitationSchema` enforces YYYY-MM-DD via regex, the bypass is not reachable through the API. Need to check the schema definition.

**Recommendation:** Verify the Zod schema. Even if it's currently safe, add defense-in-depth with `Number.isFinite(expiresAt.getTime())` check.

**Confidence:** HIGH for the code-level bug; MEDIUM for exploitability (depends on schema)

---

## TR-2: Contest stats double-scan trace — performance regression path [MEDIUM/MEDIUM]

**File:** `src/app/api/v1/contests/[assignmentId]/stats/route.ts:80-119`

**Trace:**
1. Stats endpoint called during active contest
2. `user_best` CTE scans submissions table (filtered by assignment_id + status)
3. `user_totals` CTE aggregates user_best results
4. `submission_stats` CTE computes count + avg from user_totals
5. `solved_problems` CTE independently scans submissions table AGAIN (same filters)
6. Both CTEs execute within the same query but PostgreSQL may not share the scan results

**Impact:** For contests with many submissions, this doubles I/O and CPU cost for the stats query. The query runs on every stats page load, which could be frequent during live contests.

**Fix:** `solved_problems` should reference `user_best`:
```sql
solved_problems AS (
  SELECT COUNT(DISTINCT ub.problem_id)::int AS solved_count
  FROM user_best ub
  INNER JOIN assignment_problems ap ON ap.assignment_id = @assignmentId AND ap.problem_id = ub.problem_id
  WHERE ROUND(ub.best_score, 2) >= ROUND(COALESCE(ap.points, 100), 2)
)
```

**Confidence:** HIGH

---

## TR-3: Chat widget scrollToBottom dependency chain analysis [LOW/LOW]

**File:** `src/lib/plugins/chat-widget/chat-widget.tsx:87-115`

**Trace:**
1. `isStreaming` changes from `false` to `true` (streaming starts)
2. `scrollToBottom` is recreated (depends on `isStreaming`)
3. The `useEffect` at line 107 that depends on `[messages, scrollToBottom]` re-runs
4. `scrollToBottom()` is called, which is correct behavior
5. But the effect also re-subscribes (cleanup + re-setup), causing a brief gap

This is not a bug — the scroll still works correctly. But it's an unnecessary re-subscription that could be avoided by using the ref pattern consistently.

**Confidence:** LOW
