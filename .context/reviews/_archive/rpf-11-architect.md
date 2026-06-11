# RPF Cycle 11 — Architect

**Date:** 2026-04-20
**Base commit:** 74353547

## Findings

### ARCH-1: Inconsistent DB-time migration creates maintenance burden — `getDbNowUncached()` should be the default for all server-side writes [MEDIUM/MEDIUM]

**Files:** `src/lib/assignments/recruiting-invitations.ts`, `src/lib/db/export.ts`, `src/lib/db/export-with-files.ts`, `src/app/api/v1/admin/backup/route.ts`
**Description:** The DB-time migration across cycles 7-10 covered most API routes and server actions, but left gaps in:
1. The recruiting token transaction path (7 instances)
2. Export/backup timestamps (3 instances)
3. Schema `$defaultFn` defaults (30+ instances in `schema.pg.ts`, but these are INSERT-time only and acceptable)

The pattern of "fix some calls, defer others" creates an inconsistent codebase where some modules use DB time and others don't. This makes it harder for new developers to know which pattern to follow. The `withUpdatedAt()` helper's default of `new Date()` (DEFER-1 from rpf-10) exacerbates this.

**Confidence:** MEDIUM
**Fix:** Complete the DB-time migration for the recruiting token path (the most impactful gap). For exports, consider whether the inconsistency matters for disaster recovery. The `withUpdatedAt()` default should eventually be addressed per DEFER-1.

### ARCH-2: Recruiting token transaction already has DB access but doesn't use it for timestamps [LOW/MEDIUM]

**File:** `src/lib/assignments/recruiting-invitations.ts:307-530`
**Description:** The `redeemRecruitingToken` function runs inside a `db.transaction()` callback. It already calls `getDbNowUncached()` at line 361 for `tokenInvalidatedAt`. This proves DB time is accessible in this context. The remaining 7 `new Date()` calls are simply oversights from the partial fix in M2.
**Confidence:** HIGH
**Fix:** Fetch DB time once at the top of the transaction and reuse everywhere.

## Verified Safe

- Auth architecture is solid: JWT strategy, Argon2id, session invalidation, role-based capabilities.
- Real-time architecture uses shared polling with PostgreSQL advisory locks for multi-instance coordination.
- Data retention architecture is well-designed with legal hold support.
- Export/restore architecture uses streaming with integrity manifests.
