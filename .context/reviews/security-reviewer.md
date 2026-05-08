# Security Review — Cycle 18/100

**Reviewer:** security-reviewer (manual)
**Date:** 2026-05-08
**HEAD:** 2b3e22c1
**Scope:** API routes, auth layer, security utilities, data handling patterns

---

## NEW FINDINGS

None. No new security findings this cycle.

## Verified Safe

- `dangerouslySetInnerHTML` in `problem-description.tsx` is guarded by `sanitizeHtml`
- `dangerouslySetInnerHTML` in `json-ld.tsx` is guarded by `safeJsonForScript` (now with U+2028/U+2029 escaping, commit 6fdf3e3c)
- All API routes have proper auth checks via `createApiHandler` or manual guards
- No raw SQL injection vectors found (all parameterized or module-level constants)
- CSRF tokens validated on state-changing POST endpoints
- `locale-switcher.tsx` now always sets `Secure` flag on cookie (commit 19e7ddc2)
- `node-shutdown.ts` properly catches errors in `beforeExit` handler (commit d75041f3)
- No secrets in code
- No unsafe eval/exec patterns
- All `request.json()` calls in API routes have try/catch guards

## Final Sweep

- Checked all API routes for missing auth — none found
- Checked for secrets in code — none found
- Checked for unsafe eval/exec — none found
- No relevant files were skipped.
