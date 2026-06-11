# Code Quality Review — RPF Cycle 21

**Reviewer:** code-reviewer
**Date:** 2026-04-24
**Scope:** Full repository

---

## CR-1: [MEDIUM] Anti-cheat heartbeat dedup uses `Date.now()` instead of DB time — inconsistent with contest boundary checks

**File:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:92-96`
**Confidence:** HIGH

The heartbeat deduplication in the anti-cheat POST handler uses `Date.now()` (line 92) to decide whether 60 seconds have elapsed since the last heartbeat. However, the contest boundary checks just above (lines 63-73) use `SELECT NOW()` from the DB server. The `createdAt` timestamp for the inserted event (line 110) uses the DB `now` value.

This means the dedup logic and the event timestamps can be inconsistent: if the app server clock is ahead of the DB clock, a heartbeat may be deduped (skipped) even though the DB timestamp is < 60s after the previous one, or conversely, a heartbeat may be inserted even though the DB timestamp indicates it is too soon.

**Concrete failure scenario:** App server clock is 5 seconds ahead of DB. Student sends a heartbeat at client time T. The `Date.now()` check says 61s have elapsed, so a DB row is inserted with `createdAt = DB_NOW` which is only 56s after the previous one due to clock skew. This creates a gap of only 56s between heartbeats in the DB, which later shows up as a false "normal" gap when the instructor reviews heartbeat continuity.

**Fix:** Replace `Date.now()` with the DB `now` value already fetched on line 67. Convert `now` to milliseconds and use it for the dedup comparison:
```ts
const nowMs = now.getTime();
const last = lastHeartbeatTime.get(heartbeatKey) ?? 0;
if (nowMs - last >= 60_000) {
  lastHeartbeatTime.set(heartbeatKey, nowMs);
  shouldRecord = true;
}
```

---

## CR-2: [LOW] `systemSettings` GET/PUT endpoint casts through `Record<string, unknown>` repeatedly for hcaptchaSecret redaction

**File:** `src/app/api/v1/admin/settings/route.ts:21-25, 131-135`
**Confidence:** MEDIUM

The hcaptchaSecret redaction logic appears twice (GET and PUT handlers), each time casting `settings` through `as Record<string, unknown>`. This is fragile and error-prone: if the settings object shape changes or if a new secret column is added, the same pattern must be replicated without any type-level enforcement.

**Fix:** Create a helper function `redactSecretFields(settings)` that centralizes the redaction of all known secret columns, or add a `toSafeApiShape()` method on the settings type.

---

## CR-3: [LOW] `getConfiguredSettings()` stale cache race: async reload may return defaults instead of updated values

**File:** `src/lib/system-settings-config.ts:158-181`
**Confidence:** LOW

When `invalidateSettingsCache()` is called (after an admin update), the cache is cleared (`cached = null, cachedAt = 0`). The next call to `getConfiguredSettings()` finds `cached` is null, triggers an async reload, and returns `cached ?? DEFAULTS` while the reload is in progress. Since `cached` was cleared, it returns the hardcoded defaults, not the just-updated values.

In practice, this is mitigated because the async reload completes within milliseconds. But a concurrent request between invalidation and reload completion will see defaults.

**Fix:** Consider making `invalidateSettingsCache()` synchronous by loading the new settings immediately and setting `cached` to the result before returning.

---

## Positive Observations

- Previous cycle findings (AGG-1 hcaptchaSecret redaction, AGG-2 leaderboard DB time, AGG-3 proxy cache cleanup) are all correctly fixed
- No `@ts-ignore`, `@ts-expect-error`, or `eslint-disable` suppressions beyond one documented case
- No `as any` casts in server code (only documented cases for Drizzle ORM)
- `dangerouslySetInnerHTML` usage is properly sanitized (DOMPurify + safeJsonForScript)
- Auth token revocation is robust: `clearAuthToken` sets `authenticatedAt = 0` to prevent `iat` fallback bypass
- Password hashing uses Argon2id with OWASP-recommended parameters, with transparent bcrypt migration
