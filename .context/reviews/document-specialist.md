# Document Specialist - Cycle 2/100 (2026-06-30)

## Findings

### C2-9 - Low/Medium - Deployment docs do not state that dedicated worker `.env` is reconciled by deploys
- Evidence: `docs/deployment.md` explains the worker compose environment but not the split-host deploy script's responsibility to keep `JUDGE_BASE_URL` aligned with the app domain.
- Failure scenario: future operators manually set HTTP or stale domains on worker hosts and expect app deploys to fix everything.
- Fix: document that `deploy-docker.sh` upserts `JUDGE_BASE_URL=<app AUTH_URL>/api/v1` for `WORKER_HOSTS`, and that non-local HTTP is rejected.
- Confidence: High.
