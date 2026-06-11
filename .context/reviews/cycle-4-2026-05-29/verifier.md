# Verifier — Evidence-Based Correctness — Cycle 4 (2026-05-29)

## Verified findings

### VER-C4-1 [Low / High] — `isValidIp` rejects IPv4-mapped IPv6 (empirically confirmed)
Ran the exact `isValidIp` source against representative inputs:
```
isValidIp("::ffff:1.2.3.4")     = false
isValidIp("::1")                = true
isValidIp("2001:db8::1")        = true
isValidIp("192.168.1.1")        = true
isValidIp("::ffff:192.168.1.1") = false
```
Confirms SEC-C4-1/DBG-C4-1: the mixed mapped form is rejected, so `extractClientIp`
returns null in production for it. The sibling `ipv6ToBytes` in `ip-allowlist.ts`
DOES handle the embedded-v4 tail — verified by reading lines 50-62 — so the two
modules disagree on what is a valid IPv6. HIGH confidence (executed).

### VER-C4-2 [Low / High] — `findSessionUser` return sentinel asymmetry (confirmed by read)
`find-session-user.ts:33,37` lack `?? null`; `:57,61` have it. The function's
inferred return type therefore includes `undefined`, contradicting the sibling it
references. HIGH confidence (direct source comparison).

## Verified NON-issues (claims checked and refuted)
- "Worker can forge results for any submission": refuted — poll/claim both gate the
  UPDATE on `judge_claim_token` equality inside a transaction; rowCount 0 → 403
  `invalidJudgeClaim` (poll/route.ts:88-94,153-159). Confirmed.
- "Rate limiter fails open on sidecar JSON garbage": refuted — non-JSON / bad-shape
  responses increment the failure counter and return null (DB authoritative)
  (rate-limiter-client.ts:83-99). Confirmed correct.
- Baseline gates: lint 0 errors, tsc 0, `npm run test:unit` 319 files / 2445 tests
  all pass, lint:bash 0. Verified this cycle.
