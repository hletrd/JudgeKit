# Deployment Guide

## Host Prerequisites

- Linux host (amd64 or arm64) with Docker Engine and nginx
- SSH access from the deploying machine (password or key-based)
- Ports `80`/`443` terminated by nginx; app container listens on port `3100` internally
- `/judge-workspaces` directory on the host — mounted into the worker container for workspace sharing

## Environment Configuration

Start from `.env.example` and set at least:

```bash
# App server
AUTH_SECRET=<openssl rand -base64 32>
AUTH_URL=https://your-domain.example
AUTH_TRUST_HOST=true
PLUGIN_CONFIG_ENCRYPTION_KEY=<openssl rand -hex 32>

# Judge worker (shared secret between app and worker)
JUDGE_AUTH_TOKEN=<openssl rand -hex 32>
JUDGE_BASE_URL=http://localhost:3000/api/v1
POLL_INTERVAL=2000
JUDGE_CONCURRENCY=2
JUDGE_DISABLE_CUSTOM_SECCOMP=0
# JUDGE_WORKER_HOSTNAME=worker-1   # Reported during registration (default: system hostname)
```

### Environment Variable Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AUTH_SECRET` | Yes | — | Session encryption key (`openssl rand -base64 32`) |
| `AUTH_URL` | Yes | — | App public URL |
| `AUTH_TRUST_HOST` | No | `false` | Set `true` behind a reverse proxy |
| `PLUGIN_CONFIG_ENCRYPTION_KEY` | Yes | — | Dedicated AES-GCM key for plugin secrets and API key encryption (`openssl rand -hex 32`) |
| `DATABASE_URL` | Yes | — | PostgreSQL connection string (e.g. `postgres://user:pass@host:5432/judgekit`) |
| `JUDGE_AUTH_TOKEN` | Yes | — | Shared secret for worker auth (`openssl rand -hex 32`) |
| `JUDGE_BASE_URL` | No | `http://localhost:3000/api/v1` | App API URL for workers |
| `JUDGE_CONCURRENCY` | No | `1` | Max parallel submissions per worker (1-16) |
| `JUDGE_WORKER_HOSTNAME` | No | System hostname | Worker name shown in admin dashboard |
| `POLL_INTERVAL` | No | `2000` | Worker poll interval in ms |
| `JUDGE_DISABLE_CUSTOM_SECCOMP` | No | `0` | Set `1` on Docker 28+/modern kernels |
| `JUDGE_ALLOW_DEFAULT_COMPILE_SECCOMP` | No | `0` | Set `1` only when a compile toolchain is incompatible with the repository seccomp profile |
| `TRUSTED_DOCKER_REGISTRIES` | No | — | Comma-separated allowlist for fully qualified external judge image registries |
| `PG_SHARED_BUFFERS` | No | `512MB` | Postgres `shared_buffers`. Set lower on small instances (e.g. `128MB` for 4GB RAM) |
| `PG_EFFECTIVE_CACHE_SIZE` | No | `2GB` | Postgres `effective_cache_size`. Match to available RAM minus other services |
| `PG_WORK_MEM` | No | `8MB` | Postgres `work_mem` per-operation sort/hash budget |
| `PG_MAINTENANCE_WORK_MEM` | No | `128MB` | Postgres `maintenance_work_mem`. Lower on constrained hosts (e.g. `64MB`) |

- Set `JUDGE_DISABLE_CUSTOM_SECCOMP=1` on hosts where Docker 28+/modern kernels reject the repository seccomp profile
- Set `JUDGE_ALLOW_DEFAULT_COMPILE_SECCOMP=1` only as an explicit compatibility escape hatch when a compile toolchain cannot run under the repository seccomp profile

## Initial Provisioning

```bash
# Interactive setup (recommended)
bash scripts/setup.sh

# Or manual setup:
npm install
npm run db:push
ADMIN_USERNAME=admin ADMIN_PASSWORD=admin123 npm run seed
npm run languages:sync

# Build judge language Docker images (pick a preset)
# Presets: core (~0.8 GB), popular (~2.5 GB), extended (~8 GB), all (~14 GB)
for img in cpp python jvm; do
  docker build -t "judge-${img}" -f "docker/Dockerfile.judge-${img}" .
done

npm run build
```

