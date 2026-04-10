#!/usr/bin/env bash
# =============================================================================
# JudgeKit Docker Deployment Script
#
# Syncs source code to the target VM and builds Docker images on the server,
# then starts the production stack with nginx reverse proxy.
#
# Usage:
#   ./deploy-docker.sh                    # Full deployment
#   ./deploy-docker.sh --skip-build       # Skip image build (reuse existing)
#   ./deploy-docker.sh --skip-languages   # Skip building judge language images
#   ./deploy-docker.sh --languages=core   # Build only core language images
#   ./deploy-docker.sh --languages=cpp,python,jvm  # Build specific languages
#
# Environment:
#   SSH_PASSWORD    — SSH password for the remote host (password auth)
#   SSH_KEY         — Path to SSH private key (key auth, e.g. key.pem)
#   REMOTE_HOST     — Target host IP or hostname (required, see .env)
#   REMOTE_USER     — Target SSH user (required, see .env)
#   DOMAIN          — Target domain name (required, see .env)
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Save caller-provided overrides before sourcing defaults
_CALLER_REMOTE_HOST="${REMOTE_HOST:-}"
_CALLER_REMOTE_USER="${REMOTE_USER:-}"
_CALLER_DOMAIN="${DOMAIN:-}"
_CALLER_SSH_PASSWORD="${SSH_PASSWORD:-}"
_CALLER_SSH_KEY="${SSH_KEY:-}"
_CALLER_AUTH_URL_OVERRIDE="${AUTH_URL_OVERRIDE:-}"

# Source deployment env vars from .env.deploy (defaults)
if [[ -f "${SCRIPT_DIR}/.env.deploy" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "${SCRIPT_DIR}/.env.deploy"
    set +a
fi

# Restore caller overrides (explicit env vars take precedence)
[[ -n "$_CALLER_REMOTE_HOST" ]] && REMOTE_HOST="$_CALLER_REMOTE_HOST"
[[ -n "$_CALLER_REMOTE_USER" ]] && REMOTE_USER="$_CALLER_REMOTE_USER"
[[ -n "$_CALLER_DOMAIN" ]] && DOMAIN="$_CALLER_DOMAIN"
[[ -n "$_CALLER_SSH_PASSWORD" ]] && SSH_PASSWORD="$_CALLER_SSH_PASSWORD"
[[ -n "$_CALLER_SSH_KEY" ]] && SSH_KEY="$_CALLER_SSH_KEY"
[[ -n "$_CALLER_AUTH_URL_OVERRIDE" ]] && AUTH_URL_OVERRIDE="$_CALLER_AUTH_URL_OVERRIDE"

REMOTE_HOST="${REMOTE_HOST:?REMOTE_HOST is required (see .env)}"
REMOTE_USER="${REMOTE_USER:?REMOTE_USER is required (see .env)}"
REMOTE_DIR="/home/${REMOTE_USER}/judgekit"
DOMAIN="${DOMAIN:?DOMAIN is required (see .env)}"
APP_PORT=3100

# Language presets
CORE_LANGS="cpp python jvm"
POPULAR_LANGS="$CORE_LANGS node rust go"
EXTENDED_LANGS="$POPULAR_LANGS ruby lua bash csharp php perl swift r haskell dart zig"
ALL_LANGS="cpp clang python node jvm rust go swift csharp r perl php ruby lua haskell dart zig nim ocaml elixir julia d racket v fortran pascal cobol brainfuck scala erlang commonlisp bash esoteric ada clojure prolog tcl awk scheme groovy octave crystal powershell postscript fsharp apl freebasic smalltalk b nasm bqn lolcode forth algol68 umjunsik haxe raku shakespeare snobol4 icon uiua odin objective-c deno bun gleam sml micropython squirrel rexx hy arturo janet c3 vala nelua hare koka lean picat mercury wat purescript modula2 factor minizinc curry clean roc carp grain pony chapel elm flix idris2 moonbit rescript"

resolve_languages() {
  local spec="$1"
  case "$spec" in
    core)     echo "$CORE_LANGS" ;;
    popular)  echo "$POPULAR_LANGS" ;;
    extended) echo "$EXTENDED_LANGS" ;;
    all)      echo "$ALL_LANGS" ;;
    none)     echo "" ;;
    *)        echo "$spec" | tr ',' ' ' ;;
  esac
}

