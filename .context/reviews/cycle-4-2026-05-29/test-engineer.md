# Test-Engineer Review — Cycle 4 (2026-05-29)

## Coverage gaps tied to this cycle's findings

### TE-C4-1 [Low / High] — no test for IPv4-mapped IPv6 in `ip.test.ts` / `ip-allowlist.test.ts`
`tests/unit/security/ip.test.ts` (9 tests) covers plain IPv4 XFF, hop counts,
X-Real-IP, and invalid IPs, but NOT the `::ffff:a.b.c.d` mapped form.
`tests/unit/judge/ip-allowlist.test.ts` covers IPv4 + IPv6 CIDR but not a mapped
client IP. When SEC-C4-1 is fixed, add:
  - `extractClientIp` returns the normalized `a.b.c.d` (or accepts the mapped form)
    for `x-forwarded-for: "::ffff:203.0.113.9, 203.0.113.10"`.
  - `isJudgeIpAllowed` allows a mapped client IP that matches an IPv4 allowlist
    entry.

### TE-C4-2 [Low / Medium] — no test asserting `findSessionUser` not-found sentinel
Add a test asserting `findSessionUser` returns `null` (not `undefined`) when the
user row is missing, locking in the CR-C4-1 fix and matching the sibling's contract.

### TE-C4-3 [Low / Low] — no test for partial-result score in poll route
No unit test asserting behavior when a worker reports fewer results than the
problem's test-case count (SEC-C4-3). Add once a server-side count check exists.

## Confirmations
- `rate-limiter-rs` has unit tests for increment/block and reset.
- `verdict.ts` pure functions appear exercised indirectly by poll route tests.
