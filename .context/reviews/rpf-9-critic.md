# RPF Cycle 9 Critic Review

**Date:** 2026-04-20
**Base commit:** c30662f0

## Findings

### CRI-1: `globals.css` letter-spacing violation is a product rule regression [HIGH/HIGH]

**Files:** `src/app/globals.css:129,213`
**Description:** The Tailwind-level Korean letter-spacing remediation (applied across many cycles) is undermined by CSS rules that apply letter-spacing unconditionally. This is a product rule regression — the team spent significant effort adding `${locale !== "ko" ? " tracking-tight" : ""}` patterns to every heading, but the CSS layer was never updated to match. The effort spent on the Tailwind remediation was partially wasted.
**Fix:** Fix `globals.css` to respect the Korean letter-spacing rule at the CSS level.

### CRI-2: `api-key-auth.ts` has mixed time sources in single function [MEDIUM/MEDIUM]

**Files:** `src/lib/api/api-key-auth.ts:88,103`
**Description:** Same function uses `getDbNowUncached()` for security check and `new Date()` for `lastUsedAt`. This is a pattern inconsistency that should have been caught during the DB-time migration. The `now` variable is already available — the fix is trivial.
**Fix:** Replace `lastUsedAt: new Date()` with `lastUsedAt: now`.

### CRI-3: Server action timestamp migration was missed during API route migration [LOW/MEDIUM]

**Files:** Multiple server action files
**Description:** The cycle 7-8 DB-time migration focused on API routes but did not address server actions. This is a process gap — the migration should have been comprehensive across all server-side write paths.
**Fix:** Extend the migration to server actions.
