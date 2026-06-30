# Test Engineer - Cycle 2/100 (2026-06-30)

## Findings

### C2-5 - Medium - Deploy safety tests do not pin worker-host URL repair
- Evidence: `tests/unit/infra/deploy-storage-safety.test.ts` verifies target selection, runner URL upserts, storage roots, and safe prune commands, but has no assertion that `WORKER_HOSTS` updates `JUDGE_BASE_URL`.
- Failure scenario: the exact algo regression can reappear without failing unit gates.
- Fix: add static coverage for worker `JUDGE_BASE_URL` upsert, HTTPS fail-closed guard, and sanitized log tailing.
- Confidence: High.

### C2-6 - Medium - Workspace-permission tests currently codify the broad fallback
- Evidence: `tests/unit/compiler/execute-implementation.test.ts` and `judge-worker-rs/src/runner.rs` tests assert `0o777`/`0o666` fallback behavior.
- Failure scenario: tests block the security hardening requested by the queued TODO.
- Fix: update tests to assert fail-closed ownership handling and absence of `0o777`/`0o666` in executable code paths.
- Confidence: High.