## Systemd Services

```bash
sudo ./scripts/install-online-judge-service.sh
sudo ./scripts/install-online-judge-worker-rs-service.sh
```

Both expect the repo at `/home/ubuntu/judgekit` with `.env` in the same directory.

### Building the Rust Judge Worker

```bash
cd judge-worker-rs
cargo build --release
```

## nginx and TLS

```bash
sudo install -m 0644 scripts/online-judge.nginx-http.conf /etc/nginx/sites-available/online-judge
sudo ln -sfn /etc/nginx/sites-available/online-judge /etc/nginx/sites-enabled/online-judge
sudo nginx -t && sudo systemctl reload nginx
sudo certbot certonly --nginx -d your-domain.example --non-interactive
sudo install -m 0644 scripts/online-judge.nginx.conf /etc/nginx/sites-available/online-judge
sudo nginx -t && sudo systemctl reload nginx
```

## Deploy Updates

```bash
git pull --rebase origin main
npm install
npm run db:push
npm run languages:sync
npm run build
sudo systemctl restart online-judge.service
sudo systemctl restart online-judge-worker-rs.service
```

### Using `deploy-docker.sh` (Recommended)

Rsyncs source to the remote server and builds Docker images there (never locally), auto-detecting architecture. Supports password (`SSH_PASSWORD`) and key (`SSH_KEY`) SSH auth.

For the default Docker deployment, the Next.js app does **not** talk to Docker directly. The local judge worker is the only container with Docker daemon access (via `docker-proxy`), and the app reaches the worker’s authenticated internal runner/admin endpoints instead.

```bash
# Password auth
SSH_PASSWORD='...' REMOTE_HOST=... REMOTE_USER=... ./deploy-docker.sh

# Key auth
SSH_KEY=key.pem REMOTE_HOST=... REMOTE_USER=... DOMAIN=... ./deploy-docker.sh

# Flags: --skip-build, --skip-languages, --languages=core, --languages=cpp,python
```

## Dedicated Judge Workers

Add judging capacity by deploying workers on separate machines. Each worker connects to the app server via HTTP(S), registers on startup, and sends periodic heartbeats.

### Deploy a remote worker

```bash
./scripts/deploy-worker.sh \
  --host=192.168.1.10 \
  --app-url=https://oj.example.com/api/v1 \
  --concurrency=4 \
  --sync-images
```

### Or use docker-compose.worker.yml directly on the worker machine

```bash
JUDGE_BASE_URL=https://oj.example.com/api/v1 \
JUDGE_AUTH_TOKEN=<same-token-as-app> \
JUDGE_CONCURRENCY=4 \
JUDGE_WORKER_HOSTNAME=worker-2 \
docker compose -f docker-compose.worker.yml up -d
```

The worker compose file also publishes the internal runner on host loopback:

```text
127.0.0.1:${RUNNER_PORT:-3001}:3001
```

This is what the algo app host's SSH tunnel / host bridge targets for remote
interactive compiler execution.

### Monitor workers

- Admin dashboard: `/dashboard/admin/workers`
- Set friendly aliases via the edit icon in the Alias column
- Force-remove stale workers to reclaim their in-flight submissions

> **Important app-scaling limitation:** remote/dedicated judge workers are safe
> to scale horizontally. For the **web app**, the realtime-sensitive routes now
> support two modes:
> - **process-local mode** — declare `APP_INSTANCE_COUNT=1` (or
>   `REALTIME_SINGLE_INSTANCE_ACK=1`) and keep the web tier single-instance
> - **shared PostgreSQL mode** — set `REALTIME_COORDINATION_BACKEND=postgresql`
>   so `/api/v1/submissions/[id]/events` and
>   `/api/v1/contests/[assignmentId]/anti-cheat` use the database for SSE
>   connection-cap coordination and heartbeat deduplication
>
> `redis` remains unsupported. Before adding multiple app replicas for
> higher-stakes use, validate sticky-session / load-balancer behavior and the
> PostgreSQL coordination path under realistic load.