# Parse arguments
SKIP_BUILD=false
SKIP_LANGUAGES=false
LANGUAGE_FILTER=""
INCLUDE_WORKER="${INCLUDE_WORKER:-true}"
BUILD_WORKER_IMAGE="${BUILD_WORKER_IMAGE:-auto}"
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=true ;;
    --skip-languages) SKIP_LANGUAGES=true ;;
    --languages=*) LANGUAGE_FILTER="${arg#--languages=}" ;;
    --no-worker) INCLUDE_WORKER=false ;;
    --with-worker) INCLUDE_WORKER=true ;;
    --skip-worker-build) BUILD_WORKER_IMAGE=false ;;
    --build-worker) BUILD_WORKER_IMAGE=true ;;
    --help|-h)
      echo "Usage: $0 [--skip-build] [--skip-languages] [--languages=<preset|lang,lang,...>] [--no-worker|--with-worker] [--skip-worker-build|--build-worker]"
      echo ""
      echo "Options:"
      echo "  --no-worker    — Do not start a local judge worker (use when workers run on separate machines)"
      echo "  --with-worker  — Force starting a local judge worker"
      echo "  --skip-worker-build — Skip building the judge-worker image"
      echo "  --build-worker      — Force building the judge-worker image"
      echo ""
      echo "Environment:"
      echo "  INCLUDE_WORKER=false  — Persistently disable the local worker for this target"
      echo "  BUILD_WORKER_IMAGE=false — Persistently skip the judge-worker image build"
      echo ""
      echo "Language presets: core, popular, extended, all, none"
      echo "  core     — C/C++, Python, Java/Kotlin (~1.2 GB)"
      echo "  popular  — Core + Node.js, Rust, Go (~4 GB)"
      echo "  extended — Popular + Ruby, Lua, Bash, C#, PHP, Perl, Swift, R, Haskell, Dart, Zig (~12 GB)"
      echo "  all      — All supported language images (~30 GB)"
      echo "  none     — Skip language image builds"
      exit 0
      ;;
  esac
done

if [[ "${BUILD_WORKER_IMAGE}" == "auto" ]]; then
  BUILD_WORKER_IMAGE="${INCLUDE_WORKER}"
fi

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
die()     { error "$*"; exit 1; }

SSH_OPTS="-o StrictHostKeyChecking=accept-new -o LogLevel=ERROR"
if [[ -n "${SSH_KEY:-}" ]]; then
    SSH_OPTS="$SSH_OPTS -i ${SSH_KEY}"
fi

remote() {
    if [[ -n "${SSH_PASSWORD:-}" ]]; then
        sshpass -p "$SSH_PASSWORD" ssh $SSH_OPTS "${REMOTE_USER}@${REMOTE_HOST}" "$@"
    else
        ssh $SSH_OPTS "${REMOTE_USER}@${REMOTE_HOST}" "$@"
    fi
}

remote_copy() {
    if [[ -n "${SSH_PASSWORD:-}" ]]; then
        sshpass -p "$SSH_PASSWORD" scp $SSH_OPTS "$@"
    else
        scp $SSH_OPTS "$@"
    fi
}

remote_rsync() {
    if [[ -n "${SSH_PASSWORD:-}" ]]; then
        SSHPASS="$SSH_PASSWORD" rsync -e "sshpass -e ssh $SSH_OPTS" "$@"
    else
        rsync -e "ssh $SSH_OPTS" "$@"
    fi
}

remote_sudo() {
    local cmd="$1"
    local quoted_cmd
    printf -v quoted_cmd '%q' "$cmd"

    if [[ -n "${SSH_PASSWORD:-}" ]]; then
        printf '%s\n' "$SSH_PASSWORD" | sshpass -p "$SSH_PASSWORD" ssh $SSH_OPTS "${REMOTE_USER}@${REMOTE_HOST}" "sudo -S -p '' bash -lc ${quoted_cmd}"
    else
        ssh $SSH_OPTS "${REMOTE_USER}@${REMOTE_HOST}" "sudo bash -lc ${quoted_cmd}"
    fi
}

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
info "Pre-flight checks..."

if [[ -n "${SSH_PASSWORD:-}" ]]; then
    command -v sshpass >/dev/null 2>&1 || die "sshpass is required when SSH_PASSWORD is set"
fi

