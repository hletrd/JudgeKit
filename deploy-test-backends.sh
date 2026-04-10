#!/usr/bin/env bash
# =============================================================================
# JudgeKit Multi-Backend Test Deployment
#
# Deploys 3 JudgeKit instances on the test server (oj-internal.maum.ai):
#   - SQLite   → :3100 (nginx proxied at :80)
#   - PostgreSQL → :3101
#   - MySQL    → :3102
#
# Usage:
#   ./deploy-test-backends.sh                # Full deploy (build + start)
#   ./deploy-test-backends.sh --skip-build   # Reuse existing images
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Load env
if [[ -f "${SCRIPT_DIR}/.env" ]]; then
  set -a; source "${SCRIPT_DIR}/.env"; set +a
fi

REMOTE_HOST="${TEST_HOST:?TEST_HOST is required}"
REMOTE_USER="${TEST_SSH_USER:?TEST_SSH_USER is required}"
REMOTE_DIR="${TEST_REMOTE_DIR:-/home/${REMOTE_USER}/judgekit}"
DOMAIN="${TEST_DOMAIN:-oj-internal.maum.ai}"
SSH_PASSWORD="${TEST_SSH_PASSWORD:-${SSH_PASSWORD:-}}"

SKIP_BUILD=false
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=true ;;
  esac
done

info()    { echo -e "\033[0;34m[INFO]\033[0m $*"; }
success() { echo -e "\033[0;32m[OK]\033[0m $*"; }
warn()    { echo -e "\033[1;33m[WARN]\033[0m $*"; }
die()     { echo -e "\033[0;31m[ERROR]\033[0m $*" >&2; exit 1; }

SSH_OPTS="-o StrictHostKeyChecking=accept-new -o LogLevel=ERROR"

remote() {
  if [[ -n "${SSH_PASSWORD:-}" ]]; then
    sshpass -p "$SSH_PASSWORD" ssh $SSH_OPTS "${REMOTE_USER}@${REMOTE_HOST}" "$@"
  else
    ssh $SSH_OPTS "${REMOTE_USER}@${REMOTE_HOST}" "$@"
  fi
}

remote_rsync() {
  if [[ -n "${SSH_PASSWORD:-}" ]]; then
    sshpass -p "$SSH_PASSWORD" rsync -e "ssh $SSH_OPTS" "$@"
  else
    rsync -e "ssh $SSH_OPTS" "$@"
  fi
}

# ---------------------------------------------------------------------------
# Pre-flight
# ---------------------------------------------------------------------------
info "Testing SSH to ${REMOTE_HOST}..."
remote "echo ok" >/dev/null 2>&1 || die "Cannot SSH to ${REMOTE_USER}@${REMOTE_HOST}"
remote "docker info >/dev/null 2>&1" || die "Docker not available on remote"
success "SSH + Docker verified"

REMOTE_ARCH=$(remote "uname -m")
case "$REMOTE_ARCH" in
  x86_64)  PLATFORM="linux/amd64" ;;
  aarch64) PLATFORM="linux/arm64" ;;
  *)       PLATFORM="linux/amd64" ;;
esac
info "Remote arch: ${REMOTE_ARCH} → ${PLATFORM}"

# ---------------------------------------------------------------------------
# Step 1: Sync source code
# ---------------------------------------------------------------------------
info "Syncing source to ${REMOTE_HOST}:${REMOTE_DIR}..."
remote "mkdir -p ${REMOTE_DIR}"

remote_rsync -az --delete \
  --exclude='node_modules/' \
  --exclude='.next/' \
  --exclude='.git/' \
  --exclude='data/' \
  --exclude='.env' \
  --exclude='.env.production' \
  --exclude='*.db' \
  --exclude='judge-worker-rs/target/' \
  --exclude='rate-limiter-rs/target/' \
  --exclude='code-similarity-rs/target/' \
  --exclude='.omc/' \
  --exclude='.claude/' \
  --exclude='.agent/' \
  --exclude='tests/' \
  --exclude='.playwright/' \
  --exclude='backups/' \
  --exclude='._*' \
  "${SCRIPT_DIR}/" \
  "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/"
