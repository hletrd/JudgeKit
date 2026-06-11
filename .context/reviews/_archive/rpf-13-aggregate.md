# RPF Cycle 13 Aggregate Review

**Date:** 2026-04-20
**Base commit:** ab43eaf2
**Review artifacts:** rpf-13-code-reviewer.md, rpf-13-security-reviewer.md, rpf-13-perf-reviewer.md, rpf-13-architect.md, rpf-13-critic.md, rpf-13-debugger.md, rpf-13-verifier.md, rpf-13-test-engineer.md, rpf-13-tracer.md, rpf-13-designer.md, rpf-13-document-specialist.md

## Deduped Findings (sorted by severity then signal)

### AGG-1: Client-side expiry/status badges use browser `new Date()` instead of server-provided state [MEDIUM/MEDIUM]

**Flagged by:** code-reviewer (CR-1, CR-3), security-reviewer (SEC-1, SEC-2), architect (ARCH-2), critic (CRI-1), designer (DES-1), debugger (DBG-2), tracer (TR-2), test-engineer (TE-1, TE-2)
**Files:**
- `src/components/contest/recruiting-invitations-panel.tsx:248`
- `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:270`

**Description:** Client components use `new Date()` to determine if items are expired, while the server uses `getDbNow()` / `NOW()` for all temporal logic. If the browser clock is off, users see incorrect "Expired" or "Pending" badges. The server remains the authoritative gate — this is purely a display inconsistency, not a security or correctness vulnerability.

**Concrete failure scenario:** Instructor's browser clock is 2 hours behind. An invitation that expired 1 hour ago still shows "Pending" in the UI. Instructor doesn't realize it's expired and doesn't revoke/recreate it. A candidate later tries to redeem and gets a server-side "alreadyRedeemed" or "tokenExpired" error.

**Fix:** Add server-computed `isExpired` boolean fields to the API responses for recruiting invitations and API keys. Client components should render these server-provided fields instead of computing from raw timestamps using browser time.

**Cross-agent signal:** 9 of 11 agents flagged this.

### AGG-2: `createBackupIntegrityManifest` has optional `dbNow` parameter with `new Date()` fallback [LOW/MEDIUM]

**Flagged by:** code-reviewer (CR-7), architect (ARCH-1), critic (CRI-2), document-specialist (DOC-1)
**Files:** `src/lib/db/export-with-files.ts:42-56`
**Description:** `createBackupIntegrityManifest()` accepts `dbNow?: Date` and falls back to `new Date()` at line 47. All current callers pass `dbNow`, making the fallback dead code. However, the optional parameter creates the same maintenance trap that caused the original clock-skew bug across 20+ routes: a future caller that forgets to pass `dbNow` will silently introduce inconsistent timestamps.

**Fix:** Make `dbNow` a required parameter. One-line API change. All callers already provide it.

**Cross-agent signal:** 4 of 11 agents flagged this.

### AGG-3: Backup download filename uses browser `new Date()` instead of server-provided name [LOW/MEDIUM]

**Flagged by:** code-reviewer (CR-4), security-reviewer (SEC-3), debugger (DBG-1), tracer (TR-1), designer (DES-2)
**Files:** `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx:52`
**Description:** The client-side download code generates its own filename using `new Date()`, overriding the server-provided `Content-Disposition` header filename (which uses DB time). The downloaded file's name therefore doesn't match the DB-time snapshot inside, which could cause confusion during disaster recovery.

**Concrete failure scenario:** Server snapshot at DB time 12:00:00, but file downloaded as `judgekit-backup-2026-04-20T11-59-55-000Z.zip`. Operator comparing filename with `exportedAt` inside sees a 5-second discrepancy.

**Fix:** Extract the filename from the response's `Content-Disposition` header using `response.headers.get('Content-Disposition')` instead of generating a client-side timestamp.

**Cross-agent signal:** 5 of 11 agents flagged this.

### AGG-4: Hardcoded English "Loading..." text in client components [LOW/MEDIUM]

**Flagged by:** designer (DES-3, DES-4)
**Files:**
- `src/components/contest/recruiting-invitations-panel.tsx:441`
- `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:407`

**Description:** Both components use a hardcoded "Loading..." string instead of the i18n system. This is inconsistent with the rest of the UI which uses `t()` or `tCommon()` for all text.

**Fix:** Replace with `tCommon("loading")` or a dedicated translation key.

**Cross-agent signal:** 1 of 11 agents (designer specifically focused on i18n/UX).

### AGG-5: Triple `getDbNowUncached()` call in backup-with-files path [LOW/MEDIUM]

**Flagged by:** perf-reviewer (PERF-1)
**Files:**
- `src/app/api/v1/admin/backup/route.ts:85`
- `src/lib/db/export-with-files.ts:114`
- `src/lib/db/export.ts:65`

**Description:** The backup-with-files path calls `getDbNowUncached()` three times: once in the route handler for the filename, once in `streamBackupWithFiles()` for the manifest, and once inside `streamDatabaseExport()` for `exportedAt`. Each `getDbNowUncached()` is a separate `SELECT NOW()` round-trip. The three calls typically return timestamps within milliseconds of each other, but they're unnecessary overhead.

**Fix:** Pass `dbNow` from the route handler through `streamBackupWithFiles()` into `streamDatabaseExport()`, eliminating 2 extra DB round-trips per backup. This requires adding an optional `dbNow` parameter to `streamDatabaseExport()`.

**Cross-agent signal:** 1 of 11 agents (perf-specific finding).

### AGG-6: `streamBackupWithFiles` buffers entire export in memory [MEDIUM/HIGH]

**Flagged by:** perf-reviewer (PERF-2), architect (ARCH-3)
**Files:** `src/lib/db/export-with-files.ts:112-182`
**Description:** The backup-with-files path collects the entire database export JSON into memory before creating the ZIP. For large databases, this means the entire JSON export + ZIP buffer are held simultaneously. This is an architectural limitation of using JSZip (non-streaming) with the streaming export.

**Fix:** Long-term: migrate to a streaming ZIP library (e.g., `archiver`). Short-term: document memory characteristics and add a warning log for large exports. This is a known tradeoff and should be addressed in a dedicated cycle.

**Cross-agent signal:** 2 of 11 agents flagged this (perf + architect).

## Verified Safe / No Regression Found

- Recruiting token `redeemRecruitingToken`: all 8 timestamps use `dbNow` — verified.
- Export `exportedAt`: uses `getDbNowUncached()` inside REPEATABLE READ transaction — verified.
- Backup manifest `createdAt`: uses `dbNow` — verified.
- `getContestStatus()` and `selectActiveTimedAssignments()`: require `now: Date` parameter — verified.
- Server components use `getDbNow()` for deadline/status checks — verified.
- Auth flow: Argon2id, timing-safe dummy hash, rate limiting, proper token invalidation — all intact.
- No `dangerouslySetInnerHTML` without sanitization.
- No `as any` type casts or `@ts-ignore` in production code.
- Only 2 justified `eslint-disable` directives.
- SQL injection: all raw SQL uses parameterized values via Drizzle.
- LIKE patterns properly escaped with `escapeLikePattern()`.
- Korean letter-spacing: correct per project rules.
- Client-side date formatting: `useLocale()` used correctly.
- All prior cycle fixes are intact and working.

## Agent Failures

None. All 11 review perspectives completed successfully.