if [[ -n "${SSH_KEY:-}" && ! -f "${SSH_KEY}" ]]; then
    die "SSH key not found: ${SSH_KEY}"
fi

command -v rsync >/dev/null 2>&1 || die "rsync is not installed locally"

# Test SSH connectivity
remote "echo ok" >/dev/null 2>&1 || die "Cannot SSH to ${REMOTE_USER}@${REMOTE_HOST}"
success "SSH connection to ${REMOTE_HOST} verified"

# Verify docker is available on the remote host
remote "docker info >/dev/null 2>&1" || die "docker is not available on the remote host"
success "Remote docker verified"

# Detect remote architecture
REMOTE_ARCH=$(remote "uname -m")
case "$REMOTE_ARCH" in
    x86_64)  PLATFORM="linux/amd64" ;;
    aarch64) PLATFORM="linux/arm64" ;;
    *)       PLATFORM="linux/amd64" ; warn "Unknown arch '${REMOTE_ARCH}', defaulting to linux/amd64" ;;
esac
info "Detected remote architecture: ${REMOTE_ARCH} → ${PLATFORM}"

# ---------------------------------------------------------------------------
# Step 1: Generate .env.production if it does not exist
# ---------------------------------------------------------------------------
if [[ ! -f "${SCRIPT_DIR}/.env.production" ]]; then
    info "Generating .env.production with fresh secrets..."
    AUTH_SECRET=$(openssl rand -base64 32)
    JUDGE_AUTH_TOKEN=$(openssl rand -hex 32)
    PLUGIN_CONFIG_ENCRYPTION_KEY=$(openssl rand -hex 32)
    AUTH_URL_VALUE="${AUTH_URL_OVERRIDE:-https://${DOMAIN}}"
    cat > "${SCRIPT_DIR}/.env.production" <<EOF
# Auto-generated by deploy-docker.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)
AUTH_SECRET=${AUTH_SECRET}
AUTH_URL=${AUTH_URL_VALUE}
AUTH_TRUST_HOST=true
DB_DIALECT=postgresql
DATABASE_URL=postgres://judgekit:\${POSTGRES_PASSWORD}@db:5432/judgekit
POSTGRES_PASSWORD=$(openssl rand -hex 32)
PLUGIN_CONFIG_ENCRYPTION_KEY=${PLUGIN_CONFIG_ENCRYPTION_KEY}
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
EOF
    success "Generated .env.production with fresh secrets"
else
    info "Using existing .env.production"
fi

# ---------------------------------------------------------------------------
# Step 1b: Backfill missing required secrets in the remote .env.production
#
# Some env vars were added after older deployments were first provisioned
# (notably PLUGIN_CONFIG_ENCRYPTION_KEY for API key / plugin secret
# encryption). Redeploys without a manual edit would leave the app running
# with a missing secret and crash at first use. Backfill a random value if
# the key is missing on the remote — the value is stable as long as it's
# not deleted, so an accidental re-run does NOT rotate it.
# ---------------------------------------------------------------------------
info "Ensuring required secrets exist in remote .env.production..."
REMOTE_ENV_FILE="${REMOTE_DIR}/.env.production"
ensure_env_secret() {
  local key="$1"
  local generator="$2"
  if remote "test -f ${REMOTE_ENV_FILE} && grep -q '^${key}=' ${REMOTE_ENV_FILE}"; then
    return 0
  fi
  if ! remote "test -f ${REMOTE_ENV_FILE}"; then
    return 0
  fi
  local value
  value=$(openssl rand -hex 32)
  if [[ "$generator" == "base64" ]]; then
    value=$(openssl rand -base64 32)
  fi
  info "Backfilling missing ${key} in ${REMOTE_ENV_FILE}"
  remote "printf '\n%s=%s\n' '${key}' '${value}' >> ${REMOTE_ENV_FILE} && chmod 600 ${REMOTE_ENV_FILE}" \
    || warn "Failed to backfill ${key} — please add it manually before the app starts"
}
ensure_env_secret PLUGIN_CONFIG_ENCRYPTION_KEY hex

# ---------------------------------------------------------------------------
# Step 2: Sync source code to remote host
# ---------------------------------------------------------------------------
info "Syncing source code to ${REMOTE_HOST}:${REMOTE_DIR}..."
remote "mkdir -p ${REMOTE_DIR}"

