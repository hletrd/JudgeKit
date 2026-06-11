# Code Quality Review — Cycle 1 (2026-05-29)

Scope: recently-changed files + cross-file interactions in email/settings/signup.

## Findings

### CR-C1-1 — Dead import triggers the only lint warning in the repo [Low / High confidence]
File: `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:12`
```ts
import { getContestAssignment, canManageContest, canMonitorContest } from "@/lib/assignments/contests";
```
`canManageContest` is imported but never referenced (GET uses `canMonitorContest`,
POST uses an inline `rawQueryOne` access check). `npm run lint` reports exactly one
warning for this. The comment at line 179 references the symbol only prose-wise.
Fix: remove `canManageContest` from the import list. Verified unused by reading the
whole file — no other reference exists.

### CR-C1-2 — Email base-URL derivation duplicated and trusts Host/X-Forwarded-Proto [Low / Medium confidence]
Files:
- `src/lib/actions/public-signup.ts:192-195`
- `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:122-124`
Both compute `baseUrl` from `x-forwarded-proto` + `host` headers. This is duplicated
logic and trusts client-influenced headers to build links embedded in outbound
emails. If `Host` can be spoofed (no allowed-hosts enforcement on this path), the
verification/invite link could point at an attacker host. Most deployments terminate
at a trusted proxy that overwrites Host, so exploitability is deployment-dependent.
Fix: centralize into a helper (e.g. `getPublicBaseUrl()` in `src/lib/security/env.ts`,
which already exposes `getAuthUrlObject()`), preferring the configured canonical URL
over request headers. De-duplicates and removes the spoofing surface.

### CR-C1-3 — `hashConfig` embeds the decrypted SMTP password in an in-memory string [Low / High confidence]
File: `src/lib/email/providers/smtp.ts:11-13,101`
`hashConfig` is `JSON.stringify(config)` where `config` includes the cleartext `pass`.
The resulting string is retained in `lastConfigHash` for the process lifetime. It is
never logged, so disclosure risk is minimal, but it is an unnecessary cleartext-secret
retention and the name "hash" is misleading (it is not hashed). Fix: hash the
serialized config (e.g. sha256 hex) or key the transporter cache on non-secret fields
(host/port/secure/user) plus a sha256 of the pass.

## Confirmed-safe
- `mapZodIssueToSignupError` (public-signup.ts:47) defaults unknown issues to a generic
  error — good, avoids leaking schema internals.
- Transaction-scoped uniqueness checks + advisory lock in recruiting POST are correct.