success "Source synced"

# Ensure .env.production exists on remote
if ! remote "test -f ${REMOTE_DIR}/.env.production" 2>/dev/null; then
  info "Generating .env.production on remote..."
  AUTH_SECRET=$(openssl rand -base64 32)
  JUDGE_AUTH_TOKEN=$(openssl rand -hex 32)
  remote "cat > ${REMOTE_DIR}/.env.production << 'ENVEOF'
AUTH_SECRET=${AUTH_SECRET}
AUTH_URL=https://${DOMAIN}
AUTH_TRUST_HOST=true
JUDGE_AUTH_TOKEN=${JUDGE_AUTH_TOKEN}
JUDGE_CONCURRENCY=2
POLL_INTERVAL=2000
JUDGE_DISABLE_CUSTOM_SECCOMP=0
RATE_LIMIT_MAX_ATTEMPTS=10
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_BLOCK_MS=900000
SUBMISSION_RATE_LIMIT_MAX_PER_MINUTE=10
SUBMISSION_MAX_PENDING=5
SUBMISSION_GLOBAL_QUEUE_LIMIT=200
ENVEOF"
fi

# ---------------------------------------------------------------------------
# Step 2: Build images
# ---------------------------------------------------------------------------
if [[ "$SKIP_BUILD" == false ]]; then
  info "Building app image on remote [${PLATFORM}]..."
  remote "cd ${REMOTE_DIR} && docker build --platform ${PLATFORM} -t judgekit-app:latest -f Dockerfile ."
  success "App image built"
else
  info "Skipping build (--skip-build)"
fi

# ---------------------------------------------------------------------------
# Step 2b: Pre-deploy pg_dump (test-backends uses both pg and mysql — the
# pg dump is the one that cost us data in the Apr 2026 incident)
# ---------------------------------------------------------------------------
if remote "docker inspect judgekit-db-postgres >/dev/null 2>&1 && docker inspect --format='{{.State.Running}}' judgekit-db-postgres 2>/dev/null | grep -q true"; then
  BACKUP_TS=$(date -u +%Y%m%d-%H%M%SZ)
  BACKUP_NAME="judgekit-testbackends-predeploy-${BACKUP_TS}.dump"
  info "Running pre-deploy pg_dump (test-backends postgres)..."
  if remote "mkdir -p /home/${REMOTE_USER}/backups && \
      PG_PASS=\$(grep '^POSTGRES_PASSWORD=' ${REMOTE_DIR}/.env.production | cut -d= -f2- || echo judgekit_test) && \
      docker exec -e PGPASSWORD=\"\${PG_PASS}\" judgekit-db-postgres pg_dump -U judgekit -d judgekit --format=custom --compress=9 -f /tmp/${BACKUP_NAME} && \
      docker cp judgekit-db-postgres:/tmp/${BACKUP_NAME} /home/${REMOTE_USER}/backups/${BACKUP_NAME} && \
      docker exec judgekit-db-postgres rm -f /tmp/${BACKUP_NAME}"; then
    success "Pre-deploy backup saved: ~/backups/${BACKUP_NAME}"
  else
    warn "Pre-deploy backup FAILED (test-backends pg)"
    if [[ "${SKIP_PREDEPLOY_BACKUP:-0}" != "1" ]]; then
      die "Pre-deploy backup is required. Set SKIP_PREDEPLOY_BACKUP=1 to bypass."
    fi
  fi
fi

# ---------------------------------------------------------------------------
# Step 2c: PG volume safety check (test-backends stack)
# The test-backends compose uses container name judgekit-db-postgres.
# ---------------------------------------------------------------------------
if [[ "${SKIP_PG_VOLUME_CHECK:-0}" == "1" ]]; then
  warn "SKIP_PG_VOLUME_CHECK=1 set — skipping orphan-volume safety check"
