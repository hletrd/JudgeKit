# architect — Cycle 3 (2026-05-29)

Scope: coupling/layering in the email subsystem and the recruiting-invitation
routes; consistency of cross-cutting helpers (URL origin, secret redaction).

## ARCH-C3-1 [Low / High] — Outbound-link origin is computed ad hoc in two routes instead of via a single domain helper
`public-signup.ts:193-195` and `recruiting-invitations/route.ts:123-125` each
re-derive the public origin from request headers. The system already owns the
concept of a canonical origin (`getAuthUrl()`) and of host trust
(`getTrustedAuthHosts`, `validateTrustedAuthHost`, `normalizeHostForComparison`)
in `src/lib/security/env.ts` + `auth/trusted-host.ts`. The email layer should
DEPEND on that single source rather than re-implement origin derivation.
- Design fix: add `getPublicBaseUrl(headerHost?: string)` to `env.ts`
  (canonical-first, host-fallback), and have both email-sending sites call it.
  Eliminates duplication AND aligns the email layer with the existing trust
  boundary. This is the carried-over F4-cycle1 / ARCH-C2-x, now with a concrete
  layering recommendation.

## ARCH-C3-2 [Low / High — PRODUCT DECISION, deferred] — Single-create and bulk-create recruiting routes diverge on email side effects
`recruiting-invitations/route.ts:119-148` auto-emails the invitation; the sibling
`bulk/route.ts` does not. Same capability, same resource, asymmetric side effects.
The token IS available in-memory for bulk (`recruiting-invitations.ts:227`), so a
shared `sendRecruitingInvitationEmail(invitation, assignment, baseUrl)` helper
called by both (bulk under `p-limit(2-3)`) is the clean architecture if "send" is
the intended behavior. This is a behavioral/product divergence, not a defect:
picking the wrong behavior is worse than waiting. Carried-over F2-cycle2; remains
DEFERRED pending product intent (ledger criterion already recorded in
plans/open/2026-05-29-cycle-2-rpf-review-remediation.md).

## ARCH-C3-3 [Low / Medium] — Transporter cache + `lastConfigHash` couple secret material to module lifetime
`smtp.ts:8-13`. Module-scope mutable singleton holds the decrypted password
(via `lastConfigHash`). Acceptable for a single-process pool, but the cache key
should be a fingerprint, not the cleartext config, to decouple secret lifetime
from cache identity. Carried-over CR-C2-1. OPEN.

## Confirmed-good
- `SECRET_SETTING_KEYS` (cycle-2) is the right shape: a single set drives both
  encryption-at-write and audit-redaction intent. Good consolidation.
- Provider abstraction (`EmailProvider` interface, ordered `providers[]`,
  `detectProvider` with per-provider try/catch) is clean and extensible.

## Final sweep
The dominant architectural recommendation is ARCH-C3-1 (centralize the public
base-URL helper) — it closes a duplication, a trust-boundary gap, and a carried
deferral at once. ARCH-C3-2 stays deferred (product decision).
