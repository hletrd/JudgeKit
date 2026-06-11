# Tracer — Causal Tracing — Cycle 4 (2026-05-29)

## Hypothesis under test: "a legitimate worker can be locked out after enabling JUDGE_ALLOWED_IPS"

Trace (competing hypotheses):
- H1 (LEADING): the extracted client IP arrives in IPv4-mapped form and is rejected.
  Path: Nginx `proxy_set_header X-Forwarded-For $remote_addr`
  (`scripts/online-judge.nginx.conf:61`) → on a dual-stack listener `$remote_addr`
  = `::ffff:a.b.c.d` → `extractClientIp` → `isValidIp` returns false (verified by
  execution) → returns null in production → `isJudgeIpAllowed` line 171 returns
  false → 403. CONFIRMED mechanism end-to-end. Conditional on dual-stack Nginx, so
  Medium confidence it actually fires in the algo.xylolabs.com topology.
- H2 (REJECTED): "allowlist matcher is wrong" — refuted; `ipv6ToBytes` correctly
  parses both pure and mapped IPv6, and IPv4 CIDR math is correct. The matcher is
  fine; the upstream extractor is the culprit.
- H3 (REJECTED): "worker token mismatch" — would surface as `invalidWorkerToken`
  (401), not `ipNotAllowed` (403). Different code path.

Conclusion: single root cause = `isValidIp` mapped-form rejection (SEC-C4-1).
Fixing it resolves both the allowlist lockout and the rate-limit-key coarsening.
