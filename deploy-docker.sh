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
#   REMOTE_HOST     — Target host IP or hostname (required, see ENV.md)
#   REMOTE_USER     — Target SSH user (required, see ENV.md)
#   DOMAIN          — Target domain name (required, see ENV.md)
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
REMOTE_HOST="${REMOTE_HOST:?REMOTE_HOST is required (see ENV.md)}"
REMOTE_USER="${REMOTE_USER:?REMOTE_USER is required (see ENV.md)}"
REMOTE_DIR="/home/${REMOTE_USER}/judgekit"
DOMAIN="${DOMAIN:?DOMAIN is required (see ENV.md)}"
APP_PORT=3100
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Language presets
CORE_LANGS="cpp python jvm"
POPULAR_LANGS="$CORE_LANGS node rust go"
EXTENDED_LANGS="$POPULAR_LANGS ruby lua bash csharp php perl swift r haskell dart zig"
ALL_LANGS="cpp clang python node jvm rust go swift csharp r perl php ruby lua haskell dart zig nim ocaml elixir julia d racket v fortran pascal cobol brainfuck scala erlang commonlisp bash esoteric ada clojure prolog tcl awk scheme groovy octave crystal powershell postscript fsharp apl freebasic smalltalk b nasm bqn lolcode forth algol68 umjunsik haxe raku shakespeare snobol4 icon uiua odin objective-c deno bun gleam sml micropython squirrel rexx hy arturo janet c3 vala nelua hare koka lean picat mercury wat purescript modula2 factor minizinc curry clean roc carp grain pony"

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
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=true ;;
    --skip-languages) SKIP_LANGUAGES=true ;;
    --languages=*) LANGUAGE_FILTER="${arg#--languages=}" ;;
    --help|-h)
      echo "Usage: $0 [--skip-build] [--skip-languages] [--languages=<preset|lang,lang,...>]"
      echo ""
      echo "Language presets: core, popular, extended, all, none"
      echo "  core     — C/C++, Python, Java/Kotlin (~1.2 GB)"
      echo "  popular  — Core + Node.js, Rust, Go (~4 GB)"
      echo "  extended — Popular + Ruby, Lua, Bash, C#, PHP, Perl, Swift, R, Haskell, Dart, Zig (~12 GB)"
      echo "  all      — All 69 language images (~30 GB)"
      echo "  none     — Skip language image builds"
      exit 0
      ;;
  esac
done

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

