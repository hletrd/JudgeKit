# RPF Cycle 11 Aggregate Review

**Date:** 2026-04-20
**Base commit:** 74353547
**Review artifacts:** `rpf-11-code-reviewer.md`, `rpf-11-security-reviewer.md`, `rpf-11-perf-reviewer.md`, `rpf-11-architect.md`, `rpf-11-critic.md`, `rpf-11-debugger.md`, `rpf-11-verifier.md`, `rpf-11-test-engineer.md`, `rpf-11-tracer.md`, `rpf-11-designer.md`, `rpf-11-document-specialist.md`

## Deduped Findings (sorted by severity then signal)

### AGG-1: Recruiting token `redeemRecruitingToken` transaction path has 7 `new Date()` writes despite already using `getDbNowUncached()` at line 361 [MEDIUM/HIGH]

**Flagged by:** code-reviewer (CR-1), security-reviewer (SEC-1), architect (ARCH-2), critic (CRI-1), debugger (DBG-1, DBG-2), verifier (V-1), tracer (TR-1), test-engineer (TE-1), document-specialist (DOC-1)
**Files:** `src/lib/assignments/recruiting-invitations.ts:362,373,390,478,485,495,497`
**Description:** The `redeemRecruitingToken` function runs inside `db.transaction()` and already calls `getDbNowUncached()` at line 361 for `tokenInvalidatedAt`. However, 7 other timestamp writes in the same transaction use `new Date()` instead of the DB-sourced time. This is the exact same clock-skew pattern that was fixed in 20+ other routes across cycles 7-10. The rpf-10 M2 fix addressed the non-transactional `updateRecruitingInvitation` and `resetRecruitingInvitationAccountPassword` functions (lines 194, 244, 252) but missed the transactional path.

The atomic SQL at line 503 uses `NOW()` for the security-critical expiry validation, so access control is NOT compromised. However, the written audit timestamps (`enrolledAt`, `redeemedAt`, `updatedAt`) are inconsistent with the DB time used for the claim, which could confuse forensic analysis.

**Concrete failure scenario:** App server clock is 5 seconds behind DB clock. User redeems recruiting token at DB time T. The atomic SQL validates `expires_at > NOW()` (DB time T). But `enrolledAt` is recorded as T-5s, `redeemedAt` is T-5s. Admin later queries audit trail and sees timestamps that don't match the DB's transaction time.

**Fix:** Fetch `const dbNow = await getDbNowUncached()` once at the start of the transaction (before any writes). Replace all 7 `new Date()` calls with `dbNow`. Also replace the existing `getDbNowUncached()` call at line 361 with `dbNow` to avoid a redundant DB round-trip. Add a brief comment noting the consistency with the atomic `NOW()` check.

**Cross-agent signal:** 10 of 11 agents flagged this — very high signal.

### AGG-2: Export/backup timestamps use `new Date()` instead of DB time [LOW/MEDIUM]

**Flagged by:** code-reviewer (CR-2), security-reviewer (SEC-2, SEC-3), architect (ARCH-1), critic (CRI-2), perf-reviewer (implicit)
**Files:** `src/lib/db/export.ts:64`, `src/lib/db/export-with-files.ts:45`, `src/app/api/v1/admin/backup/route.ts:83`
**Description:** The database export runs inside a REPEATABLE READ transaction for consistent data snapshots, but the `exportedAt` header uses `new Date().toISOString()`. The backup manifest's `createdAt` and the backup filename timestamp also use `new Date()`. These timestamps are cosmetic/diagnostic — the actual data integrity is protected by SHA-256 checksums. However, if the app server clock is significantly off, the `exportedAt` won't match the actual snapshot time, which could confuse disaster recovery analysis.
**Fix:** For `export.ts:64`, fetch DB time at the start of the transaction and use it. For `export-with-files.ts:45` and `backup/route.ts:83`, pass the DB time through from the caller. The backup filename timestamp is purely cosmetic and low priority.
**Cross-agent signal:** 5 of 11 agents flagged this.

### AGG-3: No test coverage for recruiting token DB-time consistency [LOW/MEDIUM]

**Flagged by:** test-engineer (TE-1), verifier (V-1 implicit)
**Files:** `tests/`
**Description:** No unit test verifies that `redeemRecruitingToken` uses DB-sourced time for `enrolledAt`, `redeemedAt`, and `updatedAt` in the transaction path. When AGG-1 is fixed, a test should verify the fix.
**Fix:** Add a test that mocks `getDbNowUncached` and verifies that all written timestamps in the recruiting token path use the DB-sourced time value.
**Cross-agent signal:** 2 of 11 agents.

### AGG-4: Audit events failure tracker uses `new Date()` for `lastAuditEventWriteFailureAt` [LOW/LOW]

**Flagged by:** code-reviewer (CR-3)
**Files:** `src/lib/audit/events.ts:117`
**Description:** `lastAuditEventWriteFailureAt = new Date().toISOString()` is used for health monitoring only. No functional impact.
**Fix:** Low priority. Cosmetic consistency improvement.
**Cross-agent signal:** 1 of 11 agents.

## Verified Safe / No Regression Found

- Auth flow: Argon2id, timing-safe dummy hash, rate limiting, proper token invalidation — all intact.
- No `dangerouslySetInnerHTML` without sanitization.
- No `as any` type casts, `@ts-ignore`, or unsanitized SQL.
- Only 2 eslint-disable directives, both justified.
- No empty catch blocks.
- File storage path traversal protection in place.
- ZIP bomb protection for uploads.
- Backup integrity manifest with SHA-256 checksums.
- Rate limiting uses `SELECT FOR UPDATE` for TOCTOU prevention.
- Recruiting token: atomic SQL claim with `NOW()` prevents TOCTOU on expiry.
- Korean letter-spacing: CSS custom properties with `:lang(ko)` override.
- Client-side date formatting: `useLocale()` used in all reviewed components.
- All prior cycle fixes are intact and working.

## Agent Failures

None. All 11 review perspectives completed successfully.
