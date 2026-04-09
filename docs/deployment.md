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

- Set `JUDGE_DISABLE_CUSTOM_SECCOMP=1` on hosts where Docker 28+/modern kernels reject the repository seccomp profile

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

Both expect the repo at `/home/ubuntu/online-judge` with `.env` in the same directory.

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

### Monitor workers

- Admin dashboard: `/dashboard/admin/workers`
- Set friendly aliases via the edit icon in the Alias column
- Force-remove stale workers to reclaim their in-flight submissions

> **Important app-scaling limitation:** remote/dedicated judge workers are safe
> to scale horizontally, but the **web app is currently expected to run as a
> single instance** for `/api/v1/submissions/[id]/events` SSE connection caps
> and `/api/v1/contests/[assignmentId]/anti-cheat` heartbeat deduplication.
> Before adding multiple app replicas, introduce shared-state coordination
> (Redis/PostgreSQL/etc.) or document and validate an equivalent sticky-session
> strategy for those routes.

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
