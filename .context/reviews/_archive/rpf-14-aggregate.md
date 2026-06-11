# RPF Cycle 14 Aggregate Review

**Date:** 2026-04-20
**Base commit:** c39ded3b
**Review artifacts:** rpf-14-code-reviewer.md, rpf-14-security-reviewer.md, rpf-14-perf-reviewer.md, rpf-14-architect.md, rpf-14-critic.md, rpf-14-debugger.md, rpf-14-verifier.md, rpf-14-test-engineer.md, rpf-14-tracer.md, rpf-14-designer.md, rpf-14-document-specialist.md

## Deduped Findings (sorted by severity then signal)

### AGG-1: Client-computed expiresAt timestamps are persisted to database without server-side validation [MEDIUM/HIGH]

**Flagged by:** code-reviewer (CR-1, CR-2), security-reviewer (SEC-1, SEC-2), architect (ARCH-2), critic (CRI-1), debugger (DBG-1), tracer (TR-1), verifier (VER-1), test-engineer (TE-1, TE-2)
**Files:**
- `src/app/api/v1/admin/api-keys/route.ts:81` - API key creation stores client-provided `expiresAt`
- `src/components/contest/recruiting-invitations-panel.tsx:141` - Invitation creation computes `expiresAt` using `Date.now()`
- `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts` - Server stores client-provided `expiresAt`

**Description:** The API key and recruiting invitation creation endpoints accept absolute `expiresAt` timestamps computed by the client using browser time. The server validates the format (`z.string().datetime()`) but not the value's relationship to DB server time. The `isExpired` check in the GET endpoints uses `NOW()` (DB time), creating a mismatch: the stored timestamp reflects browser time, but the expiry comparison uses DB time.

This is the creation-side counterpart to the display-side bug fixed in rpf-13 (AGG-1). While the display fix ensures the badge correctly reflects the stored timestamp, the stored timestamp itself may be wrong. The display fix makes this bug *harder* to detect because the badge is "consistently wrong."

**Concrete failure scenarios:**
1. **Clock skew:** Admin's browser is 1 hour behind. API key with "30d" expiry expires 1 hour earlier than intended. The badge shows "Expired" correctly relative to the stored (wrong) timestamp.
2. **Timezone mismatch:** Recruiting invitation custom date "April 30" produces different `expiresAt` values for admins in different timezones (UTC+9 vs UTC-5).
3. **Arbitrary timestamp:** A malicious client could send `expiresAt` far in the future (e.g., year 2099) to create a key that never expires, since the schema only validates format, not value range.

**Fix:** Change the API contract: clients send `expiryDuration` (e.g., `"30d"`, `"90d"`, `"1y"`, or `{ days: 30 }`) instead of computed ISO timestamps. Servers compute `expiresAt` using `getDbNowUncached() + interval`. Validate that the resulting timestamp is within a reasonable range (e.g., not more than 10 years in the future, not in the past).

**Cross-agent signal:** 10 of 11 agents flagged this (all except document-specialist).

### AGG-2: `withUpdatedAt()` defaults to `new Date()` - last remaining systemic `new Date()` trap door [MEDIUM/MEDIUM]

**Flagged by:** code-reviewer (CR-3), security-reviewer (SEC-3), architect (ARCH-1), critic (CRI-2), verifier (VER-3), tracer (TR-2), document-specialist (DOC-1)
**File:** `src/lib/db/helpers.ts:20`

**Description:** The `withUpdatedAt()` helper falls back to `new Date()` when no `now` parameter is provided. 9 of 11 callers use the default, meaning `updatedAt` timestamps across the system use a mix of app-server time and DB-server time. This is the same pattern that was fixed in `createBackupIntegrityManifest` (made `dbNow` required) and `getContestStatus` (removed `new Date()` default).

**Particularly clear demonstration:** In `src/app/api/v1/users/[id]/route.ts:478`, the code calls:
```typescript
withUpdatedAt({ isActive: false, tokenInvalidatedAt: await getDbNowUncached() })
```
Here `tokenInvalidatedAt` uses DB time, but `updatedAt` (set by `withUpdatedAt`) uses `new Date()`, creating an inconsistency within the same row update.

**Fix:** Make `now` a required parameter (same pattern as `createBackupIntegrityManifest`). All callers must be explicit about their time source.

**Cross-agent signal:** 7 of 11 agents flagged this.

### AGG-3: Recruiting invitation custom expiry date uses browser timezone without indication [LOW/MEDIUM]

