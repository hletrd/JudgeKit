# Cycle 7b Aggregate Review

## Scope
- Aggregated from: `cycle-7b-comprehensive-review.md`
- Base commit: a224e229

## Deduped findings (merged with prior-cycle carry-forwards)

### AGG-1 — PublicHeader `loggedInUser.role` typed as `string` instead of `UserRole`
- **Severity:** LOW
- **Confidence:** HIGH
- **Cross-agent agreement:** cycle-7b F1, prior cycle-6b architect A2
- **Evidence:** `src/components/layout/public-header.tsx:40`
- **Fix:** Change `role?: string` to `role?: UserRole`

### AGG-2 — Backup/restore/migrate routes use manual auth pattern
- **Severity:** LOW
- **Confidence:** HIGH
- **Cross-agent agreement:** cycle-7b F2, prior cycle-6b AGG-4
- **Evidence:** 5 routes in `src/app/api/v1/admin/`
- **Fix:** Migrate migrate/* routes to `createApiHandler`. Keep backup/restore as exceptions.

### AGG-3 — `files/[id]/route.ts` DELETE/PATCH use manual auth
- **Severity:** LOW
- **Confidence:** HIGH
- **Cross-agent agreement:** cycle-7b F3
- **Evidence:** `src/app/api/v1/files/[id]/route.ts:66,135`
- **Fix:** Wrap DELETE and PATCH in `createApiHandler`

### AGG-4 — Dual-query pagination in groups/assignments route
- **Severity:** LOW
- **Confidence:** HIGH
- **Cross-agent agreement:** cycle-7b F4, prior cycle-6b AGG-3
- **Evidence:** `src/app/api/v1/groups/[id]/assignments/route.ts:45-67`
- **Fix:** Collapse to single query with `count(*) over()`

### AGG-5 — SSE submission events route capability check incomplete for custom roles
- **Severity:** MEDIUM
- **Confidence:** MEDIUM
- **Cross-agent agreement:** cycle-7b F5
- **Evidence:** `src/app/api/v1/submissions/[id]/events/route.ts:182`
- **Fix:** Add `resolveCapabilities` check for `submissions.view`/`submissions.view_all`

### AGG-6 — Compiler workspace directory mode 0o770 may not be accessible by uid 65534
- **Severity:** MEDIUM
- **Confidence:** MEDIUM
- **Cross-agent agreement:** cycle-7b F7
- **Evidence:** `src/lib/compiler/execute.ts:635`
- **Fix:** Use `0o777` for workspace dir or `0o755` with proper ownership

### AGG-7 — ALWAYS_REDACT missing `encryptedKey` from `apiKeys` table
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Cross-agent agreement:** cycle-7b F12
- **Evidence:** `src/lib/db/export.ts:249-251`
- **Fix:** Add `encryptedKey` to `ALWAYS_REDACT` for `apiKeys`

### AGG-8 — Test coverage gaps for workspace-to-public migration Phase 2
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Cross-agent agreement:** cycle-7b F15, prior cycle-6b AGG-5
- **Evidence:** PublicHeader dropdown, mobile menu, dashboard "back to public site" link
- **Fix:** Add component tests for dropdown rendering per role and mobile menu behavior

### AGG-9 — JWT callback does DB query on every authenticated request
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Cross-agent agreement:** cycle-7b F20
- **Evidence:** `src/lib/auth/config.ts:354-405`
- **Fix:** Cache user data lookup with short TTL in JWT callback

### AGG-10 — Divergent exponential backoff in rate-limit module
- **Severity:** LOW
- **Confidence:** HIGH
- **Cross-agent agreement:** cycle-7b F11
- **Evidence:** `src/lib/security/rate-limit.ts:153` vs `:193`
- **Fix:** Unify formula with shared helper

### AGG-11 — Rate-limit eviction timer `unref()` is conditionally applied
- **Severity:** LOW
- **Confidence:** HIGH
- **Cross-agent agreement:** cycle-7b F18
- **Evidence:** `src/lib/security/rate-limit.ts:45-51`
- **Fix:** Always call `evictionTimer.unref()` after `setInterval`

### AGG-12 — `syncTokenWithUser` called with inconsistent field sets
- **Severity:** LOW
- **Confidence:** HIGH
- **Cross-agent agreement:** cycle-7b F14
- **Evidence:** `src/lib/auth/config.ts:52-66` missing `shareAcceptedSolutions`/`acceptedSolutionsAnonymous`
- **Fix:** Add missing fields to `createSuccessfulLoginResponse` and `AuthenticatedLoginUser` type

### AGG-13 — No audit logging for API key creation/deletion
- **Severity:** LOW
- **Confidence:** MEDIUM
- **Cross-agent agreement:** cycle-7b F16
- **Evidence:** `src/app/api/v1/admin/api-keys/route.ts`
- **Fix:** Add `recordAuditEvent` calls to POST and DELETE handlers

### AGG-14 — Compiler execute logs full command at INFO level
- **Severity:** LOW
- **Confidence:** MEDIUM
- **Cross-agent agreement:** cycle-7b F17
- **Evidence:** `src/lib/compiler/execute.ts:372`
- **Fix:** Change from `logger.info` to `logger.debug`

### AGG-15 — No `Cache-Control: no-store` on API responses
- **Severity:** LOW
- **Confidence:** HIGH
- **Cross-agent agreement:** cycle-7b F10
- **Evidence:** `src/lib/api/handler.ts`
- **Fix:** Add default `Cache-Control: no-store` header in `createApiHandler`

### AGG-16 — SSE re-auth endpoint lacks rate limiting
- **Severity:** LOW
- **Confidence:** MEDIUM
- **Cross-agent agreement:** cycle-7b F9
- **Evidence:** `src/app/api/v1/submissions/[id]/events/route.ts:310`
- **Fix:** Add `consumeApiRateLimit(request, "submission:reauth")`

### AGG-17 — PublicHeader mobile menu lacks click-outside-to-close
- **Severity:** LOW
- **Confidence:** MEDIUM
- **Cross-agent agreement:** cycle-7b F13
- **Evidence:** `src/components/layout/public-header.tsx:106-150`
- **Fix:** Add backdrop overlay or document click listener

### AGG-18 — `namedToPositional` regex more permissive than validation
- **Severity:** LOW
- **Confidence:** LOW
- **Cross-agent agreement:** cycle-7b F19
- **Evidence:** `src/lib/db/queries.ts:74`
- **Fix:** Change `/@(\w+)/g` to `/@([a-zA-Z_]\w*)/g`

## Deferred findings (low signal, validation needed)

- F6: Exam session `new Date()` staleness — design tradeoff, not a bug
- F8: Export streaming busy-wait — admin-only, low priority
- F20 (from cycle-7 comprehensive): JWT token bloat with UI preferences — significant refactor, defer to Phase 4 of workspace migration

## Summary

- **Total deduped findings:** 18
- **MEDIUM severity:** 5 (AGG-5, AGG-6, AGG-7, AGG-8, AGG-9)
- **LOW severity:** 13 (AGG-1 through AGG-4, AGG-10 through AGG-18)
- **Actionable this cycle:** AGG-7 (encryptedKey redaction), AGG-10 (backoff formula), AGG-11 (timer unref), AGG-14 (log level), AGG-15 (cache-control header)
