# Debugger / Failure-Mode Review — Cycle 4 (2026-05-29)

## Findings

### DBG-C4-1 [Low / Medium] — null client-IP → silent worker lockout (dup of SEC-C4-1)
When `extractClientIp` returns null for an IPv4-mapped IPv6 address and
`JUDGE_ALLOWED_IPS` is set, `isJudgeIpAllowed` returns false and the worker gets a
403 with no actionable signal that the cause is IP-format, not a bad allowlist.
Failure scenario: operator adds `JUDGE_ALLOWED_IPS`, dual-stack Nginx starts
emitting `::ffff:`-form IPs, all workers 403, queue stalls, hard to diagnose.
FIX: same as SEC-C4-1 (normalize mapped form). Also consider a one-time
`logger.warn` when an allowlist is configured but the extracted IP is null.

### DBG-C4-2 [Low / Low] — in-progress poll branch can shrink result set silently
`poll/route.ts:96-103`: on an in-progress update with `results.length > 0` it
DELETEs all prior `submission_results` then re-inserts the (possibly smaller)
reported set. If a worker sends progressive updates with fewer cases than a prior
update, earlier per-case rows are lost until the final report. Cosmetic for live
progress; final verdict path re-replaces fully. Informational.

## Confirmations
- claim route's problem-not-found recovery re-checks the claim token under a txn
  before resetting → no double-decrement race (claim/route.ts:360-384). Sound.
- `clearAuthToken` sets `authenticatedAt=0` (not delete) to keep revocation
  closed (session-security.ts:59-66). Correct and well-commented.