# Source SSH_PASSWORD from proxmox-ops .env if available
if [[ -z "${SSH_PASSWORD:-}" && -f "${SCRIPT_DIR}/../proxmox-ops/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "${SCRIPT_DIR}/../proxmox-ops/.env"
    set +a
fi

SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR"
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
        sshpass -p "$SSH_PASSWORD" rsync -e "ssh $SSH_OPTS" "$@"
    else
        rsync -e "ssh $SSH_OPTS" "$@"
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
    cat > "${SCRIPT_DIR}/.env.production" <<EOF
# Auto-generated by deploy-docker.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)
AUTH_SECRET=${AUTH_SECRET}
AUTH_URL=http://${DOMAIN}
AUTH_TRUST_HOST=true
DATABASE_PATH=/app/data/judge.db
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
    --exclude='.omc/' \
    --exclude='.claude/' \
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
    # Patch AUTH_URL to match the target domain (local .env.production may have a different domain)
    remote "sed -i 's|^AUTH_URL=.*|AUTH_URL=http://${DOMAIN}|' ${REMOTE_DIR}/.env.production" 2>/dev/null || true
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

    info "Building judge worker image on ${REMOTE_HOST} (judgekit-judge-worker:latest) [${PLATFORM}]..."
    remote "cd ${REMOTE_DIR} && docker build --no-cache --platform ${PLATFORM} -t judgekit-judge-worker:latest -f Dockerfile.judge-worker ."
    success "Judge worker image built on remote"

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

# ---------------------------------------------------------------------------
# Step 4: Set up docker-compose config on remote
# ---------------------------------------------------------------------------
info "Setting up docker-compose config on remote..."
remote "cp -f ${REMOTE_DIR}/docker-compose.production.yml ${REMOTE_DIR}/docker-compose.yml.deploy 2>/dev/null || true"
success "Config ready"

# ---------------------------------------------------------------------------
# Step 5: Stop old containers and start new ones
# ---------------------------------------------------------------------------
info "Stopping existing containers (if any)..."
remote "cd ${REMOTE_DIR} && cp -f .env.production .env && (docker compose -f docker-compose.production.yml down --remove-orphans 2>/dev/null || docker-compose -f docker-compose.production.yml down --remove-orphans 2>/dev/null || true)"

info "Starting containers..."
remote "cd ${REMOTE_DIR} && (docker compose -f docker-compose.production.yml --env-file .env.production up -d 2>/dev/null || docker-compose -f docker-compose.production.yml --env-file .env.production up -d)"
success "Containers started"

# ---------------------------------------------------------------------------
# Step 6: Run database migrations
# ---------------------------------------------------------------------------
info "Waiting for app container to be healthy..."
for i in $(seq 1 30); do
    if remote "docker inspect --format='{{.State.Health.Status}}' judgekit-app 2>/dev/null" | grep -q "healthy"; then
        break
    fi
    if [[ $i -eq 30 ]]; then
        warn "App container did not become healthy in 30s — attempting migration anyway"
    fi
    sleep 1
done

info "Running database migrations..."
remote "docker exec judgekit-app node -e \"
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const db = new Database('/app/data/judge.db');
db.pragma('busy_timeout = 5000');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
const migrationsDir = '/app/drizzle';
const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
for (const file of files) {
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  const stmts = sql.split('--> statement-breakpoint');
  for (const stmt of stmts) {
    const trimmed = stmt.trim();
    if (trimmed) {
      try { db.exec(trimmed); } catch(e) { /* ignore already exists */ }
    }
  }
}
db.close();
console.log('Migration complete: ' + files.length + ' files processed');
\""
success "Database migrated"

# ---------------------------------------------------------------------------
# Step 7: Set up nginx reverse proxy
# ---------------------------------------------------------------------------
info "Configuring nginx reverse proxy for ${DOMAIN}..."
SUDO_CMD="sudo"
if [[ -n "${SSH_PASSWORD:-}" ]]; then
    SUDO_CMD="echo '${SSH_PASSWORD}' | sudo -S"
fi

# Write nginx config to /tmp first (avoids heredoc + sudo + tee issues)
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
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # NOTE: Do NOT set X-Forwarded-Host — it breaks Next.js 16 RSC client-side navigation
    }

    location /api/v1/judge/ {
        limit_req zone=judgekit_judge burst=20 nodelay;
        client_max_body_size 1m;
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # NOTE: Do NOT set X-Forwarded-Host — it breaks Next.js 16 RSC client-side navigation
    }

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # NOTE: Do NOT set X-Forwarded-Host — it breaks Next.js 16 RSC client-side navigation
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX_EOF

# Transfer nginx config via scp, then sudo copy into place
remote_copy /tmp/judgekit-nginx.conf "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/nginx-judgekit.conf"
remote "bash -c '${SUDO_CMD} cp ${REMOTE_DIR}/nginx-judgekit.conf /etc/nginx/sites-available/judgekit'"
remote "bash -c '${SUDO_CMD} ln -sf /etc/nginx/sites-available/judgekit /etc/nginx/sites-enabled/judgekit'"
rm -f /tmp/judgekit-nginx.conf

# Test and reload nginx
if remote "bash -c '${SUDO_CMD} nginx -t 2>&1'"; then
    remote "bash -c '${SUDO_CMD} systemctl reload nginx'"
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

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "==========================================================================="
success "Deployment complete!"
echo "==========================================================================="
info "URL:        http://${DOMAIN}"
info "Remote dir: ${REMOTE_DIR}"
info "Logs:       ssh ${REMOTE_USER}@${REMOTE_HOST} 'cd ${REMOTE_DIR} && docker compose -f docker-compose.production.yml logs -f'"
info "Seed admin: ssh ${REMOTE_USER}@${REMOTE_HOST} 'docker exec -it judgekit-app node scripts/seed.ts'"
info "Restart:    ssh ${REMOTE_USER}@${REMOTE_HOST} 'cd ${REMOTE_DIR} && docker compose -f docker-compose.production.yml --env-file .env.production restart'"
echo "==========================================================================="
