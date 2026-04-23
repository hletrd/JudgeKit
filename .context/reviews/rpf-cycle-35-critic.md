# RPF Cycle 35 — Critic Review

**Date:** 2026-04-23
**Base commit:** 218a1a93

## CRI-1: Past Sunset date on deprecated import path is a cross-cutting concern [MEDIUM/HIGH]

**Flagged by:** code-reviewer (CR-1), security-reviewer (SEC-1)

**File:** `src/app/api/v1/admin/migrate/import/route.ts:183, 191`

**Description:** The Sunset header date `"Sat, 01 Nov 2025 00:00:00 GMT"` is in the past. This is not just a code quality issue — it has security implications (the insecure password-in-JSON-body path remains active while signaling it has been retired), API contract implications (clients that honor RFC 8594 will stop using the endpoint), and operational implications (monitoring tools may exclude the endpoint from active checks). The fix in cycle 34 correctly added deprecation headers but used a past Sunset date that was likely a placeholder from when the deprecation was first planned. This should have been caught during review.

**Fix:** Update to a future date that reflects the actual deprecation timeline (e.g., 6 months out). If the JSON path should be removed now that the multipart path exists, remove it rather than setting a misleading date.

**Confidence:** HIGH

---

## CRI-2: Recruiting invitation NaN bypass on expiryDate is a real vulnerability [MEDIUM/MEDIUM]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:73-76`

**Description:** The `expiryDate` is constructed as `new Date(\`${body.expiryDate}T23:59:59Z\`)`. If `body.expiryDate` is not a strict YYYY-MM-DD format (e.g., it contains a time component already), the resulting Date is `Invalid Date` (NaN). All subsequent numeric comparisons with NaN return false, effectively bypassing both the "date in past" check and the "too far future" check. The invitation would be stored with an invalid/null expiry, making it effectively never-expiring. This is a concrete security bypass.

**Fix:** Add strict format validation in the Zod schema (`z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`) or validate that the constructed `expiresAt` is a valid Date (`!isNaN(expiresAt.getTime())`) before proceeding.

**Confidence:** HIGH

---

## CRI-3: Chat widget scrollToBottom still depends on isStreaming state [LOW/LOW]

**File:** `src/lib/plugins/chat-widget/chat-widget.tsx:87-105`

**Description:** The cycle 34 fix correctly moved `isStreaming` to a ref for the `sendMessage` callback, but `scrollToBottom` still uses `isStreaming` from state and has it in its dependency array. This causes 2 unnecessary callback recreations per message (on streaming start and end). While functionally harmless, it's inconsistent with the ref-based approach adopted for `sendMessage`.

**Fix:** Use `isStreamingRef.current` in `scrollToBottom` and remove `isStreaming` from the dependency array.

**Confidence:** LOW

---

## CRI-4: Contest stats query scans submissions table twice [MEDIUM/MEDIUM]

**File:** `src/app/api/v1/contests/[assignmentId]/stats/route.ts:80-119`

**Description:** The CTE-based stats query defines `user_best` (scanning submissions for max score per user+problem) and then `solved_problems` independently scans submissions again. The `solved_problems` CTE should reference `user_best` to avoid the duplicate scan. This wastes DB resources for large contests.

**Fix:** Refactor `solved_problems` to join on `user_best` instead of re-scanning `submissions`.

**Confidence:** HIGH
