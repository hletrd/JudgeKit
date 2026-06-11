# Critic — Multi-Perspective Critique — Cycle 4 (2026-05-29)

This is a very mature repo (50+ prior review cycles); net-new high-severity issues
are scarce. The strongest net-new signal this cycle is the IP-parsing asymmetry,
flagged independently by security, debugger, verifier, tracer, and architect — a
genuine cross-cutting defect, not a stylistic nit.

1. **IPv4-mapped IP rejection (SEC/VER/DBG/TRACE/ARCH agreement).** Real, verified
   by execution, fail-safe (denies, never wrongly allows). The right fix is a
   SHARED normalizer (architect's point) rather than patching `isValidIp` alone —
   otherwise the two parsers drift again. Medium confidence it fires in production
   depends on the actual Nginx listener (dual-stack?), so the plan should treat the
   normalize-and-test as the deliverable and note the production-conditionality.

2. **`findSessionUser` sentinel (`undefined` vs `null`).** Small but legitimate;
   the two functions advertise a shared contract in their own comments yet break it.
   One-line fix + one test. Worth doing now.

3. **Score inflation / testCaseId scoping (SEC-C4-2/3).** Both are gated by the
   worker trust boundary (claimToken + authenticated worker). I'd caution AGAINST
   over-engineering server-side full-result validation this cycle: workers are
   trusted infra and the FK already prevents fabricated test-case IDs. Defer with a
   clear exit criterion (re-open if untrusted/3rd-party workers are ever allowed).

Recommendation: implement #1 (shared IP normalizer + tests) and #2 (sentinel) this
cycle; defer #3-class items with severity preserved.
