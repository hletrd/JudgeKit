# Judge Workers

JudgeKit supports N concurrent judge workers connecting to a single app server. Workers can run on the same machine or be distributed across dedicated hosts.

## Architecture

Workers access the app via HTTP(S) only. The PostgreSQL runtime handles concurrent access. The atomic `UPDATE...RETURNING` claim SQL prevents race conditions — only one worker can claim a given submission.

<p align="center">
  <img src="./judge-workers-architecture.svg" alt="Judge Workers Architecture" width="720" />
</p>

## Worker Lifecycle

### Registration

On startup, the worker POSTs to `/api/v1/judge/register` with its hostname and concurrency. The server returns a `workerId` and heartbeat interval.

If registration fails (e.g., older server without worker support), the worker continues without registration — backward compatible.

### Heartbeat

A background task POSTs to `/api/v1/judge/heartbeat` every 30 seconds with:
- `workerId` — identifies the worker
- `activeTasks` — current in-flight submission count
- `availableSlots` — remaining concurrency capacity
- `uptimeSeconds` — worker uptime

The heartbeat endpoint piggybacks a staleness sweep: workers whose last heartbeat exceeds `3 * heartbeatInterval` are marked `stale`.

### Claiming

Workers poll `/api/v1/judge/claim` to claim submissions. The claim request includes the optional `workerId`, which is recorded on the submission for tracking and audit.

### Graceful Shutdown (SIGTERM)

1. Stops claiming new submissions
2. Awaits all in-flight tasks to complete
3. Cancels the heartbeat task
4. POSTs to `/api/v1/judge/deregister`
5. Exits

### Fault Tolerance

| Scenario | Mitigation |
|----------|-----------|
| Two workers claim same submission | Atomic `UPDATE...RETURNING` — only one gets the row |
| Worker crashes mid-judging | Stale claim timeout (configurable, default 5 min) — reclaimed by next worker |
| Worker reports result after reclaim | Claim token mismatch — 403 rejected |
| Heartbeat failure | After 3 consecutive failures, logs warning; worker keeps running |

## Configuration

### Worker Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `JUDGE_BASE_URL` | `http://localhost:3000/api/v1` | App server API URL |
| `JUDGE_AUTH_TOKEN` | (required) | Bearer token for judge API auth |
| `JUDGE_CONCURRENCY` | `1` | Max concurrent submissions (1-16) |
| `JUDGE_WORKER_HOSTNAME` | System hostname | Hostname reported to app server |
| `POLL_INTERVAL` | `2000` | Polling interval in ms |
| `DEAD_LETTER_DIR` | `./dead-letter` | Directory for failed result payloads |

## Deployment

### Single-machine (co-located)

Include the local judge worker profile when using `docker-compose.production.yml`:

```bash
docker compose -f docker-compose.production.yml --profile worker --env-file .env.production up -d
```

### Dedicated workers

Use `docker-compose.worker.yml` on separate machines:

```bash
JUDGE_BASE_URL=https://oj.example.com/api/v1 \
JUDGE_AUTH_TOKEN=your-token \
JUDGE_CONCURRENCY=4 \
docker compose -f docker-compose.worker.yml up -d
```

The dedicated worker compose file includes a local `docker-proxy` sidecar. The judge worker reaches Docker through `DOCKER_HOST=tcp://docker-proxy:2375` instead of mounting `/var/run/docker.sock` directly, which narrows direct daemon exposure.

> **Important:** this horizontal scaling guidance applies to **judge workers**.
> The main Next.js app currently keeps SSE connection tracking and anti-cheat
> heartbeat deduplication in process-local memory, so app-server replication
> requires additional shared-state work (or a carefully validated sticky-session
> design) before it is safe to run multiple app instances.

### Deploy script

Automates image transfer and setup for remote machines:

```bash
./scripts/deploy-worker.sh \
  --host=192.168.1.10 \
  --app-url=https://oj.example.com/api/v1 \
  --concurrency=4 \
  --sync-images
```

Options:
- `--host=<ip>` — Target machine (required)
- `--app-url=<url>` — App server API URL (required)
- `--token=<token>` — Judge auth token (reads from `.env.production` if omitted)
- `--concurrency=<n>` — Max concurrent submissions (default: 4)
- `--sync-images` — Also transfer judge language Docker images
- `--ssh-user=<user>` — SSH user (default: root)

### Docker Image Distribution

For 2-3 workers, `deploy-worker.sh --sync-images` transfers images via `docker save | ssh | docker load`.

For larger fleets, consider a private Docker registry and set `JUDGE_DOCKER_REGISTRY` so workers pull images on startup.

## Admin Dashboard

The workers admin page at `/dashboard/admin/workers` (requires `system.settings` capability) shows:

- **Stats cards** — Workers online, queue depth, active judging, total concurrency
- **Workers table** — Alias, hostname, IP address, status, concurrency, active tasks, version, last heartbeat
- **Alias editing** — Click the pencil icon to set a friendly name for each worker
- **Force-remove** — Remove a worker and reclaim its in-flight submissions

Data auto-refreshes every 10 seconds.

## API Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/v1/judge/register` | POST | Bearer | Worker registration |
| `/api/v1/judge/heartbeat` | POST | Bearer | Periodic health ping |
| `/api/v1/judge/deregister` | POST | Bearer | Graceful shutdown |
| `/api/v1/judge/claim` | POST | Bearer | Claim a submission (accepts optional `workerId`) |
| `/api/v1/judge/poll` | POST | Bearer | Report status/result |
| `/api/v1/admin/workers` | GET | Session | List all workers |
| `/api/v1/admin/workers/stats` | GET | Session | Aggregate stats |
| `/api/v1/admin/workers/:id` | DELETE | Session | Force-remove worker |
