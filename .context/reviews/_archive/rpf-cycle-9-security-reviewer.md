# RPF Cycle 9 — Security Reviewer

**Date:** 2026-04-29
**HEAD reviewed:** `1bcdd485`.
**Change surface:** README + `deploy-docker.sh` + 2 rate-limit JSDoc headers.

## Security-relevant inventory at HEAD

- `src/lib/auth/config.ts` — UNCHANGED (per CLAUDE.md no-touch rule).
- `src/lib/security/encryption.ts:79-81` — plaintext-fallback decrypt (C7-AGG-7 carry). **Unchanged.**
- `src/lib/security/{rate-limit,api-rate-limit,in-memory-rate-limit}.ts` — top-of-file headers added cycle 8 cross-referencing each other; no runtime change.
- `deploy-docker.sh` — `DEPLOY_SSH_RETRY_MAX` soft cap added cycle 8.
- `.env*` files — UNCHANGED.

## Findings

**0 NEW HIGH / MEDIUM / LOW.**

### Soft cap on `DEPLOY_SSH_RETRY_MAX` (cycle 8 commit `d9cb15e6`)

Security review of the cap implementation:
1. **Operator override preserved up to cap.** ✅ Compliant — admin can set values 1-100 without warning.
2. **Cap is soft, not hard.** ✅ The deploy continues with clamped value rather than aborting; reduces risk of operator lockout from a typo.
3. **Cap value (100) at 2-30s exponential backoff yields ~25min retry window.** ✅ Well past any realistic boot-window; protects against IDS/fail2ban triggering on prolonged retry storms.
4. **Cap path uses arithmetic comparison `(( max_attempts > 100 ))`.** ✅ Safe after the prior `[[ "$max_attempts" =~ ^[0-9]+$ ]]` validation guarantees integer-ness.
5. **No new shell injection vectors.** ✅ `max_attempts` is constrained to `[1..100]` by the validation+cap pair.
6. **Warn-line clarity.** ✅ `"DEPLOY_SSH_RETRY_MAX='${max_attempts}' exceeds soft cap of 100; clamping to 100"` — clear, actionable.

### Rate-limit JSDoc headers (cycle 8 commit `9c8d072e`)

Security review of the orientation comments:
1. **Documents the canonical 3-module split.** ✅ Reduces drift risk (the failure class explicitly documented in C7-AGG-9).
2. **Cross-references explain when to use each module.** ✅ "high-throughput per-instance" vs "cross-instance API limits" vs "login/auth limits" — all correct.
3. **Documents that DB-time is used in `api-rate-limit.ts` (and by extension `rate-limit.ts`) to avoid clock skew.** ✅ Aligns with the `/api/v1/time` DB-time mechanism documented in README.

No new attack surface; no behavior change.

### README `/api/v1/time` documentation (cycle 8 commit `1cdf79ed`)

Security review:
1. **Documents the endpoint behavior accurately.** ✅
2. **No secret leakage** — only public endpoint shape and response fields.
3. **Documents `force-dynamic` rationale**, which protects against stale-cache-served timestamps (relevant to deadline enforcement).

No new findings.

## Carry-forward security items

| ID | Severity | Status | Exit criterion |
|---|---|---|---|
| C7-AGG-7 | LOW | DEFERRED | `src/lib/security/encryption.ts:79-81` plaintext fallback. Exit: production tampering incident OR audit cycle. |
| C7-AGG-9 | LOW | DEFERRED-with-doc-mitigation | 3-module rate-limit duplication. Cycle-8 added orientation comments (partial mitigation). Exit: rate-limit consolidation cycle. |
| D1, D2 | MEDIUM | DEFERRED | Auth JWT clock-skew + DB-per-request. Fix must live OUTSIDE `src/lib/auth/config.ts`. Exit: auth-perf cycle. |

## Confidence

High on "0 NEW security findings." The cycle-8 diff strengthens existing protections (deploy retry cap reduces fail2ban/IDS lockout risk) and improves documentation; no surface area added.

## Recommendation

No security items urgent for cycle 9. C7-AGG-7 (plaintext fallback) could be picked next cycle if a doc-only mitigation (clarifying audit-trail expectation) is acceptable, but it is currently DEFERRED with appropriate exit criteria.
