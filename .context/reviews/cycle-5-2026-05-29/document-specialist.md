# Document Specialist — Cycle 5 (2026-05-29)

Doc/code consistency for the reviewed surface.

## DOC-C5-1 (= N1) — comment vs behavior in heartbeat
`heartbeat/route.ts:41-44` documents that `activeTasks` from the worker body is
intentionally NOT persisted because claim/poll manage it atomically. That comment
is accurate for the LIVE path but is silent on the crash path: nothing reconciles
`active_tasks` when a worker dies. Recommend, when fixing N1, extend the comment
(or the sweep) to state how a dead worker's counter is reconciled (zeroed past the
stale-claim timeout) so the documented invariant holds on all paths.

## DOC-C5-2 — register response advertises STALE_CLAIM_TIMEOUT_MS=300_000
`register/route.ts:22,75` returns `staleClaimTimeoutMs: 300_000` to workers, while
the claim route reads `getConfiguredSettings().staleClaimTimeoutMs`
(claim/route.ts:175) which is admin-configurable. If an admin changes the setting,
the value advertised to workers at registration is the hard-coded 300 s constant,
not the live setting. Workers use it for their own self-timeout heuristics. Low /
informational — the authoritative reclaim is server-side (the CTE uses the live
setting), so a worker using a stale advertised value is not a correctness issue,
only a minor drift. Note for a future register-route touch; not actionable now.

## No README / AGENTS.md mismatch found
The judge-worker lifecycle description in AGENTS.md matches the register→heartbeat→
claim→poll→deregister flow observed in code.

Net-new: DOC-C5-1 (= N1, fold into the fix), DOC-C5-2 (informational).