**Flagged by:** debugger (DBG-3), tracer (TR-3), designer (DES-1)
**File:** `src/components/contest/recruiting-invitations-panel.tsx:138`

**Description:** The custom expiry date is constructed as `new Date(customExpiryDate + "T23:59:59").toISOString()`. The `new Date()` constructor interprets this in the browser's local timezone (per ECMAScript spec for date-time strings without a timezone indicator), producing a UTC timestamp that depends on the user's timezone offset. An admin in UTC+9 and an admin in UTC-5 selecting the same calendar date will store different `expiresAt` values.

**Fix:** Either use UTC explicitly (`"T23:59:59Z"`), or compute the timestamp server-side (preferred, consistent with AGG-1 fix).

**Cross-agent signal:** 3 of 11 agents flagged this.

### AGG-4: `useEffect` cleanup timer depends on `[t]` causing state leak on locale change [LOW/MEDIUM]

**Flagged by:** code-reviewer (CR-6), debugger (DBG-2), designer (DES-3)
**File:** `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:98-105`

**Description:** The `useEffect` that cleans up copy-feedback timers depends on `[t]`. When the locale changes, the effect re-runs, clearing timers but not resetting the `copiedKeyId` state. The "Copied" checkmark indicator persists indefinitely after a locale change.

**Fix:** Change the dependency array to `[]` (cleanup doesn't depend on `t`), or add state reset in the cleanup.

**Cross-agent signal:** 3 of 11 agents flagged this.

### AGG-5: Submissions page uses `new Date()` for period filter in server component [LOW/MEDIUM]

**Flagged by:** code-reviewer (CR-4)
**File:** `src/app/(public)/submissions/page.tsx:67`

**Description:** The `getPeriodStart()` function uses `new Date()` to compute period boundaries (today, week, month). Since this is a server component, it should use `getDbNow()` for consistency with the DB-time migration pattern. If the app server clock differs from the DB server, submissions near period boundaries could be included/excluded incorrectly.

**Fix:** Call `getDbNow()` at the top of the page component and pass it to `getPeriodStart()`.

**Cross-agent signal:** 1 of 11 agents.

### AGG-6: `streamBackupWithFiles` buffers entire export in memory (known, not yet mitigated) [MEDIUM/HIGH]

**Flagged by:** perf-reviewer (PERF-1)
**Files:** `src/lib/db/export-with-files.ts:120-131`

**Description:** Carry-over from rpf-13 (AGG-6). The backup-with-files path collects the entire database export JSON into memory before creating the ZIP. The short-term mitigation (warning log for large exports) has not been implemented yet.

**Fix:** Short-term: add a warning log when the export exceeds a threshold. Long-term: migrate to a streaming ZIP library.

**Cross-agent signal:** 1 of 11 agents (perf-specific). Previously flagged in rpf-13.

### AGG-7: User profile activity heatmap uses `new Date()` in server component [LOW/LOW]

**Flagged by:** code-reviewer (CR-5)
**File:** `src/app/(public)/users/[id]/page.tsx:171`

**Description:** The activity heatmap generates the 90-day window using `new Date()`. Same clock-skew concern as AGG-5 but even less impactful since it's just a visual display.

**Fix:** Use `getDbNow()` for consistency.

**Cross-agent signal:** 1 of 11 agents.

## Verified Safe / No Regression Found

- Prior rpf-13 fixes (AGG-1 through AGG-5) all verified as correctly implemented.
- `createBackupIntegrityManifest`: `dbNow` is required - verified.
- Backup download filename: uses `Content-Disposition` header - verified.
- API key status badges: use server-computed `isExpired` - verified.
- Recruiting invitation status badges: use server-computed `isExpired` - verified.
- Hardcoded "Loading..." text: uses `tCommon("loading")` - verified.
- `streamDatabaseExport`: accepts `dbNow` parameter - verified.
- Backup route: single `getDbNowUncached()` call, passed through pipeline - verified.
- Auth: Argon2id with OWASP parameters, timing-safe dummy hash - verified.
- SQL injection: all parameterized, LIKE patterns escaped - verified.
- HTML sanitization: DOMPurify with strict allowlist - verified.
- JSON-LD: `</script` escape prevents breakout - verified.
- File path traversal: checked in backup ZIP extraction - verified.
- Backup integrity: SHA-256 manifest validation - verified.
- Password hash and API key encrypted key always redacted - verified.
- Korean letter-spacing: correctly conditioned on locale - verified.

## Agent Failures

None. All 11 review perspectives completed successfully.