else
  SAFETY_ARGS="--container=judgekit-db-postgres"
  [[ "${AUTO_MIGRATE_ORPHANED_PGDATA:-0}" == "1" ]] && SAFETY_ARGS="${SAFETY_ARGS} --auto-migrate"
  info "Running PG volume safety check on remote (test-backends)..."
  set +e
  remote "bash ${REMOTE_DIR}/scripts/pg-volume-safety-check.sh ${SAFETY_ARGS}"
  SAFETY_RC=$?
  set -e
  case "$SAFETY_RC" in
    0) success "Safety check passed" ;;
    2) info "Safety check: no existing db container (first deploy)" ;;
    1) die "PG volume safety check FAILED — deploy aborted. Follow the recovery steps above, or re-run with AUTO_MIGRATE_ORPHANED_PGDATA=1 / SKIP_PG_VOLUME_CHECK=1." ;;
    *) die "PG volume safety check returned unexpected code ${SAFETY_RC}" ;;
  esac
fi

# ---------------------------------------------------------------------------
# Step 3: Stop old containers, start multi-backend stack
# ---------------------------------------------------------------------------
info "Stopping existing containers..."
remote "cd ${REMOTE_DIR} && cp -f .env.production .env && \
  (docker compose -f docker-compose.production.yml down --remove-orphans 2>/dev/null || true) && \
  (docker compose -f docker-compose.test-backends.yml down --remove-orphans 2>/dev/null || true)"

info "Starting multi-backend stack..."
remote "cd ${REMOTE_DIR} && docker compose -f docker-compose.test-backends.yml --env-file .env.production up -d"
success "All containers started"

# ---------------------------------------------------------------------------
# Step 4: Wait for health + seed each backend
# ---------------------------------------------------------------------------
seed_backend() {
  local container="$1"
  local dialect="$2"
  local label="$3"

  info "Waiting for ${label} to be healthy..."
  for i in $(seq 1 60); do
    status=$(remote "docker inspect --format='{{.State.Health.Status}}' ${container} 2>/dev/null" || echo "unknown")
    if echo "$status" | grep -q "healthy"; then
      break
    fi
    if [[ $i -eq 60 ]]; then
      warn "${label} not healthy after 60s, attempting seed anyway"
    fi
    sleep 2
  done

  info "Pushing schema for ${label}..."
  if [[ "$dialect" == "sqlite" ]]; then
    remote "docker exec ${container} node -e \"
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const db = new Database('/app/data/judge.db');
db.pragma('busy_timeout = 5000');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
const dir = '/app/drizzle';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
for (const file of files) {
  const sql = fs.readFileSync(path.join(dir, file), 'utf8');
  const stmts = sql.split('--> statement-breakpoint');
  for (const stmt of stmts) {
    const t = stmt.trim();
    if (t) { try { db.exec(t); } catch(e) {} }
  }
}
db.close();
console.log('SQLite migration: ' + files.length + ' files');
\""
  else
    # PG/MySQL: use drizzle-kit push via npx inside container
    remote "docker exec -e DB_DIALECT=${dialect} ${container} npx drizzle-kit push" 2>&1 || \
      warn "drizzle-kit push failed for ${label} — may need manual intervention"
  fi
  success "${label} schema ready"
}

seed_backend "judgekit-app-sqlite" "sqlite" "SQLite (:3100)"
seed_backend "judgekit-app-postgres" "postgresql" "PostgreSQL (:3101)"
seed_backend "judgekit-app-mysql" "mysql" "MySQL (:3102)"

# ---------------------------------------------------------------------------
# Step 5: Verify
# ---------------------------------------------------------------------------
info "Verifying all backends..."
for port in 3100 3101 3102; do
  if remote "wget -q --timeout=5 -O /dev/null http://127.0.0.1:${port}/login" 2>/dev/null; then
    success "  :${port} — responding"
  else
    warn "  :${port} — not responding yet (may still be starting)"
  fi
done

echo ""
success "Multi-backend test deployment complete!"
echo "  SQLite:     http://${DOMAIN} (port 80 via nginx → 3100)"
echo "  PostgreSQL: http://${DOMAIN}:3101"
echo "  MySQL:      http://${DOMAIN}:3102"
echo ""
echo "Default admin: admin / admin123 (or check .env.production)"
