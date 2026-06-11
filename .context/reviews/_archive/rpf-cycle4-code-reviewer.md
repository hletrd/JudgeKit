# Code Quality Review — RPF Cycle 4 (Loop 4/100)

**Date:** 2026-04-24
**Reviewer:** code-reviewer
**Base commit:** a717b371 (cycle 3 multi-agent review — no new findings)
**HEAD commit:** a717b371

## Inventory of Reviewed Files

- `src/lib/security/api-rate-limit.ts` (full)
- `src/lib/security/rate-limit.ts` (full)
- `src/lib/security/rate-limiter-client.ts` (full)
- `src/lib/security/in-memory-rate-limit.ts` (full)
- `src/lib/security/csrf.ts` (full)
- `src/lib/security/password.ts` (full)
- `src/lib/security/env.ts` (full)
- `src/lib/security/derive-key.ts` (full)
- `src/lib/db-time.ts` (full)
- `src/lib/db/queries.ts` (full)
- `src/lib/db/schema.pg.ts` (partial — first 150 lines)
- `src/lib/api/handler.ts` (full)
- `src/lib/api/responses.ts` (full)
- `src/lib/realtime/realtime-coordination.ts` (full)
- `src/lib/assignments/leaderboard.ts` (full)
- `src/lib/assignments/contest-scoring.ts` (full)
- `src/lib/assignments/participant-status.ts` (full)
- `src/lib/anti-cheat/review-model.ts` (full)
- `src/lib/data-retention.ts` (full)
- `src/lib/auth/index.ts` (full)
- `src/lib/auth/config.ts` (referenced)
- `src/lib/plugins/chat-widget/tools.ts` (full)
- `src/lib/files/storage.ts` (full)
- `src/app/api/v1/judge/claim/route.ts` (full)
- `src/app/api/v1/submissions/[id]/events/route.ts` (full)
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts` (full)
- `src/app/api/v1/contests/[assignmentId]/analytics/route.ts` (full)
- `src/proxy.ts` (full)
- All Date.now() usage sites across src/ (via grep)

## Findings

### CR-1: Judge claim route `Date.now()` clock-skew — NOW FIXED [RESOLVED]

**File:** `src/app/api/v1/judge/claim/route.ts:126`

**Status:** This finding from cycle 48 has been **fixed**. Line 126 now reads:
```typescript
const claimCreatedAt = (await getDbNowUncached()).getTime();
```
This is correct and consistent with the established `getDbNowUncached()` pattern used across the codebase. No further action needed.

---

### CR-2: `atomicConsumeRateLimit` uses `Date.now()` in hot path [MEDIUM/MEDIUM — carry-over, unchanged]

**File:** `src/lib/security/api-rate-limit.ts:56`

**Description:** This is a known carry-over from cycle 45 (AGG-2). The `atomicConsumeRateLimit` function captures `const now = Date.now()` on line 56 and uses it for all window/blockedUntil comparisons inside the DB transaction. This is the same clock-skew class, but the fix would add a DB round-trip per API request, which is costlier than the clock-skew risk. Values are internally consistent within a single server instance.

**Fix:** Deferred. See deferred item #1 in the plan.

---

### CR-3: `rateLimitedResponse` uses `Date.now()` for `X-RateLimit-Reset` header [LOW/LOW — carry-over]

**File:** `src/lib/security/api-rate-limit.ts:122`

**Description:** Known carry-over from cycle 48. The `rateLimitedResponse` function computes the `X-RateLimit-Reset` header as `(nowMs ?? Date.now()) + windowMs`. Under clock skew, this could give clients an inaccurate reset timestamp. Not harmful but inaccurate.

**Fix:** Use the `windowStartedAt` value from the DB transaction to compute the reset time.

---

### CR-4: Practice page unsafe type assertion [LOW/LOW — carry-over]

**File:** `src/app/(public)/practice/page.tsx:128-129`

**Description:** Known carry-over from cycle 47. The `as SortOption` cast before the `includes` check. The `includes` check does validate the runtime value, so this is safe in practice.

---

### Carry-Over Confirmations

All previously identified carry-over items remain unfixed and are still valid:
- Leaderboard freeze uses `Date.now()` (LOW/LOW)
- Console.error in client components (LOW/MEDIUM)
- SSE O(n) eviction scan (LOW/LOW)
- Manual routes duplicate boilerplate (MEDIUM/MEDIUM)
- Global timer HMR pattern duplication (LOW/MEDIUM)
- Stale-while-revalidate cache pattern duplication (LOW/LOW)

## New Findings

**No new production-code findings this cycle.** The codebase has not changed since cycle 3. The judge claim route `Date.now()` finding (CR-1 from cycle 48) is now confirmed fixed. All other carry-over items remain valid and tracked.
