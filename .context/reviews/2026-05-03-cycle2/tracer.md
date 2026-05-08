# Tracer Review — Cycle 2 (2026-05-03)

**Reviewer:** tracer
**HEAD:** `689cf61d`

---

## C2-TR-1 (MEDIUM, HIGH confidence) — Recruiting token re-entry can bypass rate limiting

**Trace path:** Login form -> `authorize()` in `config.ts` -> `authorizeRecruitingToken()` -> `redeemRecruitingToken()` (re-entry path)

When a candidate re-enters a redeemed token, the flow goes through:
1. `consumeRateLimitAttemptMulti` at `config.ts:206` (rate limit consumed)
2. `authorizeRecruitingToken` -> `redeemRecruitingToken` (re-entry path)
3. Password verification succeeds
4. `clearRateLimitMulti` at `config.ts:232` (rate limit cleared on success)

An attacker who knows a valid token+password combination can make unlimited login attempts because each successful attempt clears the rate limiter. This differs from normal credential login where a compromised password is typically changed after discovery. Recruiting passwords may never be changed.

**Fix:** Do NOT clear the rate limiter for recruiting token re-entry. The IP-based rate limit should accumulate regardless of success/failure for this path.

---

## C2-TR-2 (LOW, HIGH confidence) — File serve path traces through unauthenticated metadata

**Trace path:** `GET /api/v1/files/[id]` -> `getApiUser()` -> `canAccessFile()` -> `readUploadedFile()`

The file serve endpoint checks auth but then reads the file by `storedName` from the DB. If the DB returns a `storedName` that doesn't match an actual file on disk (e.g., after a partial restore), the error is caught and a 404 is returned. This is correct behavior.

However, the ETag is set to the file ID, not the content hash. This means if a file is replaced (same ID, different content), the browser cache serves the old version. This is unlikely in practice since files are never updated in place.

**Fix:** No fix needed. Behavior is correct.

---

## Final Sweep

Traced: recruiting token full lifecycle (creation -> email -> redemption -> re-entry -> results viewing), file upload -> serve -> delete, submission creation -> judge -> result, and admin API key creation -> authentication. All paths correctly implement auth checks. The main concern is the rate-limit clearing on recruiting token re-entry.
