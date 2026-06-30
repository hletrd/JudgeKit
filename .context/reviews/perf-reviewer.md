# Perf Reviewer - Cycle 2/100 (2026-06-30)

## Findings

### C2-8 - Low - Fixed sleep after worker restart slows deploys and still misses health transitions
- Evidence: `deploy-docker.sh` sleeps 5 seconds unconditionally before checking `docker ps`.
- Failure scenario: a healthy worker may still be inside the Docker healthcheck start period, or a failing worker may be between restarts when checked.
- Fix: replace the fixed sleep with bounded polling of running and health status.
- Confidence: Medium.

Storage note: the algo worker host currently has ample free space, so storage pressure is not the root cause of this failure.