remote_rsync -az --delete \
    --exclude='node_modules/' \
    --exclude='.next/' \
    --exclude='.git/' \
    --exclude='data/' \
    --exclude='.env*' \
    --exclude='*.db' \
    --exclude='judge-worker-rs/target/' \
    --exclude='rate-limiter-rs/target/' \
    --exclude='code-similarity-rs/target/' \
    --exclude='.omc/' \
    --exclude='.omx/' \
    --exclude='.claude/' \
    --exclude='.agent/' \
    --exclude='.sisyphus/' \
    --exclude='tests/' \
    --exclude='.playwright/' \
    --exclude='backups/' \
    --exclude='._*' \
    "${SCRIPT_DIR}/" \
    "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/"

# Only transfer .env.production if the remote does not already have one.
# Each target has its own secrets (AUTH_SECRET, JUDGE_AUTH_TOKEN, AUTH_URL).
# Overwriting would break the target's auth configuration.
if remote "test -f ${REMOTE_DIR}/.env.production" 2>/dev/null; then
    info "Remote .env.production exists — preserving (delete it manually to regenerate)"
else
    info "Transferring .env.production (first deploy)..."
    remote_copy "${SCRIPT_DIR}/.env.production" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/.env.production"
fi

success "Source code synced to remote"

# ---------------------------------------------------------------------------
# Step 3: Build Docker images on the remote host
# ---------------------------------------------------------------------------
if [[ "$SKIP_BUILD" == false ]]; then
    EXTRA_BUILD_ARGS=""
    if [[ "${DISABLE_MINIFY:-0}" == "1" ]]; then
        EXTRA_BUILD_ARGS="--build-arg DISABLE_MINIFY=1"
        info "Minification DISABLED (DISABLE_MINIFY=1)"
    fi

    info "Building app image on ${REMOTE_HOST} (judgekit-app:latest) [${PLATFORM}]..."
    remote "cd ${REMOTE_DIR} && docker build --no-cache --platform ${PLATFORM} ${EXTRA_BUILD_ARGS} -t judgekit-app:latest -f Dockerfile ."
    success "App image built on remote"

    if [[ "${BUILD_WORKER_IMAGE}" == "true" ]]; then
        info "Building judge worker image on ${REMOTE_HOST} (judgekit-judge-worker:latest) [${PLATFORM}]..."
        remote "cd ${REMOTE_DIR} && docker build --no-cache --platform ${PLATFORM} -t judgekit-judge-worker:latest -f Dockerfile.judge-worker ."
        success "Judge worker image built on remote"
    else
        info "Skipping judge worker image build (BUILD_WORKER_IMAGE=${BUILD_WORKER_IMAGE}, INCLUDE_WORKER=${INCLUDE_WORKER})"
    fi

    info "Building code-similarity image on ${REMOTE_HOST} (judgekit-code-similarity:latest) [${PLATFORM}]..."
    remote "cd ${REMOTE_DIR} && docker build --platform ${PLATFORM} -t judgekit-code-similarity:latest -f Dockerfile.code-similarity ."
    success "Code similarity image built on remote"

    info "Building rate-limiter image on ${REMOTE_HOST} (judgekit-rate-limiter:latest) [${PLATFORM}]..."
    remote "cd ${REMOTE_DIR} && docker build --platform ${PLATFORM} -t judgekit-rate-limiter:latest -f Dockerfile.rate-limiter-rs ."
    success "Rate limiter image built on remote"

    if [[ "$SKIP_LANGUAGES" == false ]]; then
        if [[ -n "$LANGUAGE_FILTER" ]]; then
            LANGS_TO_BUILD=$(resolve_languages "$LANGUAGE_FILTER")
            if [[ -z "$LANGS_TO_BUILD" ]]; then
                info "No languages selected (--languages=none), skipping language builds"
            else
                LANG_COUNT=$(echo $LANGS_TO_BUILD | wc -w | tr -d ' ')
                info "Building ${LANG_COUNT} judge language images on ${REMOTE_HOST} [${PLATFORM}]..."
                for lang in $LANGS_TO_BUILD; do
                    info "  Building judge-${lang}..."
                    remote "cd ${REMOTE_DIR} && docker build --platform ${PLATFORM} -t judge-${lang} -f docker/Dockerfile.judge-${lang} ."
                done
                success "Selected judge language images built on remote"
            fi
        else
            info "Building all judge language images on ${REMOTE_HOST} [${PLATFORM}]..."
            remote "cd ${REMOTE_DIR} && (DOCKER_DEFAULT_PLATFORM=${PLATFORM} docker compose -f docker-compose.yml build 2>/dev/null || \
                DOCKER_DEFAULT_PLATFORM=${PLATFORM} docker-compose -f docker-compose.yml build)"
            success "Judge language images built on remote"
        fi
    fi
