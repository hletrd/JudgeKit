# Verifier - Cycle 2/100 (2026-06-30)

## Findings

### C2-1 verified - Algo worker restart loop is caused by stale HTTP `JUDGE_BASE_URL`
- Evidence: read-only SSH inspection of `worker-0.algo.xylolabs.com` showed healthy storage (`/` and DockerRootDir at 40%) and `~/judgekit/.env` containing `JUDGE_BASE_URL=http://algo.xylolabs.com/api/v1`. Recent worker logs repeatedly reported: `Judge URL must use HTTPS for non-local addresses`.
- Failure scenario: deployment can never pass on algo until the worker env is corrected to `https://algo.xylolabs.com/api/v1`.
- Fix: upsert the worker base URL from the app deploy target before restart.
- Confidence: High.

### Storage requirement verified - Safe cleanup policy is present
- Evidence: `deploy-docker.sh` and `scripts/docker-disk-cleanup.sh` use stopped-container prune, dangling-only `docker image prune -f`, builder prune, and BuildKit history cleanup; no automated `docker volume prune` path remains in the inspected deploy automation.
- Confidence: High.
