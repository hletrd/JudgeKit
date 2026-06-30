# Tracer - Cycle 2/100 (2026-06-30)

## Causal Trace

1. `DEPLOY_TARGET=algo` sources `.env.deploy.algo`, making the app deploy app-only and listing `WORKER_HOSTS=worker-0.algo.xylolabs.com:...`.
2. `deploy-docker.sh` computes and upserts `AUTH_URL` on the app host, then later rebuilds the dedicated worker image.
3. The worker host's existing `~/judgekit/.env` is preserved and reused by `docker compose -f docker-compose.worker.yml --env-file .env up -d`.
4. That env currently says `JUDGE_BASE_URL=http://algo.xylolabs.com/api/v1`.
5. `judge-worker-rs/src/config.rs` rejects the non-local HTTP URL during config parsing.
6. The worker exits before registration, so the per-cycle deploy fails on algo.

Fix target: bridge step 2 to step 3 by updating the worker env from the already-computed app URL.
