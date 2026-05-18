# Judge worker incident runbook

_Last updated: 2026-05-18_

The judge worker is a privileged trust boundary because it launches sibling judge containers through the Docker proxy path.

## When to use this runbook
- worker starts failing container launches unexpectedly
- worker begins returning malformed or inconsistent execution results
- suspicious Docker activity or image changes are observed
- worker heartbeat/status looks abnormal during an assessment window

## Immediate containment
1. Stop routing new judging load to the affected worker.
2. Preserve logs and current worker/admin audit evidence.
3. If compromise is suspected, rotate judge credentials and inspect recent image changes.
4. Prefer replacing the worker instance over trying to patch a suspect live host in place.

## Investigation checklist
- review worker logs and recent admin Docker activity
- inspect recent language/image configuration changes
- inspect Docker daemon / proxy access path
- verify whether affected submissions were already partially judged and need requeue/review

## Recovery goals
- restore a known-good worker instance
- revalidate judging consistency on a small smoke set before resuming full load
- document any affected assessment windows and operator actions taken

## Known signals

### `failed to write stdin: Broken pipe (os error 32)` surfaced to the user

Pre-2026-05-17 the worker treated every error from the docker stdin write as a fatal environment error: it killed the container and propagated the `io::Error`, which the API surfaced as `failed to write stdin: ...` and masked the submission's actual exit code or runtime error.

Submissions that terminate before reading all of stdin (early-exit on a sufficient answer, immediate crash, deliberate partial-read) make that write return `EPIPE` — a normal user-program outcome, not an infrastructure failure. Starting with the May 2026 worker binary, `EPIPE` on stdin is treated as a normal close: stdin is dropped, the container keeps running, and the user sees the real exit status / stdout / stderr. All other I/O errors still kill the container and propagate as `StdinFailed`.

If reports of `failed to write stdin` reach an operator from a current worker, the worker binary is stale — rebuild it on the worker host (`docker build -f Dockerfile.judge-worker -t judgekit-judge-worker:latest .`) and recreate the container. Look for the debug line `child closed stdin before all input was written; continuing to wait for exit` to confirm the new handling is in effect.

### Worker crash-loops with `RUNNER_AUTH_TOKEN must not be empty`

The worker validates `RUNNER_AUTH_TOKEN` strictly: unset → falls back to `JUDGE_AUTH_TOKEN`, but a present-and-empty value is rejected at startup. The dedicated worker compose file always renders `RUNNER_AUTH_TOKEN=${RUNNER_AUTH_TOKEN:-}`, so if the host env or `.env` file does not define the variable the container receives `""` and exits in a loop.

Fix by writing a real token (≥32 chars, e.g. `openssl rand -hex 32`) into the worker host's `.env` for the same value the app server has in its `.env.production`, then `docker compose -f docker-compose.worker.yml up -d --force-recreate judge-worker`.
