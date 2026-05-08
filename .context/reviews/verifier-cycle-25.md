# Verifier — Cycle 25

**Date:** 2026-04-24
**Scope:** Evidence-based correctness verification

---

## V-1: [MEDIUM] `getAssignmentStatusRows` late-penalty SQL diverges from canonical `buildIoiLatePenaltyCaseExpr`

**Confidence:** HIGH (verified by code comparison)
**Citations:** `src/lib/assignments/submissions.ts:568-578` vs `src/lib/assignments/scoring.ts:54-76`

I verified the divergence by comparing the two SQL CASE expressions line by line:

**Canonical (`buildIoiLatePenaltyCaseExpr`):**
- Branch 1: `@deadline IS NOT NULL AND @latePenalty > 0 AND @examMode != 'windowed' AND submitted_at > @deadline` — applies penalty
- Branch 2: `@examMode = 'windowed' AND @latePenalty > 0 AND personal_deadline IS NOT NULL AND submitted_at > personal_deadline` — applies penalty
- Else: no penalty

**Inline (`getAssignmentStatusRows`):**
- Branch 1: `@deadline::timestamptz IS NOT NULL AND @latePenalty::double precision > 0 AND @examMode::text != 'windowed' AND s.submitted_at > @deadline::timestamptz` — applies penalty
- Else: no penalty

The inline version is missing Branch 2 entirely. This is confirmed — windowed-exam late penalties are not applied on the assignment status page.

**Fix:** Replace inline CASE with `buildIoiLatePenaltyCaseExpr()`.

---

## V-2: [LOW] `rateLimitedResponse` uses `Date.now()` fallback — minor header accuracy issue

**Confidence:** MEDIUM
**Citations:** `src/lib/security/api-rate-limit.ts:125`

Verified that both callers (`consumeApiRateLimit` and `consumeUserApiRateLimit`) always pass `nowMs` from the `atomicConsumeRateLimit` return value, which uses `getDbNowMs()`. The `Date.now()` fallback in `rateLimitedResponse` is technically dead code in normal operation. However, the function signature allows `nowMs` to be `undefined`, which is a latent risk if a future caller omits it.

**Fix:** Make `nowMs` a required parameter or add a runtime assertion in development.

---

## Positive Observations

- All cycle 24 fixes verified as correctly implemented:
  - Referrer-Policy and X-Content-Type-Options headers are set in `createSecuredNextResponse`
  - `getRetentionCutoff` callers pass `getDbNowMs()` in both `data-retention-maintenance.ts` and `cleanup.ts`
  - ZIP validation reads `uncompressedSize` from metadata with fallback to decompression
  - `verifyPassword` calls `argon2.needsRehash()` for Argon2 hashes
  - `verifyAndRehashPassword` handles both bcrypt migration and Argon2 parameter updates
