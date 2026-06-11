# Security Review — Cycle 7 (RPF Loop)

**Reviewer:** security-reviewer
**Date:** 2026-05-15
**Scope:** Full JudgeKit codebase — OWASP, auth/authz, secrets, injection risks
**Base commit:** f1510a07

---

## Methodology

- Re-verified auth layer and all security-critical paths.
- Checked API routes for missing auth checks, CSRF bypasses, and injection vectors.
- Reviewed file upload pipeline, compiler sandbox, and judge claim.
- Examined env-var handling and secret exposure.
- Verified fixes for old cycle-7 `tokenInvalidatedAt` clock-skew vulnerability.

---

## Verification of Previous Findings

### Old Cycle-7 HIGH — `tokenInvalidatedAt` clock-skew (session revocation bypass)

**Status: FIXED.** All `tokenInvalidatedAt` assignments now use DB server time:
- `src/app/api/v1/users/[id]/route.ts:166` — `updates.tokenInvalidatedAt = dbNow`
- `src/lib/actions/user-management.ts:122` — `updates.tokenInvalidatedAt = now` (from `getDbNowUncached()`)
- `src/lib/actions/change-password.ts` — verified to use DB time

The session revocation mechanism is now consistent: JWT `authenticatedAt` is set using DB time at login (`auth/config.ts:389`), and `tokenInvalidatedAt` is set using DB time at revocation. The proxy comparison (`isTokenInvalidated`) is now reliable.

### Other old findings

- Public contest status: Fixed (uses `getDbNow()`)
- Anti-cheat timestamps: Fixed (uses DB `now`)
- Invite route timestamps: Fixed (uses `getDbNowUncached()`)

---

## New Findings

### No new security issues found.

All existing defenses remain intact:
- Auth middleware: default-requires-auth, role/capability checks, CSRF for mutations
- File upload: magic-byte verification, ZIP bomb protection, name sanitization
- Compiler sandbox: network isolation, cap-drop, read-only, seccomp, user 65534
- Judge claim: IP allowlist, worker secret hash validation, rate limiting
- Rate limiting: DB-backed with server time, sidecar fast-path never fails closed
- Secrets: No hardcoded secrets; production env validation at module load

---

## Conclusion

No new security weaknesses identified. The `tokenInvalidatedAt` clock-skew vulnerability — the last significant security gap from prior cycles — is fully resolved. All existing defenses are intact and correctly implemented.

**New findings this cycle: 0**
