# Judge worker incident runbook

_Last updated: 2026-06-11_

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

### `[judge] staleness sweep reaped unresponsive worker(s) to offline` (alert on this line)

This is the primary automated dead-worker signal. The background staleness
sweep (60 s interval, DB-clock based) flips a worker `online → stale` after
90 s of heartbeat silence and reaps `stale → offline` after 300 s. The reap
emits exactly one `warn`-level log line per transition (not per sweep):

```
[judge] staleness sweep reaped unresponsive worker(s) to offline
```

with structured fields `reaped` (count) and `workerIds`. **Wire log-based
alerting (Loki/grep) to this exact string** — it fires the moment a worker is
reaped, independent of and faster than the next Prometheus scrape of
`judgekit_judge_workers{status="offline"}`. The companion `info` line
`[judge] staleness sweep marked silent worker(s) stale` is the early-warning
precursor and usually not worth paging on (a healthy-but-slow worker heals
itself on its next heartbeat).

When the alert fires mid-assessment: stale claims are reclaimed automatically
by the remaining workers (including the dead worker's `active_tasks` slots),
so judging continues at reduced capacity; restore or replace the worker per
the recovery sections below.

### `failed to write stdin: Broken pipe (os error 32)` surfaced to the user

Pre-2026-05-17 the worker treated every error from the docker stdin write as a fatal environment error: it killed the container and propagated the `io::Error`, which the API surfaced as `failed to write stdin: ...` and masked the submission's actual exit code or runtime error.

Submissions that terminate before reading all of stdin (early-exit on a sufficient answer, immediate crash, deliberate partial-read) make that write return `EPIPE` — a normal user-program outcome, not an infrastructure failure. Starting with the May 2026 worker binary, `EPIPE` on stdin is treated as a normal close: stdin is dropped, the container keeps running, and the user sees the real exit status / stdout / stderr. All other I/O errors still kill the container and propagate as `StdinFailed`.

If reports of `failed to write stdin` reach an operator from a current worker, the worker binary is stale — rebuild it on the worker host (`docker build -f Dockerfile.judge-worker -t judgekit-judge-worker:latest .`) and recreate the container. Look for the debug line `child closed stdin before all input was written; continuing to wait for exit` to confirm the new handling is in effect.

### Worker stays unhealthy with `Docker capability probe failed: hello-world: not found locally`

The worker runs a one-shot `hello-world` container at startup to confirm
its Docker access works. If `hello-world:latest` is missing locally,
the worker tries to `docker pull`, the `docker-socket-proxy` denies
the pull with `403 Forbidden` (pulls are not in the proxy's allowed
operation list), and the worker's healthcheck stays red.

The recovery script in the next section already includes a
`docker pull hello-world:latest` step. Run it, or do it manually:

```bash
ssh <worker-host> 'docker pull hello-world:latest && \
    cd ~/judgekit && \
    docker compose -f docker-compose.worker.yml restart judge-worker'
```

The worker should report `Docker capability probe passed at startup`
within ~10 s after restart.

### Every submission fails with `pull access denied for judge-<lang>` or `no such image`

The worker spawns a fresh container from a tagged language image
(`judge-cpp:latest`, `judge-python:latest`, ...) per submission. If
those images are missing from the worker host's local Docker, every
submission in any of the affected languages will fail at the spawn
step. Common causes:

- An over-aggressive `docker image prune -af` on the worker host
  (the May 2026 deploy-script regression — the prune treated every
  language image as "unused" because none of them is attached to a
  long-running container).
- A fresh worker host that has never received the language build pass.
- Disk pressure that triggered the kernel to evict images? — not really
  possible, Docker won't auto-evict; ignore this branch.

Verify the missing set:

```bash
ssh <worker-host> 'docker images --format "{{.Repository}}" | grep "^judge-" | sort -u | wc -l'
```

If the count is far below the expected ~80, rebuild:

```bash
# From the local workstation, against a remote worker host:
LANGUAGE_FILTER=all  ./scripts/rebuild-worker-language-images.sh \
    worker.example.com ~/.ssh/worker-key.pem linux/amd64

# Or, running directly on the worker host:
LANGUAGE_FILTER=all  ./scripts/rebuild-worker-language-images.sh local linux/arm64
```

The script iterates through every `docker/Dockerfile.judge-*` defined
in the `ALL_LANGS` preset, builds each, and prints a final OK/FAIL
summary. Per-image logs land in `/tmp/build-judge-<lang>.log` on the
target host. The script also runs the safe dangling-only prune at the
end (`docker image prune -f`, NOT `-af`) so it doesn't undo its own
work.

### Worker crash-loops with `RUNNER_AUTH_TOKEN must not be empty`

The worker validates `RUNNER_AUTH_TOKEN` strictly: unset → falls back to `JUDGE_AUTH_TOKEN`, but a present-and-empty value is rejected at startup. The dedicated worker compose file always renders `RUNNER_AUTH_TOKEN=${RUNNER_AUTH_TOKEN:-}`, so if the host env or `.env` file does not define the variable the container receives `""` and exits in a loop.

Fix by writing a real token (≥32 chars, e.g. `openssl rand -hex 32`) into the worker host's `.env` for the same value the app server has in its `.env.production`, then `docker compose -f docker-compose.worker.yml up -d --force-recreate judge-worker`.