See [Judge Workers](judge-workers.md) for full architecture and API reference.

## Post-deploy Verification

```bash
systemctl is-active online-judge.service
systemctl is-active online-judge-worker-rs.service
curl -I http://127.0.0.1:3000/login
curl http://127.0.0.1:3000/api/health
```

- Confirm submissions progress out of `pending`
- Confirm `/api/health` returns `{"status":"ok"...}` with `checks.database` set to `ok`
- If `401 Unauthorized` in worker logs, verify `JUDGE_AUTH_TOKEN`
- If container-init error (`fsmount:fscontext:proc`), set `JUDGE_DISABLE_CUSTOM_SECCOMP=1`

## Database Durability (READ BEFORE TOUCHING COMPOSE OR DEPLOY SCRIPTS)

The PostgreSQL data lives in the `judgekit-pgdata` named volume, mounted at
`/var/lib/postgresql/data` inside the container. The compose file explicitly
sets `PGDATA=/var/lib/postgresql/data` — **do not remove or change it** without
reading this section. The `postgres:18-alpine` image defaults to
`/var/lib/postgresql/18/docker` which silently relocates the cluster directory
outside the named volume on a recreate and has caused a full data wipe in the
past (see commit history for the Apr 2026 incident).

### Safe operations

- `docker compose -f docker-compose.production.yml restart` — safe
- `docker compose -f docker-compose.production.yml up -d` — safe (no volume changes)
- `docker compose -f docker-compose.production.yml down` — safe (keeps volumes)
- `docker image prune -f` — safe (only removes dangling `<none>` images)

### Dangerous operations — never run on production

- `docker compose down -v` — **deletes `judgekit-pgdata`**. Use `down` without `-v`.
- `docker volume rm judgekit_judgekit-pgdata` — destroys the cluster
- `docker volume prune -af` — indiscriminate, can delete mounted volumes on stopped containers
- `docker system prune -a --volumes` — same, destructive across the board
- Changing the `postgres` image tag without an explicit `pg_upgrade` plan
- Upgrading the `postgres` major version inside the same named volume without
  following the [postgres upgrade guide](https://www.postgresql.org/docs/current/pgupgrade.html)

### Backups

- **Pre-deploy**: `deploy-docker.sh` automatically takes a custom-format
  `pg_dump` to `~/backups/judgekit-predeploy-<timestamp>.dump` on the remote
  before every deploy. Retention: `BACKUP_RETAIN_DAYS` (default 30). Set
  `SKIP_PREDEPLOY_BACKUP=1` to bypass (not recommended).
- **Scheduled**: `scripts/backup-db.sh` supports a container-exec mode for
  systems without host-level `pg_dump`. Example daily cron:
  ```cron
  17 4 * * *  CONTAINER_NAME=judgekit-db \
                ENV_FILE=/home/ubuntu/judgekit/.env.production \
                DB_DIALECT=postgresql \
                BACKUP_PATH=/home/ubuntu/backups/judgekit-$(/bin/date +\%Y\%m\%d-\%H\%M\%S).sql.gz \
                /home/ubuntu/judgekit/scripts/backup-db.sh >> /home/ubuntu/backups/backup.log 2>&1
  ```
- **Restore**: custom-format dumps restore with `pg_restore -U judgekit -d judgekit -c <file>`;
  gzipped SQL dumps restore with `gunzip -c <file> | psql -U judgekit -d judgekit`.

### PG volume orphan-scenario detection

Every `deploy-docker.sh` / `deploy.sh` / `deploy-test-backends.sh` run invokes
`scripts/pg-volume-safety-check.sh` on the remote host **before stopping the
database container**. The safety check inspects the running `judgekit-db`
container's mount table, the PGDATA environment, and the contents of the
named volume. It refuses the deploy if it detects the "anonymous volume
orphan" pattern (real cluster in an anonymous mount at
`/var/lib/postgresql/...`, named volume at `/var/lib/postgresql/data` empty).

The check runs automatically. Override flags:

