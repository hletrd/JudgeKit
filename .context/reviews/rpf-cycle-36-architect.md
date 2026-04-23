# Architect Review — RPF Cycle 36

**Date:** 2026-04-23
**Reviewer:** architect
**Base commit:** 601ff71a

## Inventory of Files Reviewed

- API handler framework (`src/lib/api/handler.ts`)
- Realtime coordination (`src/lib/realtime/realtime-coordination.ts`)
- Recruiting access (`src/lib/recruiting/access.ts`)
- DB export/import (`src/lib/db/export.ts`, `src/lib/db/import.ts`)
- Password hash utility (`src/lib/security/password-hash.ts`)
- All admin routes (`src/app/api/v1/admin/`)

## Findings

### ARCH-1: Password rehash logic still duplicated in 4 files — incomplete consolidation [MEDIUM/MEDIUM]

**File:** `src/app/api/v1/admin/backup/route.ts:63-82`, `src/app/api/v1/admin/migrate/export/route.ts:57-74`, `src/lib/auth/config.ts:268-291`, `src/lib/assignments/recruiting-invitations.ts:387-402`

**Description:** The `verifyAndRehashPassword` utility was extracted in cycle 34 but only applied to the import and restore routes. Four other locations still use the inline `verifyPassword` + manual rehash + `db.update` pattern. This is a DRY violation that creates risk of inconsistent behavior — for example, `verifyAndRehashPassword` includes `logger.info` for audit logging, but the inline versions don't.

The auth/config.ts case is somewhat different because it's inside the NextAuth callback where the rehash must happen before the session is created. The backup, export, and recruiting-invitations cases are straightforward replacements.

**Fix:** Replace inline rehash blocks with `verifyAndRehashPassword` in backup, export, and recruiting-invitations. For auth/config.ts, extract a shared `rehashPasswordIfNeeded(userId, password, storedHash)` internal helper.

**Confidence:** High

---

### ARCH-2: Chat widget entry animation does not respect prefers-reduced-motion — carry-over [LOW/MEDIUM — carry-over]

**File:** `src/lib/plugins/chat-widget/chat-widget.tsx:294`

**Description:** The chat widget container uses `animate-in fade-in slide-in-from-bottom-4 duration-200` without `motion-safe:` prefix. This was identified in prior cycles as CR-4 but remains unfixed. The global CSS has a `prefers-reduced-motion: reduce` override that sets `animation-duration: 0.01ms`, which effectively disables the animation for users with reduced motion preferences. However, the `animate-in` class from tailwindcss-animate may still trigger layout calculations.

**Fix:** Use `motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4` or rely on the global CSS override (which is already present and functional).

**Confidence:** Medium (global CSS override is effective; class-level fix is cleaner)

---

## Carry-Over Items

- AGG-7: Manual routes duplicate createApiHandler boilerplate (deferred)
- AGG-8: Global timer HMR pattern duplication (deferred)