else
    info "Skipping image build (--skip-build)"
fi

# Clean up stale (dangling) images from previous builds — keeps :latest tagged images
info "Removing stale worker images from previous builds..."
remote "docker image prune -f" >/dev/null 2>&1 || true
success "Stale images cleaned up"

# ---------------------------------------------------------------------------
# Step 4: Set up docker-compose config on remote
# ---------------------------------------------------------------------------
info "Setting up docker-compose config on remote..."
remote "cp -f ${REMOTE_DIR}/docker-compose.production.yml ${REMOTE_DIR}/docker-compose.yml.deploy 2>/dev/null || true"
success "Config ready"

# ---------------------------------------------------------------------------
# Step 4b: Pre-deploy database backup (safety net against wipes)
#
# Every deploy captures a custom-format pg_dump of the current database before
# touching containers. Dumps land in ~/backups/ on the remote and are kept for
# BACKUP_RETAIN_DAYS days. Skipped automatically on first-time deploys when no
# container is running yet.
# ---------------------------------------------------------------------------
BACKUP_RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-30}"
if remote "docker inspect judgekit-db >/dev/null 2>&1 && docker inspect --format='{{.State.Running}}' judgekit-db 2>/dev/null | grep -q true"; then
    info "Backing up existing database before deploy..."
    BACKUP_TS=$(date -u +%Y%m%d-%H%M%SZ)
    BACKUP_NAME="judgekit-predeploy-${BACKUP_TS}.dump"
    if remote "mkdir -p /home/${REMOTE_USER}/backups && \
        PG_PASS=\$(grep '^POSTGRES_PASSWORD=' ${REMOTE_DIR}/.env.production | cut -d= -f2-) && \
        docker exec -e PGPASSWORD=\"\${PG_PASS}\" judgekit-db pg_dump -U judgekit -d judgekit --format=custom --compress=9 -f /tmp/${BACKUP_NAME} && \
        docker cp judgekit-db:/tmp/${BACKUP_NAME} /home/${REMOTE_USER}/backups/${BACKUP_NAME} && \
        docker exec judgekit-db rm -f /tmp/${BACKUP_NAME}"; then
        success "Pre-deploy backup saved: ~/backups/${BACKUP_NAME}"
        # Retention: delete dumps older than BACKUP_RETAIN_DAYS
        remote "find /home/${REMOTE_USER}/backups -maxdepth 1 -name 'judgekit-predeploy-*.dump' -mtime +${BACKUP_RETAIN_DAYS} -delete 2>/dev/null || true"
    else
        warn "Pre-deploy backup FAILED. Aborting deploy — run the deploy again once the database is reachable, or override with SKIP_PREDEPLOY_BACKUP=1"
        if [[ "${SKIP_PREDEPLOY_BACKUP:-0}" != "1" ]]; then
            die "Pre-deploy backup is required. Set SKIP_PREDEPLOY_BACKUP=1 to bypass at your own risk."
        fi
    fi
else
    info "No running judgekit-db detected — skipping pre-deploy backup (first deploy or db already stopped)"
fi

# ---------------------------------------------------------------------------
# Step 4c: PG volume safety check (see scripts/pg-volume-safety-check.sh)
#
# Detects the "anonymous pgdata volume" orphan-data scenario before we stop
# the database container. If the real cluster is in an anonymous volume (old
# compose behavior) and the named volume is empty, the next `docker compose
# up` would silently initdb a fresh cluster and lose all data. Set
# SKIP_PG_VOLUME_CHECK=1 to bypass; AUTO_MIGRATE_ORPHANED_PGDATA=1 to auto-
# migrate (after taking a tar + pg_dump snapshot).
# ---------------------------------------------------------------------------
if [[ "${SKIP_PG_VOLUME_CHECK:-0}" == "1" ]]; then
    warn "SKIP_PG_VOLUME_CHECK=1 set — skipping orphan-volume safety check"