- `SKIP_PG_VOLUME_CHECK=1` — skip entirely (for emergency recovery only)
- `AUTO_MIGRATE_ORPHANED_PGDATA=1` — snapshot the anonymous volume, take a
  container-side `pg_dump`, and copy the cluster into the named volume
  automatically. Both backups land in `~/backups/` on the remote.

Run the check manually from the remote at any time:

```bash
ssh ... "bash ~/judgekit/scripts/pg-volume-safety-check.sh"
```

### Anonymous volume recovery runbook (Apr 2026 incident replay)

When the safety check reports that the real cluster lives in an anonymous
volume and the named volume is empty, do **not** proceed with any deploy
until the data has been migrated. The recovery path that worked during the
Apr 2026 incident is:

```bash
# 1. Two independent backups — never migrate without them
PG_PASS=$(grep '^POSTGRES_PASSWORD=' ~/judgekit/.env.production | cut -d= -f2-)
docker exec -e PGPASSWORD="$PG_PASS" judgekit-db \
  pg_dump -U judgekit -d judgekit --format=custom --compress=9 \
  -f /tmp/pre-migration.dump
docker cp judgekit-db:/tmp/pre-migration.dump ~/backups/pre-migration-$(date +%s).dump

# 2. Snapshot the anonymous volume at the filesystem level
ANON_SRC=$(docker inspect judgekit-db --format \
  '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql"}}{{.Source}}{{end}}{{end}}')
sudo tar -czf /tmp/pgdata-anon-$(date +%s).tar.gz -C "$ANON_SRC" _data || true
sudo tar -czf /tmp/pgdata-anon-$(date +%s).tar.gz -C "$ANON_SRC" .

# 3. Stop the old container so the cluster is not mid-write
cd ~/judgekit
docker compose -f docker-compose.production.yml stop db

# 4. Locate the real cluster inside the anonymous volume
#    (postgres:18-alpine puts it at `18/docker/` under the mount)
CLUSTER_SRC="${ANON_SRC}/18/docker"
sudo cat "${CLUSTER_SRC}/PG_VERSION"   # sanity check

# 5. Clear the empty named volume and copy the cluster in
NAMED_SRC=$(docker volume inspect judgekit_judgekit-pgdata --format '{{.Mountpoint}}')
sudo bash -c "shopt -s dotglob; rm -rf ${NAMED_SRC}/*"
sudo cp -a "${CLUSTER_SRC}/." "${NAMED_SRC}/"

# 6. Restart postgres — it finds the pinned PGDATA path already populated
docker compose -f docker-compose.production.yml --env-file .env.production up -d db

# 7. Verify data is back
docker exec judgekit-db psql -U judgekit -d judgekit -c \
  "SELECT (SELECT count(*) FROM users) u, (SELECT count(*) FROM problems) p, (SELECT count(*) FROM submissions) s;"
```

The automated path (`AUTO_MIGRATE_ORPHANED_PGDATA=1 ./deploy-docker.sh`)
performs steps 1–5 with identical commands and aborts cleanly if any step
cannot complete. Read the script output carefully — on success it prints
the exact paths of the `pg_dump` and tar snapshots so you can roll back.

The legacy anonymous volume is **not** deleted by the migration. It stays
on the host until `docker volume prune` or a manual `docker volume rm`
removes it — treat it as a second safety net for at least 7 days before
pruning.

## CI and Backup

- GitHub Actions CI: `.github/workflows/ci.yml` — lint, build, backup/restore, Playwright
- Database backup: `scripts/backup-db.sh`, `scripts/verify-db-backup.sh` (current runtime uses PostgreSQL)
- Systemd backup timer: `scripts/online-judge-backup.service`, `scripts/online-judge-backup.timer`

## Database Reset

**PostgreSQL runtime:**
```bash
# Stop app first, then:
DATABASE_URL=postgres://... npx drizzle-kit push
npm run seed
```

Historical SQLite/MySQL files may still exist in the repository for migration/test context, but the active runtime documented here is PostgreSQL-only.

Default admin: `admin` / `admin123` (forced password change on first login).
