# Debugger Review — RPF Cycle 38

**Date:** 2026-04-23
**Reviewer:** debugger
**Base commit:** 4dd3d951

## Inventory of Files Reviewed

- `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/` — All invitation routes
- `src/app/api/v1/contests/quick-create/route.ts` — Quick-create
- `src/lib/plugins/chat-widget/chat-widget.tsx` — Chat widget
- `src/components/exam/anti-cheat-monitor.tsx` — Anti-cheat
- `src/components/exam/countdown-timer.tsx` — Timer
- `src/app/api/v1/submissions/[id]/events/route.ts` — SSE
- `src/lib/assignments/recruiting-invitations.ts` — Core logic

## Findings

### DBG-1: Bulk invitation email duplicate check uses case-sensitive `inArray` — confirms CR-1/SEC-1/V-1 [MEDIUM/HIGH]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/bulk/route.ts:41-49`

**Description:** Same root cause as CR-1. From a debugging perspective, this is a particularly insidious bug because:
1. The client-side dedup (lines 20-26) correctly lowercases emails, giving the impression that the entire flow is case-insensitive
2. The DB query (line 47) does a case-sensitive match, creating a silent inconsistency
3. No error is thrown — the duplicate is silently created

This makes the bug hard to diagnose in production because it manifests as "duplicate invitation" reports from candidates without any error logs.

**Concrete failure scenario:** An instructor reports that a candidate received two invitation emails. Investigation shows two invitation records with different email casing. No error was logged because the code path completed successfully.

**Fix:** Same as CR-1 — use `lower()` comparison.

**Confidence:** High

---

### DBG-2: Anti-cheat retry timer could create overlapping retry cycles [LOW/LOW]

**File:** `src/components/exam/anti-cheat-monitor.tsx:130-135`

**Description:** When `sendEvent` fails, the code sets `retryTimerRef.current` and schedules a single retry timer. If another event fails while a retry timer is already pending, the code at line 130 checks `!retryTimerRef.current` and skips creating a new timer. However, the `flushPendingEvents` function reads from localStorage each time it's called, which means events that failed after the localStorage write could be missed if the timer fires between the read and write.

This is a minor race condition that could result in events being sent twice or missed during rapid failure sequences. The server-side anti-cheat event handler is presumably idempotent, so the practical impact is minimal.

**Confidence:** Low

---

## Previously Deferred Items (Still Present)

- SSE O(n) eviction scan (deferred)