else
    SAFETY_ARGS=""
    if [[ "${AUTO_MIGRATE_ORPHANED_PGDATA:-0}" == "1" ]]; then
        SAFETY_ARGS="--auto-migrate"
    fi
    info "Running PostgreSQL volume safety check on remote..."
    # The script is already rsynced to the remote in step 2. Run it there so
    # it can inspect docker on the actual host. Non-zero exit (except 2 = no
    # db container) aborts the deploy.
    set +e
    remote "bash ${REMOTE_DIR}/scripts/pg-volume-safety-check.sh ${SAFETY_ARGS}"
    SAFETY_RC=$?
    set -e
    case "$SAFETY_RC" in
      0) success "Safety check passed (named volume is authoritative)" ;;
      2) info "Safety check: no existing db container (first deploy)" ;;
      1)
        die "PG volume safety check FAILED — deploy aborted to protect the data. \
Read the recovery instructions printed above, re-run with \
AUTO_MIGRATE_ORPHANED_PGDATA=1 to auto-migrate, or \
SKIP_PG_VOLUME_CHECK=1 to bypass at your own risk."
        ;;
      *)
        die "PG volume safety check exited with unexpected code ${SAFETY_RC} — aborting"
        ;;
    esac
fi

# ---------------------------------------------------------------------------
# Step 5: Stop old containers, start DB first, migrate, then start all
# ---------------------------------------------------------------------------
info "Stopping existing containers (if any)..."
remote "cd ${REMOTE_DIR} && cp -f .env.production .env && (docker compose -f docker-compose.production.yml --profile worker down --remove-orphans 2>/dev/null || docker-compose -f docker-compose.production.yml --profile worker down --remove-orphans 2>/dev/null || true)"

# 5a. Start only the database container
info "Starting database container..."
remote "cd ${REMOTE_DIR} && (docker compose -f docker-compose.production.yml --env-file .env.production up -d db 2>/dev/null || docker-compose -f docker-compose.production.yml --env-file .env.production up -d db)"

info "Waiting for database to be healthy..."
for i in $(seq 1 30); do
    if remote "docker inspect --format='{{.State.Health.Status}}' judgekit-db 2>/dev/null" | grep -q "healthy"; then
        break
    fi
    if [[ $i -eq 30 ]]; then
        warn "Database did not become healthy in 30s — attempting migration anyway"
    fi
    sleep 1
done
success "Database is ready"

# ---------------------------------------------------------------------------
# Step 6: Run database migrations before starting the app
# ---------------------------------------------------------------------------
info "Running database migrations (drizzle-kit push)..."

# Determine the Docker network name (compose project name + _default)
NETWORK_NAME=$(remote "docker network ls --format '{{.Name}}' | grep judgekit | head -1" 2>/dev/null)
NETWORK_NAME="${NETWORK_NAME:-judgekit_default}"

# Run drizzle-kit push via a temporary Node container connected to the DB network.
# This uses the source code already synced to the remote host (has drizzle.config.ts + schema).
remote "PG_PASS=\$(grep '^POSTGRES_PASSWORD=' ${REMOTE_DIR}/.env.production | cut -d= -f2-) && \
    export POSTGRES_PASSWORD=\"\${PG_PASS}\" && \
    export PGPASSWORD=\"\${PG_PASS}\" && \
    export DATABASE_URL=\"postgres://judgekit:\${PG_PASS}@db:5432/judgekit\" && \
    docker run --rm \
      --network ${NETWORK_NAME} \
      -v ${REMOTE_DIR}:/app -w /app \
      -e POSTGRES_PASSWORD -e PGPASSWORD -e DATABASE_URL \
      node:24-alpine \
      sh -c 'npx drizzle-kit push'" 2>&1 || \
  warn "drizzle-kit push failed — may need manual intervention"
success "Database migrated"

