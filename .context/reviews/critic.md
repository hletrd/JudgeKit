# Critic - Cycle 2/100 (2026-06-30)

## Findings

### C2-4 - High - Insecure HTTP is the wrong recovery path for algo
- Evidence: the worker's error text offers `JUDGE_ALLOW_INSECURE_HTTP=1`, but this is only safe for controlled development networks. Production deploy automation should never normalize that bypass.
- Failure scenario: incident recovery restores uptime at the cost of transmitting judge secrets and submissions over cleartext.
- Fix: deploy should enforce HTTPS worker URLs for `WORKER_HOSTS`.
- Confidence: High.

### C2-2 - Medium - Error wording points operators at the wrong subsystem
- Evidence: the deploy failure text says to check the docker-capability probe log for any non-running worker.
- Failure scenario: registration failures, TLS failures, or env failures are mistaken for docker-proxy failures.
- Fix: include sanitized logs and use neutral wording.
- Confidence: High.
