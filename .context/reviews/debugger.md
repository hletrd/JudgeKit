# Debugger - Cycle 2/100 (2026-06-30)

## Findings

### C2-2 - Medium - Worker post-restart probe is too shallow for registration failures
- Evidence: `deploy-docker.sh` sleeps 5 seconds then greps `docker ps` for `Up`. It does not inspect Docker health status or show the registration/config error that caused the container to exit.
- Failure scenario: an operator receives `worker is NOT running after restart — check the docker-capability probe log` even when the root cause is `JUDGE_BASE_URL=http://...`.
- Fix: poll `.State.Health.Status` and emit the last worker logs with token redaction before failing.
- Confidence: High.
