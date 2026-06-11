# Code Reviewer — Cycle 24

**Date:** 2026-04-24
**Reviewer:** code-reviewer
**Scope:** Full repository

---

## Findings

### CR-1: [MEDIUM] Proxy Missing `X-Content-Type-Options` and `Referrer-Policy` Security Headers

**Confidence:** HIGH
**Citations:** `src/proxy.ts:144-229`

The `createSecuredNextResponse` function sets CSP, HSTS, and `frame-ancestors 'none'` but omits two common security headers:

1. **`X-Content-Type-Options: nosniff`** — Only set on the file download route (`src/app/api/v1/files/[id]/route.ts:115`) but NOT globally. Other API responses and page responses lack this header, allowing browsers to MIME-sniff content types. While the CSP `default-src 'self'` mitigates most MIME-sniffing attacks, defense-in-depth requires `nosniff` on all responses.

2. **`Referrer-Policy`** — Not set anywhere in the proxy or middleware. Browsers default to `Referrer-Policy: no-referrer-when-downgrade`, which leaks the full URL (including query parameters with potentially sensitive IDs) to external links. The app handles contest tokens and access codes in URLs, making referrer leakage a real concern.

**Concrete failure scenario:** A student clicks an external link from a contest page. The full contest URL (including `?code=ACCESS_TOKEN`) is sent in the `Referer` header to the external site, leaking the contest access token.

**Fix:** Add the following headers in `createSecuredNextResponse`:
```typescript
response.headers.set("X-Content-Type-Options", "nosniff");
response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
```

---

### CR-2: [LOW] ZIP Bomb Validation Decompresses All Entries into Memory

**Confidence:** HIGH
**Citations:** `src/lib/files/validation.ts:55-85`

`validateZipDecompressedSize` decompresses every entry via `entry.async("uint8array")` to measure size. This loads the full decompressed content of each entry into memory before discarding it. For a ZIP with 10,000 entries (the current limit), each 50 MB (the per-entry cap), this means up to 50 MB per entry is allocated and freed sequentially. While the total and per-entry caps prevent unbounded memory, the approach is wasteful — JSZip's internal `uncompressedSize` metadata is available without decompressing.

**Concrete failure scenario:** A user uploads a ZIP with 500 entries, each decompressing to 49 MB (under the per-entry cap). The function allocates and frees ~24 GB of memory sequentially, causing GC pressure and potential OOM on small instances.

**Fix:** Use `entry._data.uncompressedSize` (or parse the local file header manually) to check sizes without decompressing. Fall back to decompression only when the metadata is unavailable (some ZIP formats omit it).

---

### CR-3: [LOW] `computeContestRanking` ICPC Tie-Breaking Inconsistency with IOI Tie-Breaking

**Confidence:** MEDIUM
**Citations:** `src/lib/assignments/contest-scoring.ts:354-367` vs `369-370`

The ICPC sort uses four tie-breakers: solved count, penalty, last AC time, userId. The IOI sort uses only two: total score, userId. However, the rank assignment logic (lines 374-387) determines "tied" differently for each model:

- ICPC: `prev.totalScore === curr.totalScore && prev.totalPenalty === curr.totalPenalty`
- IOI: `isScoreTied(prev.totalScore, curr.totalScore)` (epsilon comparison)

The ICPC "tied" check only compares `totalScore` (solved count) and `totalPenalty`, but the sort also uses `lastAcTime` and `userId` as further tie-breakers. If two users have the same solved count and penalty but different last AC times, the sort puts them in different positions but the rank assignment gives them the same rank. This is actually the intended behavior for ICPC (tied on solved+penalty = same rank), but the userId tie-breaker makes the ordering deterministic without affecting the rank, which is correct.

However, for IOI, `isScoreTied` uses `0.01` epsilon but `totalScore` is already rounded to 2 decimal places (line 330). Two scores that are exactly equal after rounding would also pass the epsilon check, so the epsilon is redundant for the rank assignment. This is not a bug but is slightly confusing.

**Fix:** No code change needed. Add a comment on the ICPC tied check explaining that `lastAcTime` and `userId` are tie-breakers for deterministic ordering only and do not affect rank equality.

---

### CR-4: [MEDIUM] `getRetentionCutoff` Uses `Date.now()` Instead of DB Server Time

**Confidence:** MEDIUM
**Citations:** `src/lib/data-retention.ts:38-40`

`getRetentionCutoff` uses `Date.now()` (with a default parameter) to compute the retention cutoff date. Other time-sensitive operations (contest boundaries, SSE coordination, anti-cheat, rate limiting) consistently use `getDbNowMs()` or `getDbNowUncached()` to avoid clock skew.

If the app server clock is ahead of the DB server clock, data that is still within the retention window (according to DB time) could be deleted prematurely. If the app server clock is behind, data that should be pruned will linger.

**Concrete failure scenario:** App server clock is 5 minutes ahead. A submission with `submittedAt` 364d 23h 55m ago (DB time) is within the 365-day retention window, but `getRetentionCutoff` computes 365 days ago using the advanced app clock, placing it just outside the window. The submission is deleted one full day early.

**Fix:** Accept an optional `nowMs` parameter that defaults to `Date.now()` for backwards compatibility, but allow callers to pass DB server time. Update the data-retention-maintenance and cleanup callers to use DB time.

---

## Files Reviewed

- `src/proxy.ts` (full)
- `src/lib/files/validation.ts` (full)
- `src/lib/files/storage.ts` (full)
- `src/lib/assignments/contest-scoring.ts` (full)
- `src/lib/assignments/leaderboard.ts` (full)
- `src/lib/data-retention.ts` (full)
- `src/lib/logger.ts` (full)
- `src/lib/http/content-disposition.ts` (full)
- `src/lib/db/queries.ts` (full)
- `src/lib/db/import.ts` (full)
- `src/lib/db/like.ts` (full)
- `src/lib/auth/config.ts` (full)
- `src/lib/auth/recruiting-token.ts` (full)
- `src/lib/judge/auth.ts` (full)
- `src/lib/realtime/realtime-coordination.ts` (full)
- `src/lib/security/password-hash.ts` (full)
- `src/app/api/v1/submissions/[id]/events/route.ts` (full)
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts` (full)
- `src/app/api/v1/admin/plugins/[id]/route.ts` (full)
- `src/lib/api/handler.ts` (full)
