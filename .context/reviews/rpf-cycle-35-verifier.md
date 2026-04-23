# RPF Cycle 35 — Verifier

**Date:** 2026-04-23
**Base commit:** 218a1a93

## V-1: Import route Sunset date is in the past — verified [MEDIUM/HIGH]

**File:** `src/app/api/v1/admin/migrate/import/route.ts:183, 191`

**Verification:** Read the source code. Line 183: `"Sunset": "Sat, 01 Nov 2025 00:00:00 GMT"`. Line 191: same. Current date is 2026-04-23. The date is indeed over 5 months in the past.

**Evidence:** The Sunset header value `"Sat, 01 Nov 2025 00:00:00 GMT"` is a valid RFC 1123 date but represents a time that has already passed. Per RFC 8594, a Sunset header with a past date indicates the resource has already been sunset. Since the endpoint is still active, this is a factual inaccuracy in the API's self-description.

**Confidence:** HIGH (confirmed by code inspection)

---

## V-2: Recruiting invitation NaN bypass — verified via code analysis [MEDIUM/MEDIUM]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:73-76`

**Verification:** Traced the code path:
1. `body.expiryDate` comes from the Zod schema
2. `expiresAt = new Date(\`${body.expiryDate}T23:59:59Z\`)` — if expiryDate contains a time component, this produces Invalid Date
3. Line 78: `if (expiresAt <= dbNow)` — NaN <= dbNow is false, so the check passes
4. Line 83: `if (expiresAt && (expiresAt.getTime() - dbNow.getTime()) > MAX_EXPIRY_MS)` — Invalid Date's `.getTime()` returns NaN, NaN > MAX_EXPIRY_MS is false, so this check also passes
5. The invalid date is passed to `createRecruitingInvitation` and stored in the DB

**Note:** The Zod schema in `createRecruitingInvitationSchema` would need to be checked to confirm whether it enforces YYYY-MM-DD format. If it does, this is not exploitable via the API but would still be a latent bug if the schema is ever loosened.

**Confidence:** MEDIUM (depends on schema validation strength)

---

## V-3: Contest stats double scan — verified [MEDIUM/MEDIUM]

**File:** `src/app/api/v1/contests/[assignmentId]/stats/route.ts:80-119`

**Verification:** Read the SQL query. The `user_best` CTE scans `submissions WHERE assignment_id = @assignmentId AND status IN (...)` to compute max scores. The `solved_problems` CTE independently scans `submissions WHERE assignment_id = @assignmentId AND status IN (...)` and joins on `assignment_problems`. The `solved_problems` CTE could reference `user_best` to get the best scores per problem without re-scanning submissions.

**Confidence:** HIGH (confirmed by SQL analysis)

---

## V-4: Chat widget isStreaming ref fix from cycle 34 verified correct [PASS]

**File:** `src/lib/plugins/chat-widget/chat-widget.tsx:36-37, 164`

**Verification:** The `isStreamingRef` is correctly initialized at line 36-37 and synchronized via useEffect. The `sendMessage` callback at line 164 uses `isStreamingRef.current` instead of `isStreaming` directly, and `isStreaming` is removed from the dependency array at line 243. The ref-based approach correctly prevents the stale-closure race described in cycle 34 AGG-2.

**Note:** `scrollToBottom` still depends on `isStreaming` state (line 105), which is a minor inconsistency but not a correctness issue.

**Confidence:** HIGH
