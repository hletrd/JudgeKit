# Architectural Review — RPF Cycle 21

**Reviewer:** architect
**Date:** 2026-04-24
**Scope:** Full repository

---

## A-1: [MEDIUM] Anti-cheat heartbeat dedup uses `Date.now()` — same as CR-1/S-1, architectural angle

**File:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:92-96`
**Confidence:** HIGH

From an architectural perspective, this is a pattern inconsistency. The codebase has established a strong convention of using DB server time (`getDbNowMs()`, `SELECT NOW()`) for all temporal boundary checks. The anti-cheat route correctly uses DB time for contest start/end checks (lines 63-73) but then falls back to `Date.now()` for the heartbeat dedup. This is a maintenance risk: new developers seeing `Date.now()` in this file may assume it is acceptable for temporal checks, perpetuating the inconsistency.

**Fix:** Same as CR-1 — use the DB `now` value for the dedup comparison. Additionally, consider adding a code comment or lint rule that flags `Date.now()` usage in server-side contest/exam boundary code.

---

## A-2: [LOW] Settings redaction logic is duplicated across API route and server action

**File:** `src/app/api/v1/admin/settings/route.ts:21-25, 131-135` and `src/lib/actions/system-settings.ts:186`
**Confidence:** MEDIUM

The hcaptchaSecret redaction pattern is duplicated in the API route and the server action. Both use `as Record<string, unknown>` casting and inline `redactSecret()` calls. If a new secret field is added to systemSettings, both locations must be updated independently. This violates DRY and creates a risk of one location being missed.

**Fix:** Centralize the secret field list and redaction logic in a single module, e.g., `redactSettingsForApi(settings)` in `src/lib/system-settings.ts`.

---

## Positive Architectural Observations

- The `createApiHandler` factory pattern provides consistent auth, CSRF, rate limiting, and validation across all API routes
- Domain-separated encryption keys via HKDF prevent cross-domain key reuse
- The export/import system uses streaming to avoid loading entire DB dumps into memory
- Judge worker claim uses atomic SQL CTEs for correctness under concurrency
