# Security Reviewer - Cycle 2/100 (2026-06-30)

## Findings

### C2-3 - Medium - Compiler fallback still grants world-readable/writable workspaces when `chown` fails
- Evidence: `src/lib/compiler/execute.ts:740-756` logs and falls back to `0o777` for the workspace and `0o666` for source files. The same broad fallback exists in `judge-worker-rs/src/executor.rs:321-395` and `judge-worker-rs/src/runner.rs:754-796`.
- Failure scenario: on a multi-user host or compromised sibling process, in-flight student source and compiled artifacts become readable or writable through host filesystem permissions if `chown` fails.
- Fix: fail closed when ownership cannot be assigned to the sandbox uid/gid; keep `0o700`/`0o600` only after successful ownership transfer.
- Confidence: High.

### C2-4 - High - HTTP recovery for dedicated workers exposes judge tokens if enabled
- Evidence: `judge-worker-rs/src/config.rs:343-382` correctly rejects non-local HTTP unless `JUDGE_ALLOW_INSECURE_HTTP=1`; the observed algo worker env used `http://algo.xylolabs.com/api/v1`.
- Failure scenario: trying to "fix" registration by enabling insecure HTTP would send bootstrap and per-worker secrets over cleartext.
- Fix: make deploy automation write HTTPS app URLs for worker hosts and fail closed instead of recommending insecure HTTP.
- Confidence: High.
