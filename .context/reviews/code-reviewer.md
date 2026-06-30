# Code Reviewer - Cycle 2/100 (2026-06-30)

Scope: deployment loop continuation after cycle 1 stopped on `algo-worker-register`, plus the queued workspace-permission TODO.

## Findings

### C2-1 - High - Dedicated worker deploy does not repair stale `JUDGE_BASE_URL`
- Evidence: `deploy-docker.sh:1282-1345` rebuilds and restarts each `WORKER_HOSTS` target with `docker compose -f docker-compose.worker.yml --env-file .env up -d`, but never writes the target app URL into the worker host's `.env`. Read-only inspection of `worker-0.algo.xylolabs.com` showed `JUDGE_BASE_URL=http://algo.xylolabs.com/api/v1`, which the worker rejects before registration.
- Failure scenario: a worker host keeps an old HTTP base URL while the app is TLS-only; every deploy rebuilds the image, then the worker exits in a restart loop before `/judge/register`.
- Fix: upsert `JUDGE_BASE_URL=${AUTH_URL_TARGET}/api/v1` in each worker host `.env` before compose restart, and reject non-local HTTP URLs for dedicated workers.
- Confidence: High.

### C2-2 - Medium - Worker restart failure does not surface the relevant logs
- Evidence: `deploy-docker.sh:1342-1357` checks only whether the container is `Up` after a fixed 5 seconds, then emits a generic docker-capability probe message.
- Failure scenario: registration or HTTPS config failures are misdiagnosed as docker-proxy problems, slowing recovery.
- Fix: wait for the worker healthcheck and tail sanitized worker logs on failure.
- Confidence: High.
