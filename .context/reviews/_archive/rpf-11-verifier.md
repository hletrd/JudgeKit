# RPF Cycle 11 — Verifier

**Date:** 2026-04-20
**Base commit:** 74353547

## Findings

### V-1: Recruiting token transaction writes 7 timestamps from app clock despite already fetching DB time at line 361 [MEDIUM/HIGH]

**File:** `src/lib/assignments/recruiting-invitations.ts`
**Description:** Verified by code inspection: line 361 uses `tokenInvalidatedAt: await getDbNowUncached()` but lines 362, 373, 390, 478, 485, 495, 497 use `new Date()`. This is a factual inconsistency within the same transaction. The `getDbNowUncached()` function is already imported (line 16) and used in the same function, so there is no import or architectural barrier to fixing this.
**Confidence:** HIGH
**Fix:** Replace all 7 `new Date()` with a `dbNow` variable fetched once at transaction start.

## Verified Correct

- Auth flow: verified Argon2id, timing-safe dummy hash, rate limiting, session invalidation.
- Access code flow: verified DB time used for `enrolledAt`, `redeemedAt`, and deadline check.
- File upload: verified MIME validation, size limits, path traversal protection.
- Recruiting token: verified atomic SQL claim with `NOW()` prevents TOCTOU on expiry.
- Export/restore: verified password re-confirmation, integrity manifest validation.
- Rate limiting: verified `SELECT FOR UPDATE` prevents TOCTOU.
- Korean letter-spacing: verified CSS custom properties with `:lang(ko)` override.
- Client-side date formatting: verified `useLocale()` used in all reviewed components.
