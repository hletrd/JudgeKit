# Cycle 28 Security Review

**Date:** 2026-04-20
**Reviewer:** security-reviewer
**Base commit:** d4489054

## Findings

### SEC-1: `compiler-client.tsx` localStorage write without exception handling [LOW/MEDIUM]

**File:** `src/components/code/compiler-client.tsx:183`
**Problem:** `localStorage.setItem("compiler:language", language)` is called without try/catch. In private browsing mode (Safari) or when storage quota is exceeded, this throws `QuotaExceededError` which is unhandled and crashes the component. While this is not a security vulnerability per se, the unhandled exception can leak component state information to browser DevTools in production, which is inconsistent with the codebase's convention of gated logging (see cycle 27 AGG-8 fix).
**Fix:** Wrap in try/catch, consistent with all other localStorage operations in the codebase.

### SEC-2: `submission-detail-client.tsx` localStorage write without exception handling [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/submissions/[id]/submission-detail-client.tsx:94`
**Problem:** Same class as SEC-1. The `handleResubmit` function writes a draft payload to localStorage without try/catch. The payload includes `submission.sourceCode` which could be sensitive (e.g., exam solutions). While this is a client-side-only issue, the unhandled exception in private browsing would prevent the resubmit navigation from completing.
**Fix:** Wrap in try/catch.

## Verified Safe / No Issue

- CSP headers are comprehensive and properly configured (nonce-based, no `'unsafe-eval'` in production, hcaptcha domains conditionally added for signup).
- HSTS headers properly set with `includeSubDomains` for HTTPS, cleared for HTTP-only sites.
- CSRF protection via `X-Requested-With: XMLHttpRequest` header on all `apiFetch` calls.
- Rate limiting uses two-tier strategy (sidecar + PostgreSQL with SELECT FOR UPDATE) preventing TOCTOU races.
- Auth flow: Argon2id, timing-safe dummy hash, token invalidation, must-change-password enforcement.
- Proxy correctly strips `x-forwarded-host` to prevent RSC streaming corruption (with documented safety constraint for auth routes).
- UA hash mismatch is audit-only (not a hard reject), which is appropriate given legitimate UA changes.
- `authUserCache` in proxy is FIFO with 2-second TTL, 500-entry cap. Negative results are not cached.
- API routes with `Bearer` auth are passed through to route handlers for API key validation.
- Recruit token flow uses atomic SQL transactions.
- `sign-out.ts` properly clears app-specific storage prefixes without destructive `localStorage.clear()`.
- No `dangerouslySetInnerHTML` without sanitization.
- No `eval()` or `innerHTML` assignments.
- `window.confirm` only used in `use-unsaved-changes-guard.ts` (deferred as DEFER-15).