# Apply additive schema repairs for columns that may be missing on older
# PostgreSQL deployments even when drizzle-kit push reports no diff.
info "Applying additive PostgreSQL schema repairs..."
remote "PG_PASS=\$(grep '^POSTGRES_PASSWORD=' ${REMOTE_DIR}/.env.production | cut -d= -f2-) && \
    export POSTGRES_PASSWORD=\"\${PG_PASS}\" && \
    export PGPASSWORD=\"\${PG_PASS}\" && \
    export DATABASE_URL=\"postgres://judgekit:\${PG_PASS}@db:5432/judgekit\" && \
    docker run --rm \
    --network ${NETWORK_NAME} \
    -e POSTGRES_PASSWORD -e PGPASSWORD -e DATABASE_URL \
    postgres:18-alpine \
    psql -h db -U judgekit -d judgekit <<'SQL'
ALTER TABLE problems ADD COLUMN IF NOT EXISTS default_language text;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS default_language text;
SQL" >/dev/null
success "Schema repairs applied"

# Run ANALYZE to ensure query planner has fresh statistics
info "Running ANALYZE on database..."
remote "PG_PASS=\$(grep '^POSTGRES_PASSWORD=' ${REMOTE_DIR}/.env.production | cut -d= -f2-) && \
    export POSTGRES_PASSWORD=\"\${PG_PASS}\" && \
    export PGPASSWORD=\"\${PG_PASS}\" && \
    export DATABASE_URL=\"postgres://judgekit:\${PG_PASS}@db:5432/judgekit\" && \
    docker run --rm \
    --network ${NETWORK_NAME} \
    -e POSTGRES_PASSWORD -e PGPASSWORD -e DATABASE_URL \
    postgres:18-alpine \
    psql -h db -U judgekit -d judgekit -c 'ANALYZE;'" 2>&1 || true
success "Database statistics updated"

# 6b. Now start all remaining containers
COMPOSE_PROFILE_FLAG=""
if [[ "${INCLUDE_WORKER}" == "true" ]]; then
    COMPOSE_PROFILE_FLAG="--profile worker"
    info "Starting all containers (with local judge worker)..."
else
    info "Starting all containers (no local judge worker — use remote workers)..."
fi
remote "cd ${REMOTE_DIR} && (docker compose -f docker-compose.production.yml ${COMPOSE_PROFILE_FLAG} --env-file .env.production up -d 2>/dev/null || docker-compose -f docker-compose.production.yml ${COMPOSE_PROFILE_FLAG} --env-file .env.production up -d)"

info "Waiting for app container to be healthy..."
for i in $(seq 1 60); do
    if remote "docker inspect --format='{{.State.Health.Status}}' judgekit-app 2>/dev/null" | grep -q "healthy"; then
        break
    fi
    if [[ $i -eq 60 ]]; then
        warn "App container did not become healthy in 60s — check logs"
    fi
    sleep 1
done
success "All containers started"

# ---------------------------------------------------------------------------
# Step 7: Set up nginx reverse proxy
# ---------------------------------------------------------------------------
info "Configuring nginx reverse proxy for ${DOMAIN}..."
USE_TLS=false
if remote_sudo "test -f /etc/letsencrypt/live/${DOMAIN}/fullchain.pem -a -f /etc/letsencrypt/live/${DOMAIN}/privkey.pem" 2>/dev/null; then
    USE_TLS=true
    info "Detected existing TLS certificate for ${DOMAIN}; generating HTTPS nginx config"
else
    info "No TLS certificate detected for ${DOMAIN}; generating HTTP-only nginx config"
fi

AUTH_URL_TARGET="${AUTH_URL_OVERRIDE:-$([ "${USE_TLS}" = "true" ] && echo "https://${DOMAIN}" || echo "http://${DOMAIN}")}"
remote "sed -i 's|^AUTH_URL=.*|AUTH_URL=${AUTH_URL_TARGET}|' ${REMOTE_DIR}/.env.production" 2>/dev/null || true

# Write nginx config to /tmp first (avoids heredoc + sudo + tee issues)
if [[ "${USE_TLS}" == "true" ]]; then
cat > /tmp/judgekit-nginx.conf <<NGINX_EOF
server_tokens off;

map \$http_upgrade \$connection_upgrade {
    default upgrade;
    '' close;
}

limit_req_zone \$binary_remote_addr zone=judgekit_login:10m rate=5r/s;
limit_req_zone \$binary_remote_addr zone=judgekit_judge:1m rate=10r/s;

