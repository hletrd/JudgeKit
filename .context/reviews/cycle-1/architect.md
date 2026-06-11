# Architecture Review — Cycle 1 (2026-05-29)

## Findings

### ARCH-C1-1 — Public base-URL derivation is not centralized [Low / Medium confidence]
Two independent call sites build the outbound-link base URL from request headers:
- `src/lib/actions/public-signup.ts:192-195`
- `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:122-124`
`src/lib/security/env.ts` already owns the notion of the canonical auth URL
(`getAuthUrlObject()`). Email link construction is a cross-cutting concern that should
live in one helper so policy (trusted host, scheme) is enforced uniformly. Today the
logic is copy-pasted and trusts `Host`/`X-Forwarded-Proto`. See CR-C1-2 / SEC angle.
Fix: add `getPublicBaseUrl(headers)` to `src/lib/security/env.ts` and use it in both
sites (and any future email-link site).

### ARCH-C1-2 — Email provider abstraction is sound; minor coupling note [Info / High confidence]
The provider pattern (`providers/index.ts` with sendgrid/resend/ses/smtp fallbacks)
is well-layered. `src/lib/email/smtp.ts` is a thin back-compat re-export — acceptable.
No action; documented for provenance. The high-level operations in `src/lib/email/index.ts`
(token generation, TOCTOU-safe verify/reset transactions) are correctly separated from
transport.

## Confirmed-sound
- Capability-gated server actions (`resolveCapabilities` + `caps.has(...)`) and
  `isTrustedServerActionOrigin` consistently applied on the settings/signup actions.
- DB-time sourcing (`getDbNowUncached`) used consistently for expiry/boundary checks,
  avoiding app-vs-DB clock skew.
