# Cycle 45 — Security Reviewer

**Date:** 2026-04-23
**Base commit:** d96a984f

## Findings

### SEC-1: API rate limit uses `Date.now()` for DB-timestamp comparison — clock-skew window manipulation [MEDIUM/MEDIUM]

**File:** `src/lib/security/api-rate-limit.ts:54,86,90`

The `atomicConsumeRateLimit` function uses `Date.now()` (line 54) to compare against `rateLimits.windowStartedAt`, `rateLimits.blockedUntil`, and `rateLimits.lastAttempt` — all of which are DB-stored timestamps. This is the same clock-skew class of issue that was fixed in `submissions.ts` (cycles 43-44) and `assignments` PATCH route (cycle 41).

**Concrete failure scenario:** If the app server clock is behind the DB clock by 30 seconds, a user whose rate-limit window has expired (according to DB time) will still be blocked for an extra 30 seconds because `Date.now()` returns an earlier time. Conversely, if the app clock is ahead, a user could bypass the rate-limit window early.

However, rate-limit precision is typically measured in seconds to minutes, and clock skew of a few seconds is unlikely to cause real-world abuse. The risk is LOW for most deployments but MEDIUM for environments where NTP is not synchronized.

**Fix:** This is a systemic pattern — `Date.now()` is used throughout the rate-limiting module. A proper fix would require either:
1. Using `getDbNowUncached()` for the initial `now` value (adds a DB round-trip per rate-limited request)
2. Accepting the trade-off and documenting it

Given the performance impact of adding a DB query to every rate-limited request, this may warrant deferral unless the deployment has known clock-skew issues.

---

### SEC-2: `safeJsonForScript` only escapes `</script` and `<!--` — incomplete XSS prevention for `<script>` context [LOW/LOW]

**File:** `src/components/seo/json-ld.tsx:11-15`

```typescript
function safeJsonForScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/<\/script/gi, "<\\/script")
    .replace(/<!--/g, "<\\!--");
}
```

The function escapes `</script` and `<!--` sequences, which are the primary vectors for breaking out of a `<script>` tag in HTML. This is correct per the OWASP guidance for JSON-in-script-tag. However, `JSON.stringify` in V8/SpiderMonkey already escapes `<`, `>`, `&`, and other HTML-significant characters in string values, making the additional regex replacements defense-in-depth rather than a primary guard.

This is correctly implemented. No fix needed — logging for awareness only.

---

### SEC-3: Recruiting invitation `expiryDate` validation uses `new Date(string)` — potential inconsistent parsing [LOW/LOW]

**Files:**
- `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:73`
- `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/bulk/route.ts:71`
- `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts:122`

```typescript
expiresAt = new Date(`${body.expiryDate}T23:59:59Z`);
```

The `expiryDate` value comes from a Zod-validated string (enforced as `YYYY-MM-DD` format). The `new Date(...)` constructor appends `T23:59:59Z` to create an end-of-day UTC timestamp. This is safe because:
1. The Zod schema enforces the YYYY-MM-DD format with a regex
2. The `Number.isFinite(expiresAt.getTime())` check catches any malformed dates
3. The comparison against `dbNow` (DB time) prevents past dates

No fix needed — the defense-in-depth chain is sufficient.

---

## Summary

| ID | Severity/Confidence | Description |
|----|----|----|
| SEC-1 | MEDIUM/MEDIUM | API rate limit uses Date.now() for DB-timestamp comparison |
| SEC-2 | LOW/LOW | safeJsonForScript — correctly implemented, no action needed |
| SEC-3 | LOW/LOW | expiryDate parsing — defense-in-depth is sufficient |
