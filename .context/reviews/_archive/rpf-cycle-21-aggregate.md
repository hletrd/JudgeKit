# Aggregate Review — RPF Cycle 21

**Date:** 2026-04-24
**Reviewers:** code-reviewer, security-reviewer, perf-reviewer, architect, test-engineer, debugger
**Total findings:** 9 (deduplicated to 3 unique)

---

## Deduplicated Findings (sorted by severity)

### AGG-1: [MEDIUM] Anti-cheat Heartbeat Dedup Uses `Date.now()` Instead of DB Time — Clock-Skew Inconsistency

**Sources:** CR-1, S-1, A-1, D-1, T-1 | **Confidence:** HIGH
**Cross-agent signal:** 5 of 6 review perspectives

The heartbeat deduplication in `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:92-96` uses `Date.now()` to decide whether 60 seconds have elapsed since the last heartbeat, while the contest boundary checks in the same handler (lines 63-73) use `SELECT NOW()` from the DB server. The `createdAt` timestamp for the inserted event (line 110) uses the DB `now` value.

Under clock skew between the app server and DB server, the in-memory `lastHeartbeatTime` map records app-server timestamps while the DB stores DB-server timestamps. This creates a latent consistency bug where:

1. Heartbeats may be inserted more frequently than the intended 60-second interval (app server clock behind DB)
2. Heartbeats may be incorrectly deduped (app server clock ahead of DB), creating false gaps in the instructor's heartbeat continuity view
3. Server restarts clear the in-memory LRU cache, causing a burst of heartbeat insertions

**Concrete failure scenario:** App server clock is 5 seconds ahead of DB. Student sends a heartbeat at client time T. `Date.now()` says 61s have elapsed, so a DB row is inserted with `createdAt = DB_NOW` which is only 56s after the previous one. The instructor reviewing heartbeat continuity sees an unexpected cluster of events with < 60s gaps.

**Fix:** Replace `Date.now()` with the DB `now` value already fetched on line 67:
```ts
const nowMs = now.getTime();
const last = lastHeartbeatTime.get(heartbeatKey) ?? 0;
if (nowMs - last >= 60_000) {
  lastHeartbeatTime.set(heartbeatKey, nowMs);
  shouldRecord = true;
}
```

---

### AGG-2: [LOW] `systemSettings` Cache Invalidation Race — Brief Window Returns Defaults

**Sources:** CR-3, D-2 | **Confidence:** LOW
**Cross-agent signal:** 2 of 6 review perspectives

When `invalidateSettingsCache()` is called (after an admin update), it clears `cached = null, cachedAt = 0`. The next call to `getConfiguredSettings()` triggers an async DB reload but returns `cached ?? DEFAULTS` while the reload is in progress. Since `cached` was cleared, it returns hardcoded defaults instead of the just-updated values.

This is a transient issue: the async reload completes within milliseconds. However, a concurrent request between invalidation and reload completion will see default rate limits and other settings, which could be a security concern (e.g., `submissionRateLimitMaxPerMinute` reverting to 120 instead of the admin-configured value).

**Fix:** Consider making `invalidateSettingsCache()` synchronous by loading the new settings immediately, or at minimum preserving the previous cached value until the async reload completes.

---

### AGG-3: [LOW] No Test Verifying Export Redaction Map Consistency with Known Secret Columns

**Sources:** T-2 | **Confidence:** MEDIUM
**Cross-agent signal:** 1 of 6 review perspectives

The cycle 19 aggregate recommended adding a test that validates `ALWAYS_REDACT` and `SANITIZED_COLUMNS` include entries for known secret columns (`passwordHash`, `encryptedKey`, `hcaptchaSecret`). No such test was found. Without it, future developers could add a new secret column without updating the redaction maps, recreating the hcaptchaSecret omission.

**Fix:** Add a test in `tests/unit/db/` that asserts:
1. `ALWAYS_REDACT` includes `passwordHash`, `encryptedKey`, `hcaptchaSecret`
2. `SANITIZED_COLUMNS` includes all `ALWAYS_REDACT` entries plus session tokens and worker secrets
3. Any column referenced in `REDACT_PATHS` in the logger is also present in `SANITIZED_COLUMNS`

---

## Carried Forward from Prior Cycle-19 Aggregate (AGG-1 through AGG-3)

All prior cycle 19 findings have been fixed and verified:
- ~~AGG-1(c19): hcaptchaSecret missing from export redaction maps~~ — FIXED
- ~~AGG-2(c19): `computeLeaderboard` uses `Date.now()` for freeze boundary~~ — FIXED
- ~~AGG-3(c19): Proxy auth cache cleanup iterates all entries on every `setCachedAuthUser` call~~ — FIXED

## Previously Deferred Items (Still Active)

All prior deferred items from cycle 18b and earlier remain unchanged. See `rpf-cycle-18b-aggregate.md` for the full list.

## Positive Observations

- All prior cycle 19 fixes remain correctly implemented
- No `@ts-ignore`, `@ts-expect-error`, or `eslint-disable` suppressions beyond one documented case
- No `as any` casts in server code beyond documented Drizzle ORM case
- `dangerouslySetInnerHTML` usage is safe (DOMPurify + safeJsonForScript)
- Auth token revocation is robust (`clearAuthToken` sets `authenticatedAt = 0`)
- All contest/exam temporal boundary checks use DB server time (except the anti-cheat heartbeat dedup)
- CSRF protection is comprehensive (X-Requested-With + Sec-Fetch-Site + Origin)
- IP extraction validates XFF hops against TRUSTED_PROXY_HOPS
- Export redaction maps are complete for all known secret columns

## No Agent Failures

All 6 review perspectives completed successfully.
