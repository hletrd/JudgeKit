# RPF Cycle 35 — Debugger

**Date:** 2026-04-23
**Base commit:** 218a1a93

## DBG-1: Recruiting invitation NaN bypass produces never-expiring invitations [MEDIUM/MEDIUM]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:73-83`

**Description:** When `body.expiryDate` contains a time component (e.g., `"2026-01-01T00:00:00Z"`), `new Date(\`${body.expiryDate}T23:59:59Z\`)` produces `Invalid Date`. The subsequent checks `expiresAt <= dbNow` (NaN comparison → false) and `(expiresAt.getTime() - dbNow.getTime()) > MAX_EXPIRY_MS` (NaN comparison → false) both pass, allowing the invalid date to be stored. The database likely stores `NULL` or an error value for the timestamp, resulting in an invitation that never expires.

**Failure trace:**
1. Attacker sends `expiryDate: "2026-01-01T00:00:00Z"` in the request body
2. `new Date("2026-01-01T00:00:00ZT23:59:59Z")` → Invalid Date (NaN)
3. `NaN <= dbNow` → false (passes "not in past" check)
4. `NaN > MAX_EXPIRY_MS` → false (passes "not too far" check)
5. Invalid date stored in DB → invitation never expires

**Fix:** Add `Number.isFinite(expiresAt.getTime())` check after constructing the Date. If not finite, return a 400 error.

**Confidence:** HIGH

---

## DBG-2: Anti-cheat monitor fire-and-forget heartbeat on effect mount [LOW/MEDIUM]

**File:** `src/components/exam/anti-cheat-monitor.tsx:152-155`

**Description:** The heartbeat effect fires `void reportEventRef.current("heartbeat")` immediately on mount (line 155), before scheduling the recurring timer. This is a fire-and-forget async call with no cleanup mechanism. If the component unmounts between the call and the response, the `apiFetch` promise resolves and the `.then()` chain attempts to use a potentially stale `reportEventRef`. While React refs don't cause "update on unmounted component" errors, the response could trigger side effects (localStorage writes, pending event queues) that are no longer needed.

**Fix:** Use an active flag or AbortController that is checked/aborted in the cleanup function.

**Confidence:** MEDIUM

---

## DBG-3: SSE connection tracking oldest-by-age eviction could evict active connections [LOW/MEDIUM]

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:44-55`

**Description:** The eviction logic removes the connection with the oldest `createdAt`. However, `createdAt` tracks when the connection info was added to the tracking map, not when the SSE connection was established. If a long-lived connection was recently re-added to the tracking map (e.g., after eviction and re-registration), its `createdAt` would be recent, and an older but shorter-lived connection would be evicted instead. More importantly, the tracking map entries are not automatically removed when SSE connections close — they rely on the stale cleanup timer. So an active, long-lived SSE connection with an old `createdAt` could be evicted from tracking while the actual SSE stream remains open, causing a discrepancy between tracked and actual connection counts.

**Fix:** Remove tracking entries when the SSE stream's `close()` function is called (which already happens). The eviction should only be a safety net for entries where `close()` was never called (zombie connections). Consider also verifying the connection is still active before evicting.

**Confidence:** MEDIUM