server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    return 301 https://${DOMAIN}\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN};

    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 50M;

    location /api/auth/ {
        limit_req zone=judgekit_login burst=10 nodelay;
        client_max_body_size 1m;
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # NOTE: Do NOT set X-Forwarded-Host — it breaks Next.js 16 RSC client-side navigation
    }

    location /api/v1/judge/ {
        limit_req zone=judgekit_judge burst=20 nodelay;
        client_max_body_size 1m;
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # NOTE: Do NOT set X-Forwarded-Host — it breaks Next.js 16 RSC client-side navigation
    }

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # NOTE: Do NOT set X-Forwarded-Host — it breaks Next.js 16 RSC client-side navigation
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX_EOF
else
cat > /tmp/judgekit-nginx.conf <<NGINX_EOF
server_tokens off;

map \$http_upgrade \$connection_upgrade {
    default upgrade;
    '' close;
}

limit_req_zone \$binary_remote_addr zone=judgekit_login:10m rate=5r/s;
limit_req_zone \$binary_remote_addr zone=judgekit_judge:1m rate=10r/s;

server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    client_max_body_size 50M;

    location /api/auth/ {
        limit_req zone=judgekit_login burst=10 nodelay;
        client_max_body_size 1m;
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # NOTE: Do NOT set X-Forwarded-Host — it breaks Next.js 16 RSC client-side navigation
    }

    location /api/v1/judge/ {
        limit_req zone=judgekit_judge burst=20 nodelay;
        client_max_body_size 1m;
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # NOTE: Do NOT set X-Forwarded-Host — it breaks Next.js 16 RSC client-side navigation
    }

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # NOTE: Do NOT set X-Forwarded-Host — it breaks Next.js 16 RSC client-side navigation
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX_EOF
fi

# Transfer nginx config via scp, then sudo copy into place
remote_copy /tmp/judgekit-nginx.conf "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/nginx-judgekit.conf"
remote_sudo "cp ${REMOTE_DIR}/nginx-judgekit.conf /etc/nginx/sites-available/judgekit"
remote_sudo "ln -sf /etc/nginx/sites-available/judgekit /etc/nginx/sites-enabled/judgekit"
rm -f /tmp/judgekit-nginx.conf

# Test and reload nginx
if remote_sudo "nginx -t 2>&1"; then
    remote_sudo "systemctl reload nginx"
    success "Nginx configured and reloaded for ${DOMAIN}"
else
    warn "Nginx config test failed — check manually on the remote host"
fi

# ---------------------------------------------------------------------------
# Step 8: Verify deployment
# ---------------------------------------------------------------------------
info "Verifying deployment..."
sleep 3

HTTP_CODE=$(remote "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${APP_PORT}" 2>/dev/null || echo "000")
if [[ "$HTTP_CODE" =~ ^(200|302|308)$ ]]; then
    success "JudgeKit is responding (HTTP ${HTTP_CODE})"
else
    warn "App returned HTTP ${HTTP_CODE} — it may still be starting up"
    warn "Check logs: ssh ${REMOTE_USER}@${REMOTE_HOST} 'cd ${REMOTE_DIR} && docker compose -f docker-compose.production.yml logs -f'"
fi

if [[ "${USE_TLS}" == "true" ]]; then
    HTTPS_CODE=$(curl -k -s -o /dev/null -w "%{http_code}" "https://${DOMAIN}/login" || true)
    if [[ "${HTTPS_CODE}" =~ ^(200|302|308)$ ]]; then
        success "HTTPS endpoint verified (HTTP ${HTTPS_CODE})"
    else
        warn "HTTPS endpoint returned HTTP ${HTTPS_CODE} — check TLS/nginx configuration"
    fi
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "==========================================================================="
success "Deployment complete!"
echo "==========================================================================="
if [[ "${USE_TLS}" == "true" ]]; then
    info "URL:        https://${DOMAIN}"
else
    info "URL:        http://${DOMAIN}"
fi
info "Remote dir: ${REMOTE_DIR}"
info "Logs:       ssh ${REMOTE_USER}@${REMOTE_HOST} 'cd ${REMOTE_DIR} && docker compose -f docker-compose.production.yml logs -f'"
info "Seed admin: ssh ${REMOTE_USER}@${REMOTE_HOST} 'docker exec -it judgekit-app node scripts/seed.ts'"
info "Restart:    ssh ${REMOTE_USER}@${REMOTE_HOST} 'cd ${REMOTE_DIR} && docker compose -f docker-compose.production.yml --env-file .env.production restart'"
echo "==========================================================================="
