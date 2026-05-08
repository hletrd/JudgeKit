# Document Specialist Review — Cycle 7

**Date:** 2026-05-03
**HEAD reviewed:** `d2a85df8`

## Findings

### C7-DS-1: Rate-limit module comment references removed in-memory limiter (LOW, High confidence)

**File:** `src/lib/security/api-rate-limit.ts:15-17`

The comment says: "The previous in-memory limiter (`in-memory-rate-limit.ts`) was removed because it had no production callers and exposed an authoritative store that resets on process restart — the DB-backed path is the only supported authority."

This is accurate and helpful context. No fix needed.

---

### C7-DS-2: `checkServerActionRateLimit` JSDoc says "keyed on userId" but recruit results page keys on client IP (LOW, Medium confidence)

**File:** `src/lib/security/api-rate-limit.ts:240-243` vs `src/app/(auth)/recruit/[token]/results/page.tsx:66-71`

The JSDoc for `checkServerActionRateLimit` says: "Keyed on userId + actionName so each user has their own counter." However, the recruit results page passes `clientIp` as the first argument (not a userId):

```typescript
const rateLimitResult = await checkServerActionRateLimit(
  clientIp,           // <- IP address, not userId
  "recruiting:results",
  30,
  60,
);
```

The function parameter is named `userId` but it's actually used as a generic key. The JSDoc is misleading — it implies the key must be a userId, but the function works with any string key.

**Fix:** Update the JSDoc to clarify that the first parameter is a rate-limit key (not necessarily a userId). Consider renaming the parameter from `userId` to `key` for accuracy.

---

### C7-DS-3: Recruit start page missing documentation about rate-limit expectations (LOW, Low confidence)

**File:** `src/app/(auth)/recruit/[token]/page.tsx`

The results page has a comment explaining its rate-limit implementation (lines 59-62). The start page has no such comment because it has no rate limiting. After C7-SR-1 is fixed, a similar comment should be added to the start page.
