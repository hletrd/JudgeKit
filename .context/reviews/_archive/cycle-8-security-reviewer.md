# Cycle 8 Security Review

**Date:** 2026-04-20
**Reviewer:** security-reviewer
**Base commit:** ddffef18

## Findings

### SEC-1: Judge poll route `judgedAt` uses `new Date()` — can affect contest deadline comparisons [MEDIUM/HIGH]

**File:** `src/app/api/v1/judge/poll/route.ts:75,142`
**Description:** The judge poll route records `judgeClaimedAt: new Date()` and `judgedAt: new Date()` using app server time. The `judgedAt` field is used in contest deadline checks and submission ordering. If the app server clock drifts relative to the DB server clock (which is the authoritative source for all other deadline comparisons), a submission could be recorded as judged after the deadline when it was actually judged before, or vice versa. This undermines the time-based integrity guarantees that the DB-time migration was designed to provide.
**Concrete failure scenario:** During an exam, a student submits at 11:58 PM DB time. The judge completes at 11:59 PM DB time. But the app server clock is 3 minutes ahead, recording `judgedAt` as 12:02 AM. The submission appears late and may be penalized or rejected.
**Fix:** Use `await getDbNowUncached()` for both `judgeClaimedAt` and `judgedAt` in the judge poll route.
**Confidence:** HIGH

### SEC-2: Judge heartbeat staleness sweep mixes `new Date()` with DB-stored `lastHeartbeatAt` [LOW/MEDIUM]

**File:** `src/app/api/v1/judge/heartbeat/route.ts:39,72-82`
**Description:** The heartbeat route writes `lastHeartbeatAt: now` (where `now = new Date()`) and then runs a staleness sweep comparing `lastHeartbeatAt` against `Date.now() - threshold`. Both use app server time, so they are internally consistent. However, the staleness sweep updates `status` to "stale" based on this comparison. If another route queries worker status and compares it with DB time, the mixed time sources could cause inconsistencies.
**Concrete failure scenario:** A worker's heartbeat is written with app server time 2 minutes behind DB time. The staleness sweep correctly marks it as "online" (same clock source), but if a monitoring query uses DB time to compare against `lastHeartbeatAt`, the worker appears 2 minutes older than expected.
**Fix:** Use `await getDbNowUncached()` for `lastHeartbeatAt` and compute staleness threshold from DB time.
**Confidence:** MEDIUM

### SEC-3: Group enrollment `enrolledAt` uses inconsistent time source between invite and manual enrollment [LOW/MEDIUM]

**File:** `src/app/api/v1/groups/[id]/members/route.ts:105`
**Description:** Manual group enrollment uses `enrolledAt: new Date()`, while the invite route (already fixed in commit 598f52c9) uses `getDbNowUncached()`. The same database column stores timestamps from two different clocks. This could cause ordering inconsistencies in enrollment audit queries.
**Concrete failure scenario:** An enrollment audit query orders by `enrolledAt` and shows a manual enrollment occurring before an invite enrollment that actually happened first, due to clock skew.
**Fix:** Use `await getDbNowUncached()` for `enrolledAt` in the manual enrollment route.
**Confidence:** MEDIUM

### SEC-4: Community thread moderation timestamps use app server time [LOW/LOW]

**File:** `src/app/api/v1/community/threads/[id]/route.ts:41-43`
**Description:** `lockedAt`, `pinnedAt`, and `updatedAt` use `new Date()`. These are moderation timestamps that don't gate access control, so the security impact is minimal.
**Fix:** Use `await getDbNowUncached()` for consistency.
**Confidence:** LOW

## Verified Safe

- HTML sanitization is robust: DOMPurify with strict tag/attribute allowlists, URI regexp blocking non-HTTP protocols, auto-rel=noopener on links, image src restricted to root-relative.
- No `innerHTML` assignments found in source.
- No `as any` type casts.
- No unsanitized user input reaching SQL queries (all use parameterized queries via Drizzle ORM).
- No secrets or credentials hardcoded in source (all from `process.env` with production validation).
- Auth flow uses Argon2id with timing-safe dummy hash.
- Rate limiting uses two-tier strategy (sidecar + PostgreSQL with SELECT FOR UPDATE).
- CSRF protection in place for server actions.
- Judge authentication uses per-worker secret token hashes with timing-safe comparison.
