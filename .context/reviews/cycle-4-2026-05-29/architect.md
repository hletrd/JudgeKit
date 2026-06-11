# Architect — Design / Coupling Review — Cycle 4 (2026-05-29)

## Findings

### ARCH-C4-1 [Low / Medium] — two IP-parsing implementations that disagree
There are two independent IP validators/parsers: `security/ip.ts:isValidIp`
(client-IP extraction) and `judge/ip-allowlist.ts:ipv6ToBytes`/`ipMatchesAllowlistEntry`
(allowlist matching). They diverge on IPv4-mapped IPv6 (one rejects, one accepts) —
the SEC-C4-1 root cause. Architectural smell: the "what is a valid IP" predicate
is duplicated. FIX direction: extract a shared `normalizeIp`/`isValidIp` primitive
(supporting mapped form) used by both modules, so the extractor and the matcher
can never disagree again.

### ARCH-C4-2 [Low / Low] — sentinel-type inconsistency across paired functions
`findSessionUser` (undefined) vs `findSessionUserWithPassword` (null) — paired
functions sharing a doc-comment cross-reference should share a return contract
(CR-C4-1). Small, but it is a layering/contract consistency issue worth normalizing.

## Confirmations
- Rate-limit layering is sound: shared core (`rate-limit-core.ts`) + two policy
  consumers + optional fail-open sidecar. The module headers explicitly document
  the drift-tracking contract. Good design.
- Judge auth correctly separates shared-token (registration) from per-worker secret
  (claim/report). Trust boundary is explicit.
